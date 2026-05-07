// Posterize — quantises each channel into N discrete bands with optional
// luminance / palette mode, perceptual / equalised distribution, edge
// softness anti-aliasing, bias remap, and original-mix blending.

import { sliderRow, pillGroup, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'posterize',
  name: 'Posterize',
  version: '1.0.0',
  type: 'filter',
  icon: 'bars-staggered',
  category: 'image',

  defaultParams() {
    return {
      levels: 5,           // 2..32
      mode: 'rgb',         // 'rgb' | 'luminance' | 'palette'
      distribution: 'linear', // 'linear' | 'perceptual' | 'equalised'
      softness: 0,         // 0..100 (%)
      bias: 0,             // -1..+1
    };
  },

  process(imageData, params) {
    const { levels = 5, mode = 'rgb', distribution = 'linear',
            softness = 0, bias = 0 } = params;

    const d = imageData.data;
    const n = d.length;
    const lvl = Math.max(2, Math.min(32, Math.round(levels)));
    const soft = Math.max(0, Math.min(1, softness / 100));
    const mixF = 1;

    // --- Equalised distribution: build per-channel CDF lookup (0..255 → 0..255) ---
    // Build histogram + CDF only when needed.
    let cdfR = null, cdfG = null, cdfB = null, cdfLum = null;
    if (distribution === 'equalised') {
      if (mode === 'luminance' || mode === 'palette') {
        cdfLum = buildCdf(d, 'lum');
      } else {
        cdfR = buildCdf(d, 0);
        cdfG = buildCdf(d, 1);
        cdfB = buildCdf(d, 2);
      }
    }

    for (let i = 0; i < n; i += 4) {
      const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];

      let r, g, b;

      if (mode === 'palette') {
        // Snap to nearest of 5-stop greyscale ramp: 0, 64, 128, 192, 255
        const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
        const snapped = snapPalette(lum);
        r = g = b = snapped;
      } else if (mode === 'luminance') {
        // Posterize on luminance, then scale RGB channels proportionally
        const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
        const lumN = distribution === 'equalised' && cdfLum
          ? cdfLum[Math.round(lum)] / 255
          : lum / 255;
        const qLum = quantise(lumN, lvl, soft, bias, distribution) * 255;
        const scale = lum > 0 ? qLum / lum : 1;
        r = clamp255(r0 * scale);
        g = clamp255(g0 * scale);
        b = clamp255(b0 * scale);
      } else {
        // RGB: quantise each channel independently
        const rN = distribution === 'equalised' && cdfR ? cdfR[r0] / 255 : r0 / 255;
        const gN = distribution === 'equalised' && cdfG ? cdfG[g0] / 255 : g0 / 255;
        const bN = distribution === 'equalised' && cdfB ? cdfB[b0] / 255 : b0 / 255;
        r = clamp255(quantise(rN, lvl, soft, bias, distribution) * 255);
        g = clamp255(quantise(gN, lvl, soft, bias, distribution) * 255);
        b = clamp255(quantise(bN, lvl, soft, bias, distribution) * 255);
      }

      // Mix with original
      if (mixF < 1) {
        r = clamp255(r0 + (r - r0) * mixF);
        g = clamp255(g0 + (g - g0) * mixF);
        b = clamp255(b0 + (b - b0) * mixF);
      }

      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      // alpha unchanged
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();

    root.appendChild(sliderRow({
      label: 'Levels', min: 2, max: 32, step: 1,
      value: params.levels ?? 5, defaultValue: 5,
      onChange: (v) => onChange({ levels: v }),
    }));

    root.appendChild(pillGroup({
      label: 'Mode',
      options: [
        { label: 'RGB', value: 'rgb' },
        { label: 'Lum', value: 'luminance' },
        { label: 'Palette', value: 'palette' },
      ],
      value: params.mode ?? 'rgb',
      onChange: (v) => onChange({ mode: v }),
    }));

    root.appendChild(pillGroup({
      label: 'Distribution',
      options: [
        { label: 'Linear', value: 'linear' },
        { label: 'Perceptual', value: 'perceptual' },
        { label: 'Equalised', value: 'equalised' },
      ],
      value: params.distribution ?? 'linear',
      onChange: (v) => onChange({ distribution: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Softness', min: 0, max: 100, step: 1,
      value: params.softness ?? 0, defaultValue: 0,
      suffix: '%',
      onChange: (v) => onChange({ softness: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Bias', min: -100, max: 100, step: 1,
      value: Math.round((params.bias ?? 0) * 100), defaultValue: 0,
      format: (v) => Math.round(v) / 100,
      onChange: (v) => onChange({ bias: v }),
    }));

    return root;
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/**
 * quantise — maps a normalised input [0..1] to a posterized [0..1] output.
 *
 * @param {number} vN          - Input value in [0..1]
 * @param {number} levels      - Number of output bands
 * @param {number} soft        - Edge softness 0..1
 * @param {number} bias        - Boundary shift -1..+1
 * @param {string} distribution - 'linear' | 'perceptual' | 'equalised'
 * @returns {number}           - Quantised value in [0..1]
 */
function quantise(vN, levels, soft, bias, distribution) {
  // Bias remap — shifts band boundaries via power curve.
  // bias > 0 compresses darks (raises shadows toward next band),
  // bias < 0 compresses lights.
  let v = vN;
  if (bias !== 0) {
    const exp = bias > 0 ? 1 - bias * 0.5 : 1 / (1 + bias * 0.5);
    v = Math.pow(Math.max(0, v), exp);
  }

  // Perceptual: apply gamma-2.2 inverse (linearise), quantise, then re-apply gamma.
  // This makes dark bands narrower and light bands wider (matches visual perception).
  if (distribution === 'perceptual') {
    // linearise (sRGB approx)
    v = Math.pow(v, 2.2);
    const q = hardQuantise(v, levels);
    // re-apply gamma to final and neighbour for softness
    if (soft > 0) {
      const vLin = v * (levels - 1);
      const lo = Math.floor(vLin);
      const hi = Math.min(lo + 1, levels - 1);
      const frac = vLin - lo;
      const qLo = Math.pow(lo / (levels - 1), 1 / 2.2);
      const qHi = Math.pow(hi / (levels - 1), 1 / 2.2);
      const blended = lerp(qLo, qHi, smoothstep(frac));
      return lerp(Math.pow(q, 1 / 2.2), blended, soft);
    }
    return Math.pow(q, 1 / 2.2);
  }

  // Linear / equalised: simple floor-quantise in normalised space.
  const q = hardQuantise(v, levels);

  if (soft > 0) {
    const vScaled = v * (levels - 1);
    const lo = Math.floor(vScaled);
    const hi = Math.min(lo + 1, levels - 1);
    const frac = vScaled - lo;
    const qLo = lo / (levels - 1);
    const qHi = hi / (levels - 1);
    const blended = lerp(qLo, qHi, smoothstep(frac));
    return lerp(q, blended, soft);
  }

  return q;
}

/** Hard floor-quantise in [0..1] to `levels` discrete steps. */
function hardQuantise(v, levels) {
  return Math.round(v * (levels - 1)) / (levels - 1);
}

/** Hermite smoothstep — maps [0..1] → [0..1] with ease-in/out. */
function smoothstep(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Snap a luminance [0..255] to the nearest of 5 palette stops:
 * black (0), dark grey (64), mid grey (128), light grey (192), white (255).
 */
function snapPalette(lum) {
  const stops = [0, 64, 128, 192, 255];
  let best = stops[0];
  let bestDist = Math.abs(lum - best);
  for (let i = 1; i < stops.length; i++) {
    const d = Math.abs(lum - stops[i]);
    if (d < bestDist) { bestDist = d; best = stops[i]; }
  }
  return best;
}

/**
 * Build a cumulative-distribution-function lookup table for a single channel
 * or for perceived luminance.
 *
 * @param {Uint8ClampedArray} data - Raw RGBA pixel buffer
 * @param {number|string} channel  - 0 (R), 1 (G), 2 (B), or 'lum'
 * @returns {Uint8Array} 256-entry LUT mapping raw value → equalised value
 */
function buildCdf(data, channel) {
  const hist = new Uint32Array(256);
  const total = data.length / 4;

  if (channel === 'lum') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      hist[lum]++;
    }
  } else {
    for (let i = channel; i < data.length; i += 4) {
      hist[data[i]]++;
    }
  }

  // Build CDF, normalise to [0..255]
  const lut = new Uint8Array(256);
  let cumulative = 0;
  let minVal = 0;
  // Find first non-zero bin for true equalisation
  for (let i = 0; i < 256; i++) { if (hist[i] > 0) { minVal = hist[i]; break; } }

  for (let i = 0; i < 256; i++) {
    cumulative += hist[i];
    lut[i] = Math.round(((cumulative - minVal) / Math.max(1, total - minVal)) * 255);
  }

  return lut;
}
