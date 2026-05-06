// Grain — four flavours of noise. All deterministic via seeded mulberry32 so
// the result is identical across reloads.

import { sliderRow, pillGroup, makeRoot, toggleRow, selectRow } from '../../shared/ui-helpers.js';
import { BLEND_MODES, BLEND_LABELS } from '../../../core/layer.js';

export default {
  id: 'grain',
  name: 'Grain',
  version: '1.0.0',
  type: 'filter',
  icon: 'circle-nodes',
  category: 'glitch',

  defaultParams() {
    return { type: 'film', amount: 30, size: 1, monochrome: true, seed: 1, contrast: 0, blendMode: 'source-over' };
  },

  process(imageData, params) {
    const type = params.type || 'film';
    const amount = clamp(params.amount ?? 30, 0, 100);
    if (amount === 0) return imageData;
    const size = Math.max(0.1, params.size || 2);
    const mono = params.monochrome !== false;
    const seed = Math.max(1, Math.floor(params.seed || 1));
    const contrast = clamp(params.contrast ?? 0, -100, 100);
    const blendMode = params.blendMode || 'source-over';
    const W = imageData.width, H = imageData.height;
    const d = imageData.data;
    const strength = (amount / 100);

    // Clone input before noise is applied so we can composite in a different blend mode.
    const beforeData = blendMode !== 'source-over' ? cloneImageData(imageData) : null;

    if (type === 'random') {
      applyRandom(d, W, H, strength, mono, seed);
    } else if (type === 'digital') {
      applyDigital(d, W, H, strength, mono, seed);
    } else if (type === 'film') {
      applyFilm(d, W, H, strength, size, mono, seed);
    } else {
      applyPerlin(d, W, H, strength, size, mono, seed);
    }

    // Apply contrast post-noise: v_out = (v_in - 128) * (1 + c/100) + 128, clipped.
    if (contrast !== 0) {
      const factor = 1 + contrast / 100;
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = clip255((d[i]     - 128) * factor + 128);
        d[i + 1] = clip255((d[i + 1] - 128) * factor + 128);
        d[i + 2] = clip255((d[i + 2] - 128) * factor + 128);
      }
    }

    // Blend mode compositing: composite noised layer onto original using blendMode.
    if (blendMode !== 'source-over' && beforeData) {
      const work = document.createElement('canvas');
      work.width = W; work.height = H;
      const wctx = work.getContext('2d');
      wctx.putImageData(imageData, 0, 0);

      const base = document.createElement('canvas');
      base.width = W; base.height = H;
      const bctx = base.getContext('2d');
      bctx.putImageData(beforeData, 0, 0);
      bctx.globalCompositeOperation = blendMode;
      bctx.drawImage(work, 0, 0);

      const composited = bctx.getImageData(0, 0, W, H);
      imageData.data.set(composited.data);
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(pillGroup({
      label: 'Type',
      options: [
        { value: 'film',    label: 'Film' },
        { value: 'perlin',  label: 'Perlin' },
        { value: 'random',  label: 'Random' },
        { value: 'digital', label: 'Digital' },
      ],
      value: params.type || 'film',
      onChange: (v) => onChange({ type: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Amount', min: 0, max: 100, step: 1, value: params.amount ?? 30, defaultValue: 30, suffix: '%',
      onChange: (v) => onChange({ amount: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Size', min: 0.1, max: 20, step: 0.1, value: params.size ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ size: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Contrast', min: -100, max: 100, step: 1, value: params.contrast ?? 0, defaultValue: 0,
      onChange: (v) => onChange({ contrast: v }),
    }));
    root.appendChild(toggleRow({
      label: 'Monochrome',
      value: params.monochrome !== false,
      onChange: (v) => onChange({ monochrome: v }),
      align: 'left',
    }));
    root.appendChild(sliderRow({
      label: 'Seed', min: 1, max: 99, step: 1, value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
    }));
    root.appendChild(selectRow({
      label: 'Blend',
      options: BLEND_MODES.map((m) => ({ value: m, label: BLEND_LABELS[m] || m })),
      value: params.blendMode || 'source-over',
      onChange: (v) => onChange({ blendMode: v }),
    }));
    return root;
  },
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function cloneImageData(src) {
  const out = new ImageData(src.width, src.height);
  out.data.set(src.data);
  return out;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Uniform white noise per pixel.
function applyRandom(d, W, H, strength, mono, seed) {
  const rand = mulberry32(seed * 0x9E3779B1);
  const amp = 80 * strength;
  for (let i = 0; i < d.length; i += 4) {
    if (mono) {
      const n = (rand() * 2 - 1) * amp;
      d[i]     = clip255(d[i]     + n);
      d[i + 1] = clip255(d[i + 1] + n);
      d[i + 2] = clip255(d[i + 2] + n);
    } else {
      d[i]     = clip255(d[i]     + (rand() * 2 - 1) * amp);
      d[i + 1] = clip255(d[i + 1] + (rand() * 2 - 1) * amp);
      d[i + 2] = clip255(d[i + 2] + (rand() * 2 - 1) * amp);
    }
  }
}

// Harsh, contrasty noise (digital-sensor look).
function applyDigital(d, W, H, strength, mono, seed) {
  const rand = mulberry32(seed * 0x85EBCA6B);
  const amp = 140 * strength;
  for (let i = 0; i < d.length; i += 4) {
    const f = mono ? sign(rand() - 0.5) * amp * (rand() ** 0.4) : 0;
    if (mono) {
      d[i]     = clip255(d[i]     + f);
      d[i + 1] = clip255(d[i + 1] + f);
      d[i + 2] = clip255(d[i + 2] + f);
    } else {
      d[i]     = clip255(d[i]     + sign(rand() - 0.5) * amp * (rand() ** 0.4));
      d[i + 1] = clip255(d[i + 1] + sign(rand() - 0.5) * amp * (rand() ** 0.4));
      d[i + 2] = clip255(d[i + 2] + sign(rand() - 0.5) * amp * (rand() ** 0.4));
    }
  }
}

// Perlin-style smooth value noise — produces softer film-like grain at larger sizes.
function applyPerlin(d, W, H, strength, size, mono, seed) {
  const amp = 80 * strength;
  const noise = makeValueNoise(W, H, size, seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const n = (noise(x, y) * 2 - 1) * amp;
    if (mono) {
      d[i]     = clip255(d[i]     + n);
      d[i + 1] = clip255(d[i + 1] + n);
      d[i + 2] = clip255(d[i + 2] + n);
    } else {
      const n2 = (noise(x + 1000, y) * 2 - 1) * amp;
      const n3 = (noise(x, y + 1000) * 2 - 1) * amp;
      d[i]     = clip255(d[i]     + n);
      d[i + 1] = clip255(d[i + 1] + n2);
      d[i + 2] = clip255(d[i + 2] + n3);
    }
  }
}

// Multi-octave value noise + slight warm tint for a paper-grain feel.
function applyFilm(d, W, H, strength, size, mono, seed) {
  const amp = 70 * strength;
  const noise = makeValueNoise(W, H, size, seed);
  const noise2 = makeValueNoise(W, H, Math.max(1, size * 2), seed + 17);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const n = ((noise(x, y) * 0.6 + noise2(x, y) * 0.4) * 2 - 1) * amp;
    if (mono) {
      d[i]     = clip255(d[i]     + n * 1.05); // slight warm tint
      d[i + 1] = clip255(d[i + 1] + n);
      d[i + 2] = clip255(d[i + 2] + n * 0.9);
    } else {
      const n2 = ((noise(x + 500, y) * 0.6 + noise2(x + 500, y) * 0.4) * 2 - 1) * amp;
      const n3 = ((noise(x, y + 500) * 0.6 + noise2(x, y + 500) * 0.4) * 2 - 1) * amp;
      d[i]     = clip255(d[i]     + n);
      d[i + 1] = clip255(d[i + 1] + n2);
      d[i + 2] = clip255(d[i + 2] + n3);
    }
  }
}

// Simple grid value-noise with bilinear interpolation. Returns a sample(x,y) fn.
function makeValueNoise(W, H, cellSize, seed) {
  const rand = mulberry32(seed * 0xBF58476D);
  const cw = Math.ceil(W / cellSize) + 2;
  const ch = Math.ceil(H / cellSize) + 2;
  const grid = new Float32Array(cw * ch);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return (x, y) => {
    const fx = (x % (cw * cellSize)) / cellSize;
    const fy = (y % (ch * cellSize)) / cellSize;
    const ix = Math.floor(fx) % cw;
    const iy = Math.floor(fy) % ch;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const ix1 = (ix + 1) % cw;
    const iy1 = (iy + 1) % ch;
    const a = grid[iy * cw + ix];
    const b = grid[iy * cw + ix1];
    const c = grid[iy1 * cw + ix];
    const dd = grid[iy1 * cw + ix1];
    // Smoothstep for a softer interpolation than linear.
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = a + (b - a) * sx;
    const bot = c + (dd - c) * sx;
    return top + (bot - top) * sy;
  };
}

function clip255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function sign(v) { return v < 0 ? -1 : 1; }
