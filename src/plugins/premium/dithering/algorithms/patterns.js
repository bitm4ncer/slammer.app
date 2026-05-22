// Pattern-based dithering primitives — halftone, checker, mosaic, sineWave, gridlock,
// circuitGrid, diamond, wave, bitTone, radialBurst, vortex.
// These are visual patterns; they produce the binary mask used by the colour-mode stage.

import { toGrayscale, writeFlat } from './shared.js';

function applyMask(imageData, mask, strength) {
  const d = imageData.data;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    writeFlat(d, p, mask[i] ? 255 : 0, strength);
  }
  return imageData;
}

export function halftone(imageData, params) {
  const t = params.threshold;
  const s = params.strength;
  const cell = Math.max(2, params.patternSize || 4);
  const angle = ((params.patternAngle || 0) * Math.PI) / 180;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rx = x * cosA + y * sinA;
      const ry = -x * sinA + y * cosA;
      const cellX = Math.floor(rx / cell);
      const cellY = Math.floor(ry / cell);
      // Sample lum in this cell.
      const sx = Math.min(w - 1, Math.max(0, Math.round((cellX + 0.5) * cell * cosA - (cellY + 0.5) * cell * sinA)));
      const sy = Math.min(h - 1, Math.max(0, Math.round((cellX + 0.5) * cell * sinA + (cellY + 0.5) * cell * cosA)));
      const v = gray[sy * w + sx];
      const lum = (255 - v) / 255;
      const cx = (cellX + 0.5) * cell;
      const cy = (cellY + 0.5) * cell;
      const dxr = rx - cx;
      const dyr = ry - cy;
      const dist = Math.sqrt(dxr * dxr + dyr * dyr);
      const radius = lum * (cell / 2 + 0.5);
      mask[y * w + x] = dist > radius ? 1 : 0;
    }
  }
  return applyMask(imageData, mask, s);
}

export function checker(imageData, params) {
  const cell = Math.max(2, params.patternSize || 4);
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const cellOn = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) === 0;
      const v = gray[idx];
      mask[idx] = cellOn ? (v >= t ? 1 : 0) : (v >= 255 - t ? 1 : 0);
    }
  }
  return applyMask(imageData, mask, s);
}

export function mosaic(imageData, params) {
  const cell = Math.max(2, params.mosaicSize || 8);
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      let sum = 0, n = 0;
      for (let yy = y; yy < Math.min(h, y + cell); yy++) {
        for (let xx = x; xx < Math.min(w, x + cell); xx++) {
          sum += gray[yy * w + xx]; n++;
        }
      }
      const avg = sum / n;
      const v = avg < t ? 0 : 1;
      for (let yy = y; yy < Math.min(h, y + cell); yy++) {
        for (let xx = x; xx < Math.min(w, x + cell); xx++) {
          mask[yy * w + xx] = v;
        }
      }
    }
  }
  return applyMask(imageData, mask, s);
}

export function sineWave(imageData, params) {
  const len = Math.max(2, params.waveLength || 8);
  const amp = params.waveAmplitude || 4;
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const wave = Math.sin((x / len) * Math.PI * 2) * amp;
      const v = gray[idx] + wave;
      mask[idx] = v < t ? 0 : 1;
    }
  }
  return applyMask(imageData, mask, s);
}

export function gridlock(imageData, params) {
  const cell = Math.max(2, params.patternSize || 4);
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const onLine = (x % cell === 0) || (y % cell === 0);
      const v = gray[idx];
      mask[idx] = onLine ? (v >= t ? 1 : 0) : (v >= 255 - t ? 1 : 0);
    }
  }
  return applyMask(imageData, mask, s);
}

export function circuitGrid(imageData, params) {
  const cell = Math.max(2, params.patternSize || 4);
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const xCell = Math.floor(x / cell), yCell = Math.floor(y / cell);
      const node = ((xCell + yCell) % 3 === 0) && ((x % cell < 2) || (y % cell < 2));
      const v = gray[idx];
      mask[idx] = node ? (v >= t ? 1 : 0) : (v >= 255 - t ? 1 : 0);
    }
  }
  return applyMask(imageData, mask, s);
}

export function diamond(imageData, params) {
  const cell = Math.max(2, params.patternSize || 4);
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const v = gray[idx];
      const lx = x % cell, ly = y % cell;
      const cx = cell / 2, cy = cell / 2;
      const inDiamond = (Math.abs(lx - cx) + Math.abs(ly - cy)) <= cy;
      mask[idx] = inDiamond ? (v >= t ? 1 : 0) : 0;
    }
  }
  return applyMask(imageData, mask, s);
}

export function wave(imageData, params) {
  const len = Math.max(2, params.waveLength || 8);
  const amp = params.waveAmplitude || 4;
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const wave1 = Math.sin((x / len) * Math.PI * 2) * amp;
      const wave2 = Math.sin((y / len) * Math.PI * 2) * amp;
      const v = gray[idx] + wave1 + wave2;
      mask[idx] = v < t ? 0 : 1;
    }
  }
  return applyMask(imageData, mask, s);
}

export function bitTone(imageData, params) {
  const depth = Math.max(1, Math.min(7, params.bitDepth || 1));
  const levels = 1 << depth;
  const step = 255 / (levels - 1);
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      const q = Math.round(v / step) * step;
      d[i + c] = d[i + c] + (q - d[i + c]) * s;
    }
  }
  return imageData;
}

export function radialBurst(imageData, params) {
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const cx = w / 2, cy = h / 2;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const a = Math.atan2(y - cy, x - cx);
      const ray = (Math.sin(a * 12) + 1) / 2;
      const v = gray[idx] - (ray * 96 - 48);
      mask[idx] = v < t ? 0 : 1;
    }
  }
  return applyMask(imageData, mask, s);
}

export function vortex(imageData, params) {
  const t = params.threshold;
  const s = params.strength;
  const w = imageData.width, h = imageData.height;
  const cx = w / 2, cy = h / 2;
  const gray = toGrayscale(imageData);
  const mask = new Uint8Array(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = Math.atan2(dy, dx);
      const swirl = Math.sin(a * 8 + r * 0.04) * 64;
      const v = gray[idx] + swirl;
      mask[idx] = v < t ? 0 : 1;
    }
  }
  return applyMask(imageData, mask, s);
}
