// Displacement — for each output pixel (x, y) sample the source at
// (x + dx, y + dy) where (dx, dy) come from a 2-channel value-noise map.
// Edge mode: clamp. Output is a fresh ImageData (cannot mutate in place
// because each output pixel reads from a different source position).

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'displacement',
  name: 'Displacement',
  version: '1.0.0',
  type: 'filter',
  icon: 'wave-square',
  category: 'glitch',

  defaultParams() { return { amount: 10, scale: 8, seed: 1 }; },

  process(imageData, params) {
    const amount = Math.max(0, Math.min(100, params.amount ?? 10));
    if (amount === 0) return imageData;
    const scale = Math.max(1, Math.min(40, params.scale ?? 8));
    const seed = Math.max(1, Math.floor(params.seed || 1));
    const W = imageData.width, H = imageData.height;
    const src = imageData.data;
    const out = new ImageData(W, H);
    const dst = out.data;

    const noiseX = makeValueNoise(W, H, scale, seed * 0xDEADBEEF);
    const noiseY = makeValueNoise(W, H, scale, seed * 0xCAFEBABE + 17);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Noise samples in [-1, +1]
        const nx = noiseX(x, y) * 2 - 1;
        const ny = noiseY(x, y) * 2 - 1;
        const sx = clampI(x + Math.round(nx * amount), 0, W - 1);
        const sy = clampI(y + Math.round(ny * amount), 0, H - 1);
        const si = (sy * W + sx) * 4;
        const di = (y * W + x) * 4;
        dst[di]     = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = src[si + 3];
      }
    }
    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Amount', min: 0, max: 100, step: 1, value: params.amount ?? 10, defaultValue: 10, suffix: 'px',
      onChange: (v) => onChange({ amount: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Scale', min: 1, max: 40, step: 1, value: params.scale ?? 8, defaultValue: 8,
      onChange: (v) => onChange({ scale: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Seed', min: 1, max: 99, step: 1, value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
    }));
    return root;
  },
};

function clampI(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function mulberry32(seed) {
  let t = (seed >>> 0) || 1;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeValueNoise(W, H, cellSize, seed) {
  const rand = mulberry32(seed);
  const cw = Math.ceil(W / cellSize) + 2;
  const ch = Math.ceil(H / cellSize) + 2;
  const grid = new Float32Array(cw * ch);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return (x, y) => {
    const fx = x / cellSize;
    const fy = y / cellSize;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix; const ty = fy - iy;
    const ax = ix % cw; const ay = iy % ch;
    const ax1 = (ax + 1) % cw; const ay1 = (ay + 1) % ch;
    const a = grid[ay * cw + ax];
    const b = grid[ay * cw + ax1];
    const c = grid[ay1 * cw + ax];
    const d = grid[ay1 * cw + ax1];
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}
