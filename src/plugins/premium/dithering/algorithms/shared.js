// Shared helpers used by every dither algorithm.

export function toGrayscale(imageData) {
  const d = imageData.data;
  const out = new Float32Array(imageData.width * imageData.height);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    out[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  }
  return out;
}

export function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// Write the dithered black/white pixel into RGB at offset p, blending with original by strength.
export function writeBinary(data, p, original, newVal, strength) {
  const oR = data[p], oG = data[p + 1], oB = data[p + 2];
  if (strength >= 1) {
    data[p] = newVal;
    data[p + 1] = newVal;
    data[p + 2] = newVal;
    return;
  }
  data[p] = oR + (newVal - oR) * strength;
  data[p + 1] = oG + (newVal - oG) * strength;
  data[p + 2] = oB + (newVal - oB) * strength;
}

// Used by ordered/halftone/etc. to write a single grayscale value (binary).
export function writeFlat(data, p, val, strength) {
  const oR = data[p], oG = data[p + 1], oB = data[p + 2];
  if (strength >= 1) {
    data[p] = val;
    data[p + 1] = val;
    data[p + 2] = val;
    return;
  }
  data[p] = oR + (val - oR) * strength;
  data[p + 1] = oG + (val - oG) * strength;
  data[p + 2] = oB + (val - oB) * strength;
}
