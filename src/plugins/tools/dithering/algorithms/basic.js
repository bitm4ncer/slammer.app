// Threshold and Random — simplest dithers, write a luminance binary mask into RGB.

import { toGrayscale, writeBinary } from './shared.js';

export function thresholdAlgo(imageData, params) {
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const old = gray[i];
    const nw = old < t ? 0 : 255;
    writeBinary(imageData.data, p, old, nw, s);
  }
  return imageData;
}

export function randomAlgo(imageData, params) {
  const t = params.threshold;
  const s = params.strength;
  const gray = toGrayscale(imageData);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const old = gray[i];
    const noise = (Math.random() - 0.5) * 96;
    const nw = old + noise < t ? 0 : 255;
    writeBinary(imageData.data, p, old, nw, s);
  }
  return imageData;
}
