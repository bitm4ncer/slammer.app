// Generic error-diffusion dither: provide a kernel name → kernel matrix.
// Kernel = [[dx, dy, weight], ...] with the divisor as kernel.divisor.

import { toGrayscale, writeBinary } from './shared.js';

const KERNELS = {
  jarvis: {
    divisor: 48,
    cells: [
      [1, 0, 7], [2, 0, 5],
      [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
      [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
    ],
  },
  stucki: {
    divisor: 42,
    cells: [
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
    ],
  },
  burkes: {
    divisor: 32,
    cells: [
      [1, 0, 8], [2, 0, 4],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
    ],
  },
  sierra: {
    divisor: 32,
    cells: [
      [1, 0, 5], [2, 0, 3],
      [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
      [-1, 2, 2], [0, 2, 3], [1, 2, 2],
    ],
  },
  sierra2Row: {
    divisor: 16,
    cells: [
      [1, 0, 4], [2, 0, 3],
      [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1],
    ],
  },
  sierraLite: {
    divisor: 4,
    cells: [
      [1, 0, 2],
      [-1, 1, 1], [0, 1, 1],
    ],
  },
};

export function errorDiffusion(name, imageData, params) {
  const k = KERNELS[name];
  if (!k) return imageData;
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = gray[idx];
      const nw = old < t ? 0 : 255;
      const err = old - nw;
      writeBinary(imageData.data, idx * 4, old, nw, s);
      for (const [dx, dy, weight] of k.cells) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        gray[ny * w + nx] += err * weight / k.divisor;
      }
    }
  }
  return imageData;
}
