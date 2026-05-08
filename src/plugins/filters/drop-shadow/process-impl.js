// drop-shadow process — pure compute, no DOM imports. Importable from
// both the main thread (via plugins/filters/drop-shadow/index.js) and a
// Web Worker (src/workers/effect-worker.js).
//
// Uses OffscreenCanvas for blend-mode compositing — supported in modern
// browsers in both main and worker contexts (Chrome 69+, Firefox 105+,
// Safari 16.4+).

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/** Shift an alpha Float32Array by (dx, dy), filling empty area with 0. */
function shiftAlpha(src, W, H, dx, dy) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= H) continue;
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= W) continue;
      out[y * W + x] = src[sy * W + sx];
    }
  }
  return out;
}

/**
 * O(W·H) sliding-max dilate via a monotonic deque (van Herk-Gil-Werman).
 * Independent of r — the inner-window scan is replaced by a single deque
 * push + expire per pixel.
 */
function dilateAlpha(src, W, H, r) {
  if (r <= 0) { const o = new Float32Array(W * H); o.set(src); return o; }
  const tmp = new Float32Array(W * H);
  const deqMax = Math.max(W, H);
  const deq = new Int32Array(deqMax);

  for (let y = 0; y < H; y++) {
    const rowOff = y * W;
    let head = 0, tail = 0;
    const preLimit = r < W ? r : W;
    for (let i = 0; i < preLimit; i++) {
      const v = src[rowOff + i];
      while (head < tail && src[rowOff + deq[tail - 1]] <= v) tail--;
      deq[tail++] = i;
    }
    for (let x = 0; x < W; x++) {
      const xr = x + r;
      if (xr < W) {
        const v = src[rowOff + xr];
        while (head < tail && src[rowOff + deq[tail - 1]] <= v) tail--;
        deq[tail++] = xr;
      }
      const xl = x - r;
      while (head < tail && deq[head] < xl) head++;
      tmp[rowOff + x] = src[rowOff + deq[head]];
    }
  }

  const out = new Float32Array(W * H);
  for (let x = 0; x < W; x++) {
    let head = 0, tail = 0;
    const preLimit = r < H ? r : H;
    for (let i = 0; i < preLimit; i++) {
      const v = tmp[i * W + x];
      while (head < tail && tmp[deq[tail - 1] * W + x] <= v) tail--;
      deq[tail++] = i;
    }
    for (let y = 0; y < H; y++) {
      const yr = y + r;
      if (yr < H) {
        const v = tmp[yr * W + x];
        while (head < tail && tmp[deq[tail - 1] * W + x] <= v) tail--;
        deq[tail++] = yr;
      }
      const yl = y - r;
      while (head < tail && deq[head] < yl) head++;
      out[y * W + x] = tmp[deq[head] * W + x];
    }
  }
  return out;
}

/** 3-pass separable box blur on an alpha Float32Array. */
function boxBlurAlpha(src, W, H, r) {
  let a = new Float32Array(src);
  let b = new Float32Array(W * H);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurAlphaH(a, b, W, H, r);
    boxBlurAlphaV(b, a, W, H, r);
  }
  return a;
}

function boxBlurAlphaH(src, dst, W, H, r) {
  const div = r * 2 + 1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let s = 0;
    for (let i = -r; i <= r; i++) {
      s += src[row + Math.max(0, Math.min(W - 1, i))];
    }
    for (let x = 0; x < W; x++) {
      dst[row + x] = s / div;
      const xAdd = Math.min(W - 1, x + r + 1);
      const xRem = Math.max(0, x - r);
      s += src[row + xAdd] - src[row + xRem];
    }
  }
}

function boxBlurAlphaV(src, dst, W, H, r) {
  const div = r * 2 + 1;
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) {
      s += src[Math.max(0, Math.min(H - 1, i)) * W + x];
    }
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = s / div;
      const yAdd = Math.min(H - 1, y + r + 1);
      const yRem = Math.max(0, y - r);
      s += src[yAdd * W + x] - src[yRem * W + x];
    }
  }
}

function blendModeToComposite(mode) {
  switch (mode) {
    case 'multiply': return 'multiply';
    case 'screen':   return 'screen';
    case 'overlay':  return 'overlay';
    default:         return 'source-over';
  }
}

/**
 * Drop-shadow process. Mutates the input ImageData (or returns a new one
 * with the same dims) and returns it. Pure compute — no DOM imports;
 * uses OffscreenCanvas for blend-mode compositing.
 *
 * Caller passes a real ImageData; works in both main thread and Worker.
 */
export function processDropShadow(imageData, params) {
  const W = imageData.width;
  const H = imageData.height;
  const src = imageData.data;

  // --- resolve offset ---
  const mode = params.mode || 'polar';
  let ox, oy;
  if (mode === 'cartesian') {
    ox = clamp(params.offsetX ?? 0, -500, 500);
    oy = clamp(params.offsetY ?? 0, -500, 500);
  } else {
    const angle = (params.angle ?? 135) * Math.PI / 180;
    const dist  = clamp(params.distance ?? 12, 0, 500);
    ox = Math.round(Math.cos(angle) * dist);
    oy = Math.round(Math.sin(angle) * dist);
  }

  const blur     = clamp(Math.floor(params.blur    ?? 8),  0, 200);
  const spread   = clamp(Math.floor(params.spread  ?? 0),  0, 100);
  const opacity  = clamp(params.opacity ?? 60, 0, 100) / 100;
  const inner    = !!params.inner;
  const knockout = !!params.knockout;
  const blendMode = params.blendMode || 'multiply';

  const [sR, sG, sB] = hexToRgb(params.color || '#000000');

  const alphaSrc = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) alphaSrc[i] = src[i * 4 + 3] / 255;

  let shadowAlpha = alphaSrc;
  if (spread > 0) shadowAlpha = dilateAlpha(alphaSrc, W, H, spread);

  const shiftX = inner ? -ox : ox;
  const shiftY = inner ? -oy : oy;
  shadowAlpha = shiftAlpha(shadowAlpha, W, H, shiftX, shiftY);

  if (blur > 0) shadowAlpha = boxBlurAlpha(shadowAlpha, W, H, blur);

  if (inner) {
    for (let i = 0; i < W * H; i++) shadowAlpha[i] = shadowAlpha[i] * alphaSrc[i];
  }
  for (let i = 0; i < W * H; i++) shadowAlpha[i] *= opacity;

  // Composite. OffscreenCanvas works on main thread AND in worker.
  const out = new OffscreenCanvas(W, H);
  const octx = out.getContext('2d');

  const shadowData = octx.createImageData(W, H);
  const sd = shadowData.data;
  for (let i = 0; i < W * H; i++) {
    const a = Math.round(clamp(shadowAlpha[i], 0, 1) * 255);
    sd[i * 4]     = sR;
    sd[i * 4 + 1] = sG;
    sd[i * 4 + 2] = sB;
    sd[i * 4 + 3] = a;
  }

  if (inner) {
    octx.putImageData(imageData, 0, 0);
    const shadowCanvas = new OffscreenCanvas(W, H);
    shadowCanvas.getContext('2d').putImageData(shadowData, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    octx.drawImage(shadowCanvas, 0, 0);
  } else {
    const shadowCanvas = new OffscreenCanvas(W, H);
    shadowCanvas.getContext('2d').putImageData(shadowData, 0, 0);

    octx.putImageData(imageData, 0, 0);

    const compCanvas = new OffscreenCanvas(W, H);
    const cctx = compCanvas.getContext('2d');
    cctx.putImageData(shadowData, 0, 0);

    const srcCanvas = new OffscreenCanvas(W, H);
    srcCanvas.getContext('2d').putImageData(imageData, 0, 0);

    if (blendMode !== 'normal') {
      const blCanvas = new OffscreenCanvas(W, H);
      const bctx = blCanvas.getContext('2d');
      bctx.putImageData(imageData, 0, 0);
      bctx.globalCompositeOperation = blendModeToComposite(blendMode);
      bctx.drawImage(shadowCanvas, 0, 0);
      cctx.drawImage(blCanvas, 0, 0);
    }

    octx.clearRect(0, 0, W, H);
    octx.putImageData(cctx.getImageData(0, 0, W, H), 0, 0);
    octx.globalCompositeOperation = 'source-over';
    octx.drawImage(srcCanvas, 0, 0);
  }

  const result = octx.getImageData(0, 0, W, H);
  if (knockout) {
    const rd = result.data;
    for (let i = 0; i < W * H; i++) {
      const srcA = src[i * 4 + 3];
      if (srcA > 0) {
        rd[i * 4 + 3] = 0;
        rd[i * 4]     = 0;
        rd[i * 4 + 1] = 0;
        rd[i * 4 + 2] = 0;
      }
    }
  }

  imageData.data.set(result.data);
  return imageData;
}
