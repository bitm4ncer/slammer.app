// Posterize — quantises each channel into N discrete bands with optional
// luminance / palette mode, perceptual / equalised distribution, edge
// softness anti-aliasing, bias remap, and original-mix blending.

import { sliderRow, sliderRowSm, sliderRowLg, pillGroup, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'posterize',
  name: 'Posterize',
  version: '1.0.0',
  type: 'filter',
  icon: 'bars-staggered',
  category: 'image',
  description: 'Reduce tone count for poster look',

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

    // Palette mode is a fixed 5-stop greyscale ramp — none of the bias /
    // softness / distribution params apply. Tight inline loop.
    if (mode === 'palette') {
      for (let i = 0; i < n; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = snapPalette(lum);
        d[i] = v; d[i + 1] = v; d[i + 2] = v;
      }
      return imageData;
    }

    // Quantise is a pure function of (input byte, levels, distribution, soft,
    // bias) — it doesn't depend on x/y or any other channel. Build a 256-entry
    // LUT once and the per-pixel work collapses to array reads.
    const qLut = buildQuantiseLut(lvl, distribution, soft, bias);

    if (mode === 'luminance') {
      // For luminance mode we still need the per-pixel scale ratio, but the
      // (lumInt → qLumInt) lookup is one read. Equalised mode composes the
      // CDF into the lookup so it's still a single read per pixel.
      let lumLut = qLut;
      if (distribution === 'equalised') {
        const cdfLum = buildCdf(d, 'lum');
        lumLut = new Uint8Array(256);
        for (let v = 0; v < 256; v++) lumLut[v] = qLut[cdfLum[v]];
      }
      for (let i = 0; i < n; i += 4) {
        const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];
        const lum = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
        const lumI = lum < 0 ? 0 : lum > 255 ? 255 : (lum + 0.5) | 0;
        const qLum = lumLut[lumI];
        const scale = lum > 0 ? qLum / lum : 1;
        d[i]     = clamp255(r0 * scale);
        d[i + 1] = clamp255(g0 * scale);
        d[i + 2] = clamp255(b0 * scale);
      }
      return imageData;
    }

    // RGB mode — independently per-channel. Compose CDFs into the LUT for
    // equalised mode so each pixel still costs one read per channel.
    let lutR = qLut, lutG = qLut, lutB = qLut;
    if (distribution === 'equalised') {
      const cdfR = buildCdf(d, 0);
      const cdfG = buildCdf(d, 1);
      const cdfB = buildCdf(d, 2);
      lutR = new Uint8Array(256);
      lutG = new Uint8Array(256);
      lutB = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        lutR[v] = qLut[cdfR[v]];
        lutG[v] = qLut[cdfG[v]];
        lutB[v] = qLut[cdfB[v]];
      }
    }
    for (let i = 0; i < n; i += 4) {
      d[i]     = lutR[d[i]];
      d[i + 1] = lutG[d[i + 1]];
      d[i + 2] = lutB[d[i + 2]];
      // alpha unchanged
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();

    root.appendChild(sliderRowLg({
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

    root.appendChild(sliderRowSm({
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
 * Build a 256-entry LUT mapping input byte → posterised output byte.
 * Folds the per-pixel quantise() call into a one-shot table build.
 */
function buildQuantiseLut(levels, distribution, soft, bias) {
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    const out = quantise(v / 255, levels, soft, bias, distribution);
    const byte = Math.round(out * 255);
    lut[v] = byte < 0 ? 0 : byte > 255 ? 255 : byte;
  }
  return lut;
}

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
