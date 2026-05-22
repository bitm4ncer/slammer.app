// Bayer ordered dither — generate matrix at runtime, apply per-pixel offset.

import { toGrayscale, writeBinary } from './shared.js';

const cache = new Map();

function generateMatrix(n) {
  if (n === 2) return [[0, 2], [3, 1]];
  const half = generateMatrix(n / 2);
  const m = [];
  for (let i = 0; i < n; i++) m.push(new Array(n).fill(0));
  for (let y = 0; y < n / 2; y++) {
    for (let x = 0; x < n / 2; x++) {
      m[y][x] = half[y][x] * 4;
      m[y][x + n / 2] = half[y][x] * 4 + 2;
      m[y + n / 2][x] = half[y][x] * 4 + 3;
      m[y + n / 2][x + n / 2] = half[y][x] * 4 + 1;
    }
  }
  return m;
}

function getMatrix(n) {
  if (cache.has(n)) return cache.get(n);
  const raw = generateMatrix(n);
  const total = n * n;
  const norm = raw.map((row) => row.map((v) => (v + 0.5) * (255 / total) - 128));
  cache.set(n, norm);
  return norm;
}

export function ordered(matrixSize, imageData, params) {
  const t = params.threshold;
  const s = params.strength;
  const m = getMatrix(matrixSize);
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = gray[idx];
      const offset = m[y % matrixSize][x % matrixSize];
      const nw = (old + offset) < t ? 0 : 255;
      writeBinary(imageData.data, idx * 4, old, nw, s);
    }
  }
  return imageData;
}
