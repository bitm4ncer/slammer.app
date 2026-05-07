// Blur — multi-mode kernel.
//
// Kernel:
//   'normal'      — separable 3-pass box blur (Gaussian-ish).
//   'directional' — motion blur along an angle, of given length.
//   'radial'      — sub-mode 'zoom' (radial streaks from centre) or
//                   'spin' (tangential streaks around centre).
//
// Alpha mode (orthogonal to kernel):
//   'outer' — blur RGBA. Alpha bleeds outward into transparent regions.
//   'inner' — blur RGB only, restore the original alpha mask. Silhouette
//             stays crisp; only colour and tone soften inside.
//
// All modes are pure: output ImageData has the same dimensions as input.
// Canvas headroom for outer mode is provided by the renderer's
// computePadForEffects() — see src/core/vector-renderer.js.

import { sliderRow, pillGroup, makeRoot } from '../../shared/ui-helpers.js';

const MAX_RADIUS    = 100;
const MAX_LENGTH    = 200;
const MAX_STRENGTH  = 100;     // radial-zoom strength (px at edge)
const MAX_SPIN      = 90;      // radial-spin spread in degrees
const SAMPLES_CAP   = 64;      // quality cap for directional / radial

export default {
  id: 'blur',
  name: 'Blur',
  version: '2.0.0',
  type: 'filter',
  icon: 'feather',
  category: 'image',

  defaultParams() {
    return {
      kernel: 'normal',         // 'normal' | 'directional' | 'radial'
      mode: 'outer',            // 'outer' | 'inner' (alpha handling)
      radius: 4,                // normal
      angle: 0,                 // directional, degrees
      length: 24,               // directional, px
      radial: 'zoom',           // 'zoom' | 'spin'
      strength: 24,             // radial zoom px
      spin: 30,                 // radial spin degrees
      centerX: 50,              // radial centre, % of canvas
      centerY: 50,              // radial centre, % of canvas
    };
  },

  process(imageData, params) {
    const W = imageData.width;
    const H = imageData.height;
    if (W < 2 || H < 2) return imageData;

    const kernel = params.kernel || 'normal';
    const mode   = params.mode === 'inner' ? 'inner' : 'outer';

    let originalAlpha = null;
    if (mode === 'inner') {
      const px = W * H;
      originalAlpha = new Uint8ClampedArray(px);
      for (let i = 0; i < px; i++) originalAlpha[i] = imageData.data[i * 4 + 3];
    }

    if (kernel === 'directional') {
      const length = clamp(Math.round(params.length ?? 24), 0, MAX_LENGTH);
      if (length > 0) {
        const angle = (params.angle ?? 0) * Math.PI / 180;
        directionalBlur(imageData, length, angle);
      }
    } else if (kernel === 'radial') {
      const sub = params.radial === 'spin' ? 'spin' : 'zoom';
      const cx = (clamp(params.centerX ?? 50, 0, 100) / 100) * (W - 1);
      const cy = (clamp(params.centerY ?? 50, 0, 100) / 100) * (H - 1);
      if (sub === 'zoom') {
        const strength = clamp(Math.round(params.strength ?? 24), 0, MAX_STRENGTH);
        if (strength > 0) radialZoomBlur(imageData, cx, cy, strength);
      } else {
        const spread = clamp(params.spin ?? 30, 0, MAX_SPIN);
        if (spread > 0) radialSpinBlur(imageData, cx, cy, spread * Math.PI / 180);
      }
    } else {
      // Normal box blur
      const r = clamp(Math.floor(params.radius ?? 0), 0, MAX_RADIUS);
      if (r > 0) boxBlur3Pass(imageData, r);
    }

    if (mode === 'inner' && originalAlpha) {
      const data = imageData.data;
      const px = W * H;
      for (let i = 0; i < px; i++) data[i * 4 + 3] = originalAlpha[i];
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot('blur-effect');

    const kernel = params.kernel || 'normal';

    root.appendChild(pillGroup({
      label: 'Kernel',
      options: [
        { value: 'normal',      label: 'Normal' },
        { value: 'directional', label: 'Directional' },
        { value: 'radial',      label: 'Radial' },
      ],
      value: kernel,
      onChange: (v) => { onChange({ kernel: v }); refresh(v); },
    }));

    // Per-kernel groups
    const normalWrap = document.createElement('div');
    normalWrap.className = 'blur-kernel-group';
    normalWrap.appendChild(sliderRow({
      label: 'Radius', min: 0, max: MAX_RADIUS, step: 1,
      value: params.radius ?? 4, defaultValue: 4, suffix: 'px',
      onChange: (v) => onChange({ radius: v }),
    }));
    root.appendChild(normalWrap);

    const dirWrap = document.createElement('div');
    dirWrap.className = 'blur-kernel-group';
    dirWrap.appendChild(sliderRow({
      label: 'Angle', min: 0, max: 360, step: 1,
      value: params.angle ?? 0, defaultValue: 0, suffix: '°',
      onChange: (v) => onChange({ angle: v }),
    }));
    dirWrap.appendChild(sliderRow({
      label: 'Length', min: 0, max: MAX_LENGTH, step: 1,
      value: params.length ?? 24, defaultValue: 24, suffix: 'px',
      onChange: (v) => onChange({ length: v }),
    }));
    root.appendChild(dirWrap);

    const radWrap = document.createElement('div');
    radWrap.className = 'blur-kernel-group';
    radWrap.appendChild(pillGroup({
      label: 'Type',
      options: [
        { value: 'zoom', label: 'Zoom' },
        { value: 'spin', label: 'Spin' },
      ],
      value: params.radial === 'spin' ? 'spin' : 'zoom',
      onChange: (v) => { onChange({ radial: v }); refreshRadial(v); },
    }));

    const radZoomRow = sliderRow({
      label: 'Strength', min: 0, max: MAX_STRENGTH, step: 1,
      value: params.strength ?? 24, defaultValue: 24, suffix: 'px',
      onChange: (v) => onChange({ strength: v }),
    });
    const radSpinRow = sliderRow({
      label: 'Spread', min: 0, max: MAX_SPIN, step: 1,
      value: params.spin ?? 30, defaultValue: 30, suffix: '°',
      onChange: (v) => onChange({ spin: v }),
    });
    radWrap.appendChild(radZoomRow);
    radWrap.appendChild(radSpinRow);

    radWrap.appendChild(sliderRow({
      label: 'Center X', min: 0, max: 100, step: 1,
      value: params.centerX ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => onChange({ centerX: v }),
    }));
    radWrap.appendChild(sliderRow({
      label: 'Center Y', min: 0, max: 100, step: 1,
      value: params.centerY ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => onChange({ centerY: v }),
    }));
    root.appendChild(radWrap);

    // Alpha mode — orthogonal to kernel.
    root.appendChild(pillGroup({
      label: 'Alpha',
      options: [
        { value: 'outer', label: 'Outer' },
        { value: 'inner', label: 'Inner' },
      ],
      value: params.mode === 'inner' ? 'inner' : 'outer',
      onChange: (v) => onChange({ mode: v }),
    }));

    function refresh(k) {
      normalWrap.style.display = k === 'normal'      ? '' : 'none';
      dirWrap.style.display    = k === 'directional' ? '' : 'none';
      radWrap.style.display    = k === 'radial'      ? '' : 'none';
    }
    function refreshRadial(sub) {
      radZoomRow.style.display = sub === 'zoom' ? '' : 'none';
      radSpinRow.style.display = sub === 'spin' ? '' : 'none';
    }
    refresh(kernel);
    refreshRadial(params.radial === 'spin' ? 'spin' : 'zoom');

    return root;
  },
};

// ---------------------------------------------------------------------------
// Kernels
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// 3-pass separable box blur on RGBA. In-place on imageData.data.
function boxBlur3Pass(imageData, r) {
  const w = imageData.width;
  const h = imageData.height;
  let a = new Uint8ClampedArray(imageData.data);
  let b = new Uint8ClampedArray(a.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurH(a, b, w, h, r);
    boxBlurV(b, a, w, h, r);
  }
  imageData.data.set(a);
}

function boxBlurH(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let rs = 0, gs = 0, bs = 0, as = 0;
    const row = y * w;
    for (let i = -r; i <= r; i++) {
      const x = Math.max(0, Math.min(w - 1, i));
      const idx = (row + x) * 4;
      rs += src[idx]; gs += src[idx + 1]; bs += src[idx + 2]; as += src[idx + 3];
    }
    for (let x = 0; x < w; x++) {
      const out = (row + x) * 4;
      dst[out] = rs / div;
      dst[out + 1] = gs / div;
      dst[out + 2] = bs / div;
      dst[out + 3] = as / div;
      const xAdd = Math.min(w - 1, x + r + 1);
      const xRem = Math.max(0, x - r);
      const aIdx = (row + xAdd) * 4;
      const rIdx = (row + xRem) * 4;
      rs += src[aIdx] - src[rIdx];
      gs += src[aIdx + 1] - src[rIdx + 1];
      bs += src[aIdx + 2] - src[rIdx + 2];
      as += src[aIdx + 3] - src[rIdx + 3];
    }
  }
}
function boxBlurV(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let rs = 0, gs = 0, bs = 0, as = 0;
    for (let i = -r; i <= r; i++) {
      const y = Math.max(0, Math.min(h - 1, i));
      const idx = (y * w + x) * 4;
      rs += src[idx]; gs += src[idx + 1]; bs += src[idx + 2]; as += src[idx + 3];
    }
    for (let y = 0; y < h; y++) {
      const out = (y * w + x) * 4;
      dst[out] = rs / div;
      dst[out + 1] = gs / div;
      dst[out + 2] = bs / div;
      dst[out + 3] = as / div;
      const yAdd = Math.min(h - 1, y + r + 1);
      const yRem = Math.max(0, y - r);
      const aIdx = (yAdd * w + x) * 4;
      const rIdx = (yRem * w + x) * 4;
      rs += src[aIdx] - src[rIdx];
      gs += src[aIdx + 1] - src[rIdx + 1];
      bs += src[aIdx + 2] - src[rIdx + 2];
      as += src[aIdx + 3] - src[rIdx + 3];
    }
  }
}

// Directional motion blur — average N samples along a line of length L
// centred on each pixel, oriented at `angle` radians.
function directionalBlur(imageData, length, angle) {
  const W = imageData.width;
  const H = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;

  const samples = Math.min(SAMPLES_CAP, Math.max(2, length + 1));
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const half = length / 2;
  const stepX = dx * length / (samples - 1);
  const stepY = dy * length / (samples - 1);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let s = 0; s < samples; s++) {
        const sx = x - dx * half + stepX * s;
        const sy = y - dy * half + stepY * s;
        const px = sampleBilinear(src, W, H, sx, sy);
        r += px[0]; g += px[1]; b += px[2]; a += px[3];
      }
      const idx = (y * W + x) * 4;
      dst[idx]     = r / samples;
      dst[idx + 1] = g / samples;
      dst[idx + 2] = b / samples;
      dst[idx + 3] = a / samples;
    }
  }
}

// Radial zoom blur — for each pixel, sample N points along the radial
// line from the centre, spanning ±strength along that direction.
function radialZoomBlur(imageData, cx, cy, strength) {
  const W = imageData.width;
  const H = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;
  const samples = Math.min(SAMPLES_CAP, Math.max(2, strength + 1));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) {
        const idx = (y * W + x) * 4;
        dst[idx]     = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
        continue;
      }
      // Scale by distance / max-half-diag so far pixels streak more, near
      // pixels stay sharp — characteristic zoom-blur look.
      const maxD = Math.sqrt((W * W + H * H)) / 2;
      const scale = strength * (dist / maxD);
      const ux = dx / dist;
      const uy = dy / dist;
      let r = 0, g = 0, b = 0, a = 0;
      for (let s = 0; s < samples; s++) {
        const t = -1 + (2 * s) / (samples - 1); // -1 .. +1
        const sx = x + ux * scale * t;
        const sy = y + uy * scale * t;
        const px = sampleBilinear(src, W, H, sx, sy);
        r += px[0]; g += px[1]; b += px[2]; a += px[3];
      }
      const idx = (y * W + x) * 4;
      dst[idx]     = r / samples;
      dst[idx + 1] = g / samples;
      dst[idx + 2] = b / samples;
      dst[idx + 3] = a / samples;
    }
  }
}

// Radial spin blur — for each pixel, sample N points rotated around the
// centre by ±spread radians.
function radialSpinBlur(imageData, cx, cy, spread) {
  const W = imageData.width;
  const H = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;
  const samples = Math.min(SAMPLES_CAP, Math.max(3, Math.ceil(spread * 30) + 1));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) {
        const idx = (y * W + x) * 4;
        dst[idx]     = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
        continue;
      }
      const baseAngle = Math.atan2(dy, dx);
      let r = 0, g = 0, b = 0, a = 0;
      for (let s = 0; s < samples; s++) {
        const t = -1 + (2 * s) / (samples - 1); // -1 .. +1
        const ang = baseAngle + spread * t;
        const sx = cx + Math.cos(ang) * dist;
        const sy = cy + Math.sin(ang) * dist;
        const px = sampleBilinear(src, W, H, sx, sy);
        r += px[0]; g += px[1]; b += px[2]; a += px[3];
      }
      const idx = (y * W + x) * 4;
      dst[idx]     = r / samples;
      dst[idx + 1] = g / samples;
      dst[idx + 2] = b / samples;
      dst[idx + 3] = a / samples;
    }
  }
}

const _px = new Uint8ClampedArray(4);
function sampleBilinear(src, W, H, x, y) {
  // Clamp to edges (replicate).
  if (x < 0) x = 0; else if (x > W - 1) x = W - 1;
  if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * W + x0) * 4;
  const i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4;
  const i11 = (y1 * W + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  for (let c = 0; c < 4; c++) {
    _px[c] = src[i00 + c] * w00 + src[i10 + c] * w10 + src[i01 + c] * w01 + src[i11 + c] * w11;
  }
  return _px;
}
