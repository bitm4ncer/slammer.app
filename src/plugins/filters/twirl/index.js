// Twirl — inverse-warp distortion.
// For each output pixel, compute its distance + angle from the center.
// Pixels inside `radius` are rotated by `angle * falloff(distance)`.
// Pixels outside radius are left unchanged (or blended via Mix).

import { sliderRow, pillGroup, toggleRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'twirl',
  name: 'Twirl',
  version: '1.0.0',
  type: 'filter',
  icon: 'wind',
  category: 'distort',

  defaultParams() {
    return {
      angle:    180,      // -1080..1080°
      centerX:  50,       // 0..100%
      centerY:  50,       // 0..100%
      radius:   50,       // 0..100% of min(w,h)
      falloff:  'smooth', // 'smooth' | 'linear' | 'hard' | 'bell'
      sampling: 'bilinear',  // 'bilinear' | 'nearest'
      inverse:  false,    // twist starts at edge, calm in center
      mix:      100,      // 0..100%
    };
  },

  process(imageData, params) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const angle    = (params.angle    ?? 180)  * (Math.PI / 180);
    const centerX  = clamp(params.centerX ?? 50, 0, 100) / 100 * W;
    const centerY  = clamp(params.centerY ?? 50, 0, 100) / 100 * H;
    const radius   = clamp(params.radius  ?? 50, 0, 100) / 100 * Math.min(W, H);
    const falloff  = params.falloff  ?? 'smooth';
    const sampling = params.sampling ?? 'bilinear';
    const inverse  = params.inverse  ?? false;
    const mix      = clamp(params.mix ?? 100, 0, 100) / 100;

    // Short-circuit: zero angle or zero radius → pass-through (still apply mix).
    if ((Math.abs(angle) < 1e-6 || radius < 0.5) && mix >= 1) return imageData;

    const out = new ImageData(W, H);
    const dst = out.data;

    const PI = Math.PI;
    const sampleFn = sampling === 'nearest' ? sampleNearest : sampleBilinear;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const di = (y * W + x) * 4;

        if (dist > radius || radius < 0.5) {
          // Outside radius — keep original pixel, respect mix.
          if (mix >= 1) {
            dst[di]     = src[di];
            dst[di + 1] = src[di + 1];
            dst[di + 2] = src[di + 2];
            dst[di + 3] = src[di + 3];
          } else {
            const [r, g, b, a] = sampleFn(src, W, H, x, y);
            blendPixel(dst, di, src, di, r, g, b, a, mix);
          }
          continue;
        }

        // Compute falloff factor f ∈ [0, 1].
        const t = dist / radius; // 0 at center, 1 at edge
        let f;
        switch (falloff) {
          case 'smooth':  f = 0.5 * (1 + Math.cos(PI * t));  break;
          case 'linear':  f = 1 - t;                          break;
          case 'hard':    f = 1;                              break;
          case 'bell':    f = Math.sin(PI * t);               break;
          default:        f = 0.5 * (1 + Math.cos(PI * t));  break;
        }
        if (inverse) f = 1 - f;

        // Source angle is rotated BACKWARDS by angle*f (inverse warp).
        const srcAngle = Math.atan2(dy, dx) - angle * f;

        const sx = centerX + dist * Math.cos(srcAngle);
        const sy = centerY + dist * Math.sin(srcAngle);

        const [r, g, b, a] = sampleFn(src, W, H, sx, sy);

        if (mix >= 1) {
          dst[di]     = r;
          dst[di + 1] = g;
          dst[di + 2] = b;
          dst[di + 3] = a;
        } else {
          blendPixel(dst, di, src, di, r, g, b, a, mix);
        }
      }
    }
    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { ...this.defaultParams(), ...params };

    function rebuild() {
      root.innerHTML = '';

      root.appendChild(sliderRow({
        label: 'Angle', min: -1080, max: 1080, step: 1,
        value: local.angle, defaultValue: 180, suffix: '°',
        onChange: (v) => { local.angle = v; onChange({ angle: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Center X', min: 0, max: 100, step: 1,
        value: local.centerX, defaultValue: 50, suffix: '%',
        onChange: (v) => { local.centerX = v; onChange({ centerX: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Center Y', min: 0, max: 100, step: 1,
        value: local.centerY, defaultValue: 50, suffix: '%',
        onChange: (v) => { local.centerY = v; onChange({ centerY: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Radius', min: 0, max: 100, step: 1,
        value: local.radius, defaultValue: 50, suffix: '%',
        onChange: (v) => { local.radius = v; onChange({ radius: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Falloff',
        options: [
          { value: 'smooth', label: 'Smooth' },
          { value: 'linear', label: 'Linear' },
          { value: 'hard',   label: 'Hard' },
          { value: 'bell',   label: 'Bell' },
        ],
        value: local.falloff,
        onChange: (v) => { local.falloff = v; onChange({ falloff: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Sampling',
        options: [
          { value: 'bilinear', label: 'Bilinear' },
          { value: 'nearest',  label: 'Nearest' },
        ],
        value: local.sampling,
        onChange: (v) => { local.sampling = v; onChange({ sampling: v }); },
      }));

      root.appendChild(toggleRow({
        label: 'Inverse',
        value: local.inverse,
        onChange: (v) => { local.inverse = v; onChange({ inverse: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Mix', min: 0, max: 100, step: 1,
        value: local.mix, defaultValue: 100, suffix: '%',
        onChange: (v) => { local.mix = v; onChange({ mix: v }); },
      }));
    }

    rebuild();
    return root;
  },
};

// ---------- samplers ----------

/** Bilinear 4-tap weighted average; clamps at edges. */
function sampleBilinear(src, W, H, x, y) {
  const x0 = clampI(Math.floor(x),     0, W - 1);
  const x1 = clampI(x0 + 1,            0, W - 1);
  const y0 = clampI(Math.floor(y),     0, H - 1);
  const y1 = clampI(y0 + 1,            0, H - 1);
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);

  const i00 = (y0 * W + x0) * 4;
  const i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4;
  const i11 = (y1 * W + x1) * 4;

  const r = blerp(src[i00],     src[i10],     src[i01],     src[i11],     tx, ty);
  const g = blerp(src[i00 + 1], src[i10 + 1], src[i01 + 1], src[i11 + 1], tx, ty);
  const b = blerp(src[i00 + 2], src[i10 + 2], src[i01 + 2], src[i11 + 2], tx, ty);
  const a = blerp(src[i00 + 3], src[i10 + 3], src[i01 + 3], src[i11 + 3], tx, ty);

  return [r | 0, g | 0, b | 0, a | 0];
}

/** Nearest-neighbour, clamps at edges. */
function sampleNearest(src, W, H, x, y) {
  const xi = clampI(Math.round(x), 0, W - 1);
  const yi = clampI(Math.round(y), 0, H - 1);
  const i = (yi * W + xi) * 4;
  return [src[i], src[i + 1], src[i + 2], src[i + 3]];
}

// ---------- helpers ----------
function blerp(v00, v10, v01, v11, tx, ty) {
  return v00 * (1 - tx) * (1 - ty) +
         v10 * tx       * (1 - ty) +
         v01 * (1 - tx) * ty       +
         v11 * tx       * ty;
}

/** Write warped pixel blended with the original at index `si` in src. */
function blendPixel(dst, di, src, si, r, g, b, a, mix) {
  const inv = 1 - mix;
  dst[di]     = (r * mix + src[si]     * inv) | 0;
  dst[di + 1] = (g * mix + src[si + 1] * inv) | 0;
  dst[di + 2] = (b * mix + src[si + 2] * inv) | 0;
  dst[di + 3] = (a * mix + src[si + 3] * inv) | 0;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clampI(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
