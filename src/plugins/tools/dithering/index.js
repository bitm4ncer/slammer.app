// Dithering — Tool. Phase 4 rework: size slider, Halftone default, fixed RGB/CMYK,
// palette Multi mode, transparent-light toggle, grouped algorithm picker.

import { sliderRow, makeToolRoot, colorRow } from '../../shared/ui-helpers.js';
import { dither } from './algorithms/index.js';

export const ALGORITHM_GROUPS = [
  { label: 'Error Diffusion', items: [
    { value: 'floydSteinberg', label: 'Floyd-Steinberg' },
    { value: 'atkinson',       label: 'Atkinson' },
    { value: 'jarvis',         label: 'Jarvis' },
    { value: 'stucki',         label: 'Stucki' },
    { value: 'burkes',         label: 'Burkes' },
    { value: 'sierra',         label: 'Sierra' },
    { value: 'sierra2Row',     label: 'Sierra 2-row' },
    { value: 'sierraLite',     label: 'Sierra Lite' },
  ]},
  { label: 'Ordered', items: [
    { value: 'bayer2',     label: 'Bayer 2×2' },
    { value: 'bayer4',     label: 'Bayer 4×4' },
    { value: 'bayer8',     label: 'Bayer 8×8' },
    { value: 'threshold',  label: 'Threshold' },
    { value: 'random',     label: 'Random' },
  ]},
  { label: 'Patterns', items: [
    { value: 'halftone',    label: 'Halftone Dots' },
    { value: 'bitTone',     label: 'Bit Tone' },
    { value: 'checker',     label: 'Checker' },
    { value: 'diamond',     label: 'Diamond' },
    { value: 'gridlock',    label: 'Gridlock' },
    { value: 'mosaic',      label: 'Mosaic' },
    { value: 'wave',        label: 'Wave' },
    { value: 'sineWave',    label: 'Sine Wave' },
    { value: 'circuitGrid', label: 'Circuit Grid' },
    { value: 'radialBurst', label: 'Radial Burst' },
    { value: 'vortex',      label: 'Vortex' },
  ]},
];

export const COLOR_MODES = [
  { value: 'halftone', label: 'Halftone' },
  { value: 'multi',    label: 'Multi' },
  { value: 'rgb',      label: 'RGB' },
  { value: 'cmyk',     label: 'CMYK' },
];

export default {
  id: 'dithering',
  name: 'Dithering',
  version: '2.0.0',
  type: 'tool',
  icon: 'chess-board',
  category: 'slam',

  defaultParams() {
    return {
      algorithm: 'floydSteinberg',
      colorMode: 'halftone',
      size: 100,                 // resolution scale 1-100 %
      threshold: 128,
      strength: 1,
      // Halftone (was "custom") two-colour swatches
      darkColor: '#000000',
      lightColor: '#FFFFFF',
      transparentLight: false,   // when true, light areas become transparent
      // Multi-colour palette
      palette: ['#000000', '#8aff8c', '#FF6B5B', '#F7E45A', '#FFFFFF'],
      // Algorithm-specific
      bitDepth: 1,
      mosaicSize: 8,
      patternSize: 4,
      patternAngle: 0,
      waveLength: 8,
      waveAmplitude: 4,
      waveCount: 12,
      waveThickness: 2,
      waveRotation: 0,
      waveDistance: 6,
      invert: false,
    };
  },

  process(imageData, params) {
    // Backwards-compat: old projects might have bw / custom modes saved.
    const mode = remapMode(params.colorMode);
    const work = { ...params, colorMode: mode };

    // Resolution scaling: downscale → dither → upscale (nearest-neighbour)
    const size = Math.max(1, Math.min(100, work.size ?? 100));
    if (size < 100) return processScaled(imageData, work, size / 100);
    return processOnce(imageData, work);
  },

  renderUI(params, onChange) {
    const root = makeToolRoot();
    const local = { ...params, colorMode: remapMode(params.colorMode) };

    function rebuild() {
      root.innerHTML = '';

      // Color mode pills (4 options, fits one row)
      root.appendChild(pillRow({
        label: 'Color Mode',
        options: COLOR_MODES,
        value: local.colorMode,
        onChange: (v) => { local.colorMode = v; onChange({ colorMode: v }); rebuild(); },
      }));

      // Grouped algorithm select
      root.appendChild(groupedSelectRow({
        label: 'Algorithm',
        groups: ALGORITHM_GROUPS,
        value: local.algorithm,
        onChange: (v) => { local.algorithm = v; onChange({ algorithm: v }); rebuild(); },
      }));

      // Size slider — resolution scale, controls "blockiness" of the dither pattern.
      root.appendChild(sliderRow({
        label: 'Size', min: 1, max: 100, step: 1, value: local.size,
        suffix: '%',
        onChange: (v) => { local.size = v; onChange({ size: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Threshold', min: 0, max: 255, step: 1, value: local.threshold,
        onChange: (v) => { local.threshold = v; onChange({ threshold: v }); },
      }));
      root.appendChild(sliderRow({
        label: 'Strength', min: 0, max: 1, step: 0.01, value: local.strength,
        onChange: (v) => { local.strength = v; onChange({ strength: v }); },
      }));

      if (local.colorMode === 'halftone') {
        root.appendChild(colorRow({
          label: 'Dark', value: local.darkColor,
          onChange: (v) => { local.darkColor = v; onChange({ darkColor: v }); },
        }));
        if (!local.transparentLight) {
          root.appendChild(colorRow({
            label: 'Light', value: local.lightColor,
            onChange: (v) => { local.lightColor = v; onChange({ lightColor: v }); },
          }));
        }
        root.appendChild(toggleRow({
          label: 'Transparent Light',
          value: local.transparentLight,
          onChange: (v) => { local.transparentLight = v; onChange({ transparentLight: v }); rebuild(); },
        }));
      }

      if (local.colorMode === 'multi') {
        root.appendChild(buildPaletteEditor(local, onChange, rebuild));
      }

      // Algorithm-specific extra rows
      if (local.algorithm === 'mosaic') {
        root.appendChild(sliderRow({
          label: 'Mosaic Size', min: 2, max: 64, step: 1, value: local.mosaicSize,
          onChange: (v) => { local.mosaicSize = v; onChange({ mosaicSize: v }); },
        }));
      }
      if (['sineWave', 'wave'].includes(local.algorithm)) {
        root.appendChild(sliderRow({
          label: 'Wavelength', min: 2, max: 64, step: 1, value: local.waveLength,
          onChange: (v) => { local.waveLength = v; onChange({ waveLength: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'Amplitude', min: 0, max: 32, step: 1, value: local.waveAmplitude,
          onChange: (v) => { local.waveAmplitude = v; onChange({ waveAmplitude: v }); },
        }));
      }
      if (['halftone', 'checker', 'gridlock', 'circuitGrid', 'diamond', 'bitTone'].includes(local.algorithm)) {
        root.appendChild(sliderRow({
          label: 'Pattern Size', min: 2, max: 32, step: 1, value: local.patternSize,
          onChange: (v) => { local.patternSize = v; onChange({ patternSize: v }); },
        }));
      }
      if (['halftone', 'gridlock', 'mosaic'].includes(local.algorithm)) {
        root.appendChild(sliderRow({
          label: 'Angle', min: 0, max: 90, step: 1, value: local.patternAngle,
          onChange: (v) => { local.patternAngle = v; onChange({ patternAngle: v }); },
        }));
      }
      if (local.algorithm === 'bitTone') {
        root.appendChild(sliderRow({
          label: 'Bit Depth', min: 1, max: 7, step: 1, value: local.bitDepth,
          onChange: (v) => { local.bitDepth = v; onChange({ bitDepth: v }); },
        }));
      }
    }

    rebuild();
    return root;
  },
};

// ---------- Processing ----------

function processOnce(imageData, params) {
  switch (params.colorMode) {
    case 'halftone': return runHalftone(imageData, params);
    case 'multi':    return runMulti(imageData, params);
    case 'rgb':      return runRgb(imageData, params);
    case 'cmyk':     return runCmyk(imageData, params);
    default:         return runHalftone(imageData, params);
  }
}

// Snapshot helper — clone imageData since the dither algos mutate.
function cloneImageData(imageData) {
  const out = new ImageData(imageData.width, imageData.height);
  out.data.set(imageData.data);
  return out;
}

function runHalftone(imageData, params) {
  // Save original alpha so transparent areas stay transparent.
  const srcAlpha = new Uint8ClampedArray(imageData.data.length / 4);
  for (let i = 0, p = 0; i < imageData.data.length; i += 4, p++) srcAlpha[p] = imageData.data[i + 3];
  // Run dither — produces RGB-equal binary mask.
  const out = dither(imageData, params);
  const d = out.data;
  const dark = hexToRgb(params.darkColor || '#000000');
  const light = hexToRgb(params.lightColor || '#FFFFFF');
  const transparentLight = !!params.transparentLight;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const on = d[i] >= 128;
    if (on) {
      if (transparentLight) {
        // Light area becomes transparent; preserve original alpha as zero where dithered "light".
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
      } else {
        d[i] = light.r; d[i + 1] = light.g; d[i + 2] = light.b; d[i + 3] = srcAlpha[p];
      }
    } else {
      d[i] = dark.r; d[i + 1] = dark.g; d[i + 2] = dark.b; d[i + 3] = srcAlpha[p];
    }
  }
  return out;
}

function runRgb(imageData, params) {
  const W = imageData.width, H = imageData.height;
  const src = imageData.data;
  const channels = [extractChannel(src, W, H, 0), extractChannel(src, W, H, 1), extractChannel(src, W, H, 2)];
  const dithered = channels.map((ch) => dither(ch, params));
  const out = imageData;
  const od = out.data;
  for (let i = 0, p = 0; i < od.length; i += 4, p++) {
    od[i]     = dithered[0].data[i] >= 128 ? 255 : 0;
    od[i + 1] = dithered[1].data[i] >= 128 ? 255 : 0;
    od[i + 2] = dithered[2].data[i] >= 128 ? 255 : 0;
    od[i + 3] = src[i + 3];
  }
  return out;
}

function runCmyk(imageData, params) {
  const W = imageData.width, H = imageData.height;
  const src = new Uint8ClampedArray(imageData.data); // snapshot before mutation
  // Per-channel CMYK as separate ImageData.
  const c = new ImageData(W, H);
  const m = new ImageData(W, H);
  const y = new ImageData(W, H);
  const k = new ImageData(W, H);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i] / 255, g = src[i + 1] / 255, b = src[i + 2] / 255;
    const kk = 1 - Math.max(r, g, b);
    const cc = kk === 1 ? 0 : (1 - r - kk) / (1 - kk);
    const mm = kk === 1 ? 0 : (1 - g - kk) / (1 - kk);
    const yy = kk === 1 ? 0 : (1 - b - kk) / (1 - kk);
    setRgbA(c.data, i, cc * 255, src[i + 3]);
    setRgbA(m.data, i, mm * 255, src[i + 3]);
    setRgbA(y.data, i, yy * 255, src[i + 3]);
    setRgbA(k.data, i, kk * 255, src[i + 3]);
  }
  const cR = dither(c, params).data;
  const mR = dither(m, params).data;
  const yR = dither(y, params).data;
  const kR = dither(k, params).data;
  const od = imageData.data;
  for (let i = 0; i < od.length; i += 4) {
    const ci = cR[i] >= 128 ? 1 : 0;
    const mi = mR[i] >= 128 ? 1 : 0;
    const yi = yR[i] >= 128 ? 1 : 0;
    const ki = kR[i] >= 128 ? 1 : 0;
    od[i]     = Math.round(255 * (1 - ci) * (1 - ki));
    od[i + 1] = Math.round(255 * (1 - mi) * (1 - ki));
    od[i + 2] = Math.round(255 * (1 - yi) * (1 - ki));
    od[i + 3] = src[i + 3];
  }
  return imageData;
}

function runMulti(imageData, params) {
  // Palette dithering with Floyd-Steinberg-style error diffusion against the palette.
  // Falls back to simple nearest if the user picked a non-error-diffusion algorithm —
  // that path uses ordered/threshold luminance bands.
  const palette = (params.palette || []).map(hexToRgb).filter(Boolean);
  if (!palette.length) return imageData;

  const errorDiffusion = ['floydSteinberg', 'atkinson', 'jarvis', 'stucki', 'burkes', 'sierra', 'sierra2Row', 'sierraLite']
    .includes(params.algorithm);

  if (errorDiffusion) return runMultiErrorDiffusion(imageData, palette, params);
  return runMultiOrdered(imageData, palette, params);
}

function runMultiErrorDiffusion(imageData, palette, params) {
  const W = imageData.width, H = imageData.height;
  const d = imageData.data;
  const strength = params.strength ?? 1;
  // Mutable float buffers per channel.
  const r = new Float32Array(W * H), g = new Float32Array(W * H), b = new Float32Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) { r[p] = d[i]; g[p] = d[i + 1]; b[p] = d[i + 2]; }

  function nearest(rv, gv, bv) {
    let best = palette[0], bd = Infinity;
    for (const c of palette) {
      const dr = rv - c.r, dg = gv - c.g, db = bv - c.b;
      const dd = dr * dr + dg * dg + db * db;
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }
  // Distribution weights for chosen algorithm — minimal table covers all common ones.
  const W7 = 7 / 16, W3 = 3 / 16, W5 = 5 / 16, W1 = 1 / 16;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const c = nearest(r[idx], g[idx], b[idx]);
      const er = r[idx] - c.r, eg = g[idx] - c.g, eb = b[idx] - c.b;
      const ofs = idx * 4;
      d[ofs]     = lerp(d[ofs],     c.r, strength);
      d[ofs + 1] = lerp(d[ofs + 1], c.g, strength);
      d[ofs + 2] = lerp(d[ofs + 2], c.b, strength);
      // Floyd-Steinberg distribution; good-enough for all error-diffusion algos picked here.
      if (x + 1 < W) { r[idx + 1] += er * W7; g[idx + 1] += eg * W7; b[idx + 1] += eb * W7; }
      if (y + 1 < H) {
        if (x > 0)     { r[idx + W - 1] += er * W3; g[idx + W - 1] += eg * W3; b[idx + W - 1] += eb * W3; }
        r[idx + W] += er * W5; g[idx + W] += eg * W5; b[idx + W] += eb * W5;
        if (x + 1 < W) { r[idx + W + 1] += er * W1; g[idx + W + 1] += eg * W1; b[idx + W + 1] += eb * W1; }
      }
    }
  }
  return imageData;
}

function runMultiOrdered(imageData, palette, params) {
  // Use the binary dither result as an "on/off" gate, then map luminance to nearest palette
  // colour from the original source.
  const src = new Uint8ClampedArray(imageData.data);
  dither(imageData, params); // mutates to binary mask
  const d = imageData.data;
  const strength = params.strength ?? 1;
  for (let i = 0; i < d.length; i += 4) {
    const lum = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
    const idx = Math.min(palette.length - 1, Math.floor(lum / 256 * palette.length));
    const c = palette[idx];
    d[i]     = lerp(src[i], c.r, strength);
    d[i + 1] = lerp(src[i + 1], c.g, strength);
    d[i + 2] = lerp(src[i + 2], c.b, strength);
  }
  return imageData;
}

// ---------- Resolution scaling ----------
function processScaled(imageData, params, ratio) {
  const W = imageData.width, H = imageData.height;
  const sw = Math.max(2, Math.floor(W * ratio));
  const sh = Math.max(2, Math.floor(H * ratio));

  // Downscale source via canvas
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = W; srcCanvas.height = H;
  srcCanvas.getContext('2d').putImageData(imageData, 0, 0);

  const downCanvas = document.createElement('canvas');
  downCanvas.width = sw; downCanvas.height = sh;
  const downCtx = downCanvas.getContext('2d');
  downCtx.imageSmoothingEnabled = true;
  downCtx.drawImage(srcCanvas, 0, 0, sw, sh);

  const downData = downCtx.getImageData(0, 0, sw, sh);
  const dithered = processOnce(downData, params);

  // Upscale back, nearest-neighbour for crisp blocks
  const upCanvas = document.createElement('canvas');
  upCanvas.width = sw; upCanvas.height = sh;
  upCanvas.getContext('2d').putImageData(dithered, 0, 0);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = W; dstCanvas.height = H;
  const dstCtx = dstCanvas.getContext('2d');
  dstCtx.imageSmoothingEnabled = false;
  dstCtx.drawImage(upCanvas, 0, 0, sw, sh, 0, 0, W, H);

  return dstCtx.getImageData(0, 0, W, H);
}

// ---------- Helpers ----------
function remapMode(mode) {
  // Backwards-compat: old "bw" / "custom" become "halftone".
  if (mode === 'bw' || mode === 'custom') return 'halftone';
  return mode || 'halftone';
}

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function setRgbA(data, i, gray, alpha) {
  data[i] = gray; data[i + 1] = gray; data[i + 2] = gray; data[i + 3] = alpha;
}

function extractChannel(src, W, H, channelIdx) {
  const out = new ImageData(W, H);
  const od = out.data;
  for (let i = 0; i < src.length; i += 4) {
    const v = src[i + channelIdx];
    od[i] = v; od[i + 1] = v; od[i + 2] = v; od[i + 3] = 255;
  }
  return out;
}

// ---------- Multi palette editor ----------
const PALETTE_MIN = 2;
const PALETTE_MAX = 12;

function buildPaletteEditor(local, onChange, rebuild) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-tool-row';
  const lbl = document.createElement('div');
  lbl.className = 'effect-label';
  lbl.textContent = `Palette (${local.palette.length})`;
  wrap.appendChild(lbl);

  const row = document.createElement('div');
  row.className = 'effect-swatch-row';

  const canRemove = local.palette.length > PALETTE_MIN;

  local.palette.forEach((hex, i) => {
    const sw = document.createElement('div');
    sw.className = 'effect-swatch palette-swatch';
    sw.style.background = hex;
    sw.innerHTML = `
      <input type="color" value="${hex}" />
      ${canRemove ? `<button class="palette-remove" title="Remove colour" aria-label="Remove colour">×</button>` : ''}
    `;
    const input = sw.querySelector('input');
    input.addEventListener('input', (e) => {
      const next = local.palette.slice();
      next[i] = e.target.value;
      local.palette = next;
      onChange({ palette: next });
      sw.style.background = e.target.value;
    });
    const rm = sw.querySelector('.palette-remove');
    if (rm) rm.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = local.palette.slice();
      next.splice(i, 1);
      local.palette = next;
      onChange({ palette: next });
      rebuild();
    });
    row.appendChild(sw);
  });

  if (local.palette.length < PALETTE_MAX) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'palette-add';
    addBtn.title = 'Add colour';
    addBtn.setAttribute('aria-label', 'Add colour');
    addBtn.addEventListener('click', () => {
      const next = local.palette.slice();
      next.push(randomPaletteHex(local.palette));
      local.palette = next;
      onChange({ palette: next });
      rebuild();
    });
    row.appendChild(addBtn);
  }

  wrap.appendChild(row);
  return wrap;
}

function randomPaletteHex(existing = []) {
  // Spread hue around the palette so adds don't pile on the same colour.
  const usedHues = existing.map(hexToHue).filter((v) => Number.isFinite(v));
  let h;
  for (let attempt = 0; attempt < 24; attempt++) {
    h = Math.floor(Math.random() * 360);
    if (!usedHues.some((u) => Math.abs(((u - h + 540) % 360) - 180) > 150)) break;
  }
  const s = 55 + Math.floor(Math.random() * 25); // 55-80
  const l = 48 + Math.floor(Math.random() * 18); // 48-66
  return hslToHex(h, s, l);
}
function hexToHue(hex) {
  const c = hexToRgb(hex);
  if (!c) return NaN;
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ---------- UI bits not in shared/ui-helpers ----------

function pillRow({ label, options, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-tool-row';
  const lbl = document.createElement('div');
  lbl.className = 'effect-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  const grp = document.createElement('div');
  grp.className = 'effect-pill-group';
  for (const opt of options) {
    const pill = document.createElement('button');
    pill.className = `effect-pill ${opt.value === value ? 'active' : ''}`;
    pill.textContent = opt.label;
    pill.addEventListener('click', () => onChange(opt.value));
    grp.appendChild(pill);
  }
  wrap.appendChild(grp);
  return wrap;
}

function groupedSelectRow({ label, groups, value, onChange }) {
  // Custom dropdown — native <select> popups are OS-owned and can't carry our scrollbar styling.
  const wrap = document.createElement('div');
  wrap.className = 'effect-tool-row';
  const lbl = document.createElement('div');
  lbl.className = 'effect-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);

  const dd = document.createElement('div');
  dd.className = 'custom-dropdown';
  dd.tabIndex = 0;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';
  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'custom-dropdown-label';
  trigger.appendChild(triggerLabel);
  const caret = document.createElement('span');
  caret.className = 'custom-dropdown-caret';
  trigger.appendChild(caret);
  dd.appendChild(trigger);

  // Menu lives on document.body so it can escape the effect-card's overflow:hidden.
  const menu = document.createElement('div');
  menu.className = 'custom-dropdown-menu custom-dropdown-menu--portaled';
  for (const grp of groups) {
    const head = document.createElement('div');
    head.className = 'custom-dropdown-group';
    head.textContent = grp.label;
    menu.appendChild(head);
    for (const it of grp.items) {
      const opt = document.createElement('div');
      opt.className = 'custom-dropdown-item';
      opt.dataset.value = it.value;
      opt.textContent = it.label;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        select(it.value, it.label);
        close();
      });
      menu.appendChild(opt);
    }
  }

  function flatItem(v) {
    for (const grp of groups) for (const it of grp.items) if (it.value === v) return it;
    return null;
  }
  function select(v, lab) {
    triggerLabel.textContent = lab ?? flatItem(v)?.label ?? v;
    menu.querySelectorAll('.custom-dropdown-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.value === v);
    });
    onChange(v);
  }
  function positionMenu() {
    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom;
    // Cap menu height to viewport space minus a margin; flip up if not enough below.
    const maxH = Math.min(280, Math.max(140, (spaceBelow > 200 ? spaceBelow - 16 : r.top - 16)));
    menu.style.maxHeight = `${maxH}px`;
    menu.style.width = `${r.width}px`;
    menu.style.left = `${r.left}px`;
    if (spaceBelow > 200 || spaceBelow > r.top) {
      menu.style.top = `${r.bottom + 4}px`;
      menu.style.bottom = '';
    } else {
      menu.style.top = '';
      menu.style.bottom = `${vh - r.top + 4}px`;
    }
  }
  function open() {
    dd.classList.add('open');
    document.body.appendChild(menu);
    positionMenu();
    const active = menu.querySelector('.custom-dropdown-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
    document.addEventListener('mousedown', onOutside, { capture: true });
    window.addEventListener('scroll', positionMenu, { capture: true, passive: true });
    window.addEventListener('resize', positionMenu);
  }
  function close() {
    dd.classList.remove('open');
    if (menu.parentNode) menu.parentNode.removeChild(menu);
    document.removeEventListener('mousedown', onOutside, { capture: true });
    window.removeEventListener('scroll', positionMenu, { capture: true });
    window.removeEventListener('resize', positionMenu);
  }
  function onOutside(e) {
    if (!dd.contains(e.target) && !menu.contains(e.target)) close();
  }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dd.classList.contains('open')) close();
    else open();
  });
  dd.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Init label + active marker
  const initial = flatItem(value);
  triggerLabel.textContent = initial?.label ?? value;
  menu.querySelectorAll('.custom-dropdown-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.value === value);
  });

  wrap.appendChild(dd);
  return wrap;
}

function toggleRow({ label, value, onChange }) {
  const wrap = document.createElement('label');
  wrap.className = 'effect-toggle-row';
  wrap.innerHTML = `
    <span class="effect-label">${label}</span>
    <input type="checkbox" ${value ? 'checked' : ''} />
    <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
  `;
  const input = wrap.querySelector('input');
  input.addEventListener('change', (e) => onChange(e.target.checked));
  return wrap;
}
