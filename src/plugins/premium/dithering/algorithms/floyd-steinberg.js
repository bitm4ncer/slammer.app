import { toGrayscale, writeBinary } from './shared.js';

export function floydSteinberg(imageData, params) {
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
      if (x + 1 < w) gray[idx + 1] += err * 7 / 16;
      if (y + 1 < h) {
        if (x > 0) gray[idx + w - 1] += err * 3 / 16;
        gray[idx + w] += err * 5 / 16;
        if (x + 1 < w) gray[idx + w + 1] += err * 1 / 16;
      }
    }
  }
  return imageData;
}
