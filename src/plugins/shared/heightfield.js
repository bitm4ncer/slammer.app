// Surface Pack — shared heightfield infrastructure.
//
// All Surface-Pack effects (Plastic, Holographic Foil, Liquid Chrome, 3D)
// share the same upstream pipeline:
//
//   ImageData ──► extractHeightmap (channel + downsample)
//             ──► gaussianBlurSeparable (smoothness)
//             ──► computeNormals (Sobel gradient → unit normals)
//             ──► sampleNormal (bilinear lookup at full-res output coords)
//
// Shading is the only thing that differs per effect — Plastic uses
// Blinn-Phong, Foil samples a thin-film LUT, Chrome reflects an env map,
// 3D layers multi-light support on top. Keeping the heightfield math here
// means each effect file stays focused on its own shading function.
//
// Performance: heightmap is downsampled (default ≤ 1024 px on the longer
// axis) so the Gaussian pre-blur — the dominant cost — runs over a small
// buffer. Normals are sampled bilinearly when shading at full resolution,
// which keeps the bump silhouette smooth without re-running the blur per
// frame. Typical 2000 × 2000 input → ~120 ms first run, < 30 ms on
// re-shade with cached heightmap (caching is the effect's job, not ours).

/**
 * Extract a Float32 heightmap from one channel of an ImageData buffer,
 * optionally downsampling so the longer axis ≤ maxSide.
 * Returns { map, w, h, scale } where `scale = downsampledW / sourceW`.
 *
 * @param {Uint8ClampedArray} src   - flat RGBA buffer
 * @param {number}            W,H   - source dimensions
 * @param {'luma'|'alpha'|'red'} channel
 * @param {number}            maxSide  - downsample cap (default 1024)
 */
export function extractHeightmap(src, W, H, channel = 'luma', maxSide = 1024) {
  const offset = channel === 'alpha' ? 3 : channel === 'red' ? 0 : -1; // -1 → luma

  let scale = 1;
  let dW = W, dH = H;
  if (Math.max(W, H) > maxSide) {
    scale = maxSide / Math.max(W, H);
    dW = Math.max(1, Math.round(W * scale));
    dH = Math.max(1, Math.round(H * scale));
  }
  const map = new Float32Array(dW * dH);

  if (scale === 1) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const si = (row + x) * 4;
        const v = offset >= 0
          ? src[si + offset]
          : (0.2126 * src[si] + 0.7152 * src[si + 1] + 0.0722 * src[si + 2]);
        map[row + x] = v / 255;
      }
    }
    return { map, w: W, h: H, scale: 1 };
  }

  // Box-filter downsample. Each destination pixel averages the source
  // pixels covered by its inverse-scaled cell. Keeps fine detail away from
  // the heightmap so the blur doesn't need to wash out high frequencies.
  const inv = 1 / scale;
  for (let dy = 0; dy < dH; dy++) {
    const sy0 = Math.floor(dy * inv);
    const sy1 = Math.min(H, Math.ceil((dy + 1) * inv));
    for (let dx = 0; dx < dW; dx++) {
      const sx0 = Math.floor(dx * inv);
      const sx1 = Math.min(W, Math.ceil((dx + 1) * inv));
      let sum = 0, count = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        const row = yy * W;
        for (let xx = sx0; xx < sx1; xx++) {
          const si = (row + xx) * 4;
          const v = offset >= 0
            ? src[si + offset]
            : (0.2126 * src[si] + 0.7152 * src[si + 1] + 0.0722 * src[si + 2]);
          sum += v;
          count++;
        }
      }
      map[dy * dW + dx] = count > 0 ? sum / count / 255 : 0;
    }
  }
  return { map, w: dW, h: dH, scale };
}

/**
 * Separable Gaussian blur over a Float32 heightmap. Two passes (h then v)
 * with a clamped kernel; out-of-bounds taps clamp to the edge so the blur
 * doesn't darken near the borders.
 */
export function gaussianBlurSeparable(map, w, h, radius) {
  if (radius < 0.5) return map;
  const r = Math.max(1, Math.round(radius));
  const sigma = Math.max(0.5, radius / 2);
  const kSize = 2 * r + 1;
  const kernel = new Float32Array(kSize);
  let ksum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = v;
    ksum += v;
  }
  for (let i = 0; i < kSize; i++) kernel[i] /= ksum;

  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        acc += map[row + xx] * kernel[k + r];
      }
      tmp[row + x] = acc;
    }
  }

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        acc += tmp[yy * w + x] * kernel[k + r];
      }
      out[row + x] = acc;
    }
  }
  return out;
}

/**
 * Sobel-style gradient → per-pixel surface normal.
 * `bumpHeight` scales the gradient before the unit-vector step; higher
 * values steepen the bump, lower values flatten the surface to nearly
 * (0, 0, 1). Returns three parallel Float32Arrays.
 */
export function computeNormals(map, w, h, bumpHeight = 1) {
  const nx = new Float32Array(w * h);
  const ny = new Float32Array(w * h);
  const nz = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const yU = y - 1 < 0 ? 0 : y - 1;
    const yD = y + 1 >= h ? h - 1 : y + 1;
    const rowU = yU * w;
    const rowD = yD * w;
    const rowM = y  * w;
    for (let x = 0; x < w; x++) {
      const xL = x - 1 < 0 ? 0 : x - 1;
      const xR = x + 1 >= w ? w - 1 : x + 1;
      const tl = map[rowU + xL], tm = map[rowU + x], tr = map[rowU + xR];
      const ml = map[rowM + xL],                     mr = map[rowM + xR];
      const bl = map[rowD + xL], bm = map[rowD + x], br = map[rowD + xR];
      const gx = (-tl - 2 * ml - bl + tr + 2 * mr + br) * bumpHeight;
      const gy = (-tl - 2 * tm - tr + bl + 2 * bm + br) * bumpHeight;
      // Normal pointing AWAY from the gradient, with z = 1.
      const dx = -gx, dy = -gy, dz = 1;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const i = rowM + x;
      nx[i] = dx / len;
      ny[i] = dy / len;
      nz[i] = dz / len;
    }
  }
  return { nx, ny, nz };
}

/**
 * Bilinear-sample a normal at a sub-pixel position in the downsampled
 * normal map. Re-normalises the interpolated vector so the shading stays
 * unit-length. The output is sampled at full-resolution shading time —
 * the normal map itself stays at the downsampled grid.
 */
export function sampleNormal(nx, ny, nz, w, h, x, y) {
  const xi = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
  const yi = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
  const x0 = Math.floor(xi);
  const y0 = Math.floor(yi);
  const x1 = x0 + 1 >= w ? w - 1 : x0 + 1;
  const y1 = y0 + 1 >= h ? h - 1 : y0 + 1;
  const tx = xi - x0;
  const ty = yi - y0;
  const i00 = y0 * w + x0;
  const i10 = y0 * w + x1;
  const i01 = y1 * w + x0;
  const i11 = y1 * w + x1;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx       * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx       * ty;
  let dx = nx[i00] * w00 + nx[i10] * w10 + nx[i01] * w01 + nx[i11] * w11;
  let dy = ny[i00] * w00 + ny[i10] * w10 + ny[i01] * w01 + ny[i11] * w11;
  let dz = nz[i00] * w00 + nz[i10] * w10 + nz[i01] * w01 + nz[i11] * w11;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return [dx / len, dy / len, dz / len];
}
