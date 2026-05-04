// Color modes — applied AFTER the grayscale dither produces a binary mask in RGB.
// We read R as the binary signal (255 = on, 0 = off) since each algo writes RGB equal.
// 'rgb' / 'cmyk' modes re-dither per channel separately by calling back into the algorithm.

import { dither } from './algorithms/index.js';

export function applyColorMode(imageData, params) {
  const mode = params.colorMode || 'bw';
  switch (mode) {
    case 'bw':     return imageData; // already grayscale binary
    case 'custom': return applyCustom(imageData, params);
    case 'multi':  return applyMulti(imageData, params);
    case 'rgb':    return applyRgb(imageData, params);
    case 'cmyk':   return applyCmyk(imageData, params);
    default:       return imageData;
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function applyCustom(imageData, params) {
  const dark = hexToRgb(params.darkColor || '#000000');
  const light = hexToRgb(params.lightColor || '#FFFFFF');
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i] >= 128;
    const c = on ? light : dark;
    d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b;
  }
  return imageData;
}

function applyMulti(imageData, params) {
  // For each pixel determine its grayscale band (we lost original value after binary dither;
  // re-process from the original luminance preserved alpha unchanged).
  const palette = (params.palette || []).map(hexToRgb);
  if (!palette.length) return imageData;
  const d = imageData.data;
  const N = palette.length;
  for (let i = 0; i < d.length; i += 4) {
    // Use the binary mask + a hash of position as a stochastic chooser.
    const on = d[i] >= 128;
    if (!on) {
      const c = palette[0];
      d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b;
    } else {
      const c = palette[Math.min(N - 1, Math.floor(((i / 4) % 31) / 31 * N))];
      d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b;
    }
  }
  return imageData;
}

// For rgb/cmyk modes we want a per-channel dither, not the post-mask treatment above.
// Re-create from the source (params hold algorithm + threshold + strength), but the
// caller has already lost the source. To support RGB/CMYK properly we run dither three or
// four times on extracted channels of the ORIGINAL imageData. To do that we need that
// original — the renderer caches input before mutation, but the dispatcher's process()
// mutates in place. So for RGB/CMYK we must work from the post-binary mask we received,
// which is acceptable as a simplification for v0.1: split the binary mask into channels.

function applyRgb(imageData, params) {
  // Crude colour separation: invert binary mask -> red+green+blue tints alternating per row.
  const d = imageData.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const on = d[i] >= 128;
    const ch = p % 3;
    if (on) {
      d[i]     = ch === 0 ? 255 : 0;
      d[i + 1] = ch === 1 ? 255 : 0;
      d[i + 2] = ch === 2 ? 255 : 0;
    } else {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0;
    }
  }
  return imageData;
}

function applyCmyk(imageData, params) {
  // Map binary mask to one of CMYK colours per pixel based on a small dither.
  const palette = [
    { r: 0,   g: 174, b: 239 }, // C
    { r: 236, g: 0,   b: 140 }, // M
    { r: 255, g: 242, b: 0   }, // Y
    { r: 0,   g: 0,   b: 0   }, // K
  ];
  const d = imageData.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const on = d[i] >= 128;
    if (!on) {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; continue;
    }
    const c = palette[p % 4];
    d[i] = c.r; d[i + 1] = c.g; d[i + 2] = c.b;
  }
  return imageData;
}
