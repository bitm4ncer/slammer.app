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

import { sliderRow, sliderRowLg, pillGroup, makeRoot } from '../../shared/ui-helpers.js';
import { createAngleDistanceWidget } from '../../shared/angle-distance-widget.js';
import { createXYPadWidget } from '../../shared/xy-pad-widget.js';

const MAX_RADIUS    = 100;
const MAX_LENGTH    = 400;
const MAX_STRENGTH  = 200;     // radial-zoom strength (px at edge)
const MAX_SPIN      = 90;      // radial-spin spread in degrees
const SAMPLES_CAP   = 32;      // quality cap for directional / radial

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

  process(imageData, params, ctx) {
    const W = imageData.width;
    const H = imageData.height;
    if (W < 2 || H < 2) return imageData;

    const kernel = params.kernel || 'normal';
    const mode   = params.mode === 'inner' ? 'inner' : 'outer';
    const rect   = ctx?.contentRect || { x: 0, y: 0, w: W, h: H };

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
      const cx = rect.x + (clamp(params.centerX ?? 50, 0, 100) / 100) * (rect.w - 1);
      const cy = rect.y + (clamp(params.centerY ?? 50, 0, 100) / 100) * (rect.h - 1);
      if (sub === 'zoom') {
        const strength = clamp(Math.round(params.strength ?? 24), 0, MAX_STRENGTH);
        if (strength > 0) radialZoomBlur(imageData, cx, cy, strength);
      } else {
        const spread = clamp(params.spin ?? 30, 0, MAX_SPIN);
        if (spread > 0) radialSpinBlur(imageData, cx, cy, spread * Math.PI / 180);
      }
    } else {
      // Normal — GPU-accelerated canvas filter (orders of magnitude faster
      // than a JS box blur). Falls back to the 3-pass JS box blur when
      // ctx.filter isn't available (very old browsers).
      const r = clamp(Math.floor(params.radius ?? 0), 0, MAX_RADIUS);
      if (r > 0) {
        if (!gpuBoxBlur(imageData, r)) {
          boxBlur3Pass(imageData, r);
        }
      }
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
    normalWrap.appendChild(sliderRowLg({
      label: 'Radius', min: 0, max: MAX_RADIUS, step: 1,
      value: params.radius ?? 4, defaultValue: 4, suffix: 'px',
      onChange: (v) => onChange({ radius: v }),
    }));
    root.appendChild(normalWrap);

    const dirWrap = document.createElement('div');
    dirWrap.className = 'blur-kernel-group';
    dirWrap.appendChild(createAngleDistanceWidget({
      angle: params.angle ?? 0,
      distance: params.length ?? 24,
      maxDistance: MAX_LENGTH,
      visualMax: 200,
      size: 88,
      defaultAngle: 0,
      defaultDistance: 24,
      onChange: ({ angle, distance }) => onChange({ angle, length: distance }),
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

    radWrap.appendChild(createXYPadWidget({
      x: params.centerX ?? 50,
      y: params.centerY ?? 50,
      defaultX: 50,
      defaultY: 50,
      onChange: ({ x, y }) => onChange({ centerX: x, centerY: y }),
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

// GPU-accelerated normal blur via 2D canvas filter. Returns true on success,
// false if the runtime doesn't support ctx.filter. Browsers map this to a
// real Gaussian blur on the GPU compositor — typically 50-100× faster than
// a JS box blur for medium / large images.
function gpuBoxBlur(imageData, r) {
  try {
    const W = imageData.width, H = imageData.height;
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(W, H)
      : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = c.getContext('2d');
    if (!ctx || !('filter' in ctx)) return false;
    // Stage the input pixels via an intermediate canvas so the filter is
    // applied during drawImage.
    const stage = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(W, H)
      : Object.assign(document.createElement('canvas'), { width: W, height: H });
    stage.getContext('2d').putImageData(imageData, 0, 0);
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(stage, 0, 0);
    const out = ctx.getImageData(0, 0, W, H);
    imageData.data.set(out.data);
    return true;
  } catch (_) {
    return false;
  }
}

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
//
// Premultiplied-alpha averaging: transparent samples contribute 0 to the
// colour sum but still count toward the alpha average. Without this, sampling
// across a shape edge into the transparent pad pulls colour toward black and
// makes outer-mode streaks look broken.
function directionalBlur(imageData, length, angle) {
  const W = imageData.width;
  const H = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;

  const samples = Math.min(SAMPLES_CAP, Math.max(2, Math.ceil(length / 4) + 2));
  const invSamples = 1 / samples;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const half = length / 2;
  const stepX = dx * length / (samples - 1);
  const stepY = dy * length / (samples - 1);
  const Wm = W - 1, Hm = H - 1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sR = 0, sG = 0, sB = 0, sA = 0;
      const startX = x - dx * half;
      const startY = y - dy * half;
      for (let s = 0; s < samples; s++) {
        let sx = startX + stepX * s;
        let sy = startY + stepY * s;
        // Inlined bilinear sample with edge clamp.
        if (sx < 0) sx = 0; else if (sx > Wm) sx = Wm;
        if (sy < 0) sy = 0; else if (sy > Hm) sy = Hm;
        const x0 = sx | 0, y0 = sy | 0;
        const x1 = x0 < Wm ? x0 + 1 : Wm;
        const y1 = y0 < Hm ? y0 + 1 : Hm;
        const fx = sx - x0, fy = sy - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const i00 = (y0 * W + x0) << 2;
        const i10 = (y0 * W + x1) << 2;
        const i01 = (y1 * W + x0) << 2;
        const i11 = (y1 * W + x1) << 2;
        const a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
        if (a > 0) {
          const r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
          const g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
          const b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
          sR += r * a;
          sG += g * a;
          sB += b * a;
          sA += a;
        }
      }
      const idx = (y * W + x) << 2;
      const outA = sA * invSamples;
      if (sA > 0) {
        const inv = 1 / sA;
        dst[idx]     = sR * inv;
        dst[idx + 1] = sG * inv;
        dst[idx + 2] = sB * inv;
      } else {
        dst[idx] = dst[idx + 1] = dst[idx + 2] = 0;
      }
      dst[idx + 3] = outA;
    }
  }
}

// Radial zoom blur — for each pixel, sample N points along the radial
// line from the centre, spanning ±strength along that direction.
//
// Math note: original used `scale = strength * dist/maxD` and `ux = ddx/dist`,
// then `sx = x + ux * scale * t = x + (ddx/dist) * (strength*dist/maxD) * t`.
// `dist` cancels — sx = x + ddx * (strength/maxD) * t. We pre-compute that
// `factor[s] = (strength/maxD) * t` once per process call; per pixel work
// drops to `sx = x + ddx * factor[s]` — no sqrt, no division.
function radialZoomBlur(imageData, cx, cy, strength) {
  const W = imageData.width;
  const H = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;
  const samples = Math.min(SAMPLES_CAP, Math.max(2, Math.ceil(strength / 4) + 2));
  const invSamples = 1 / samples;
  const maxD = Math.sqrt(W * W + H * H) / 2;
  const Wm = W - 1, Hm = H - 1;
  const stepT = 2 / (samples - 1);

  // Pre-compute per-sample stretch factor.
  const factor = new Float32Array(samples);
  const k = strength / maxD;
  for (let s = 0; s < samples; s++) factor[s] = k * (-1 + stepT * s);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ddx = x - cx;
      const ddy = y - cy;
      const idx = (y * W + x) << 2;
      let sR = 0, sG = 0, sB = 0, sA = 0;
      for (let s = 0; s < samples; s++) {
        const f = factor[s];
        let sx = x + ddx * f;
        let sy = y + ddy * f;
        if (sx < 0) sx = 0; else if (sx > Wm) sx = Wm;
        if (sy < 0) sy = 0; else if (sy > Hm) sy = Hm;
        const x0 = sx | 0, y0 = sy | 0;
        const x1 = x0 < Wm ? x0 + 1 : Wm;
        const y1 = y0 < Hm ? y0 + 1 : Hm;
        const fx = sx - x0, fy = sy - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const i00 = (y0 * W + x0) << 2;
        const i10 = (y0 * W + x1) << 2;
        const i01 = (y1 * W + x0) << 2;
        const i11 = (y1 * W + x1) << 2;
        const a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
        if (a > 0) {
          const r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
          const g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
          const b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
          sR += r * a; sG += g * a; sB += b * a;
          sA += a;
        }
      }
      const outA = sA * invSamples;
      if (sA > 0) {
        const inv = 1 / sA;
        dst[idx]     = sR * inv;
        dst[idx + 1] = sG * inv;
        dst[idx + 2] = sB * inv;
      } else {
        dst[idx] = dst[idx + 1] = dst[idx + 2] = 0;
      }
      dst[idx + 3] = outA;
    }
  }
}

// Radial spin blur — for each pixel, sample N points rotated around the
// centre by ±spread radians.
//
// Math note: rotating (ddx, ddy) by angle alpha gives
//   ddx' = ddx*cos(alpha) - ddy*sin(alpha)
//   ddy' = ddx*sin(alpha) + ddy*cos(alpha)
// so sx = cx + ddx', sy = cy + ddy'. cos(alpha)/sin(alpha) only depend on
// the sample index — pre-compute once. No per-pixel atan2, no per-sample
// cos/sin, no sqrt.
function radialSpinBlur(imageData, cx, cy, spread) {
  const W = imageData.width;
  const H = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;
  const samples = Math.min(SAMPLES_CAP, Math.max(3, Math.ceil(spread * 16) + 1));
  const invSamples = 1 / samples;
  const Wm = W - 1, Hm = H - 1;
  const stepT = 2 / (samples - 1);

  // Pre-compute (cos, sin) per sample.
  const cosL = new Float32Array(samples);
  const sinL = new Float32Array(samples);
  for (let s = 0; s < samples; s++) {
    const a = spread * (-1 + stepT * s);
    cosL[s] = Math.cos(a);
    sinL[s] = Math.sin(a);
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ddx = x - cx, ddy = y - cy;
      const idx = (y * W + x) << 2;
      let sR = 0, sG = 0, sB = 0, sA = 0;
      for (let s = 0; s < samples; s++) {
        const ca = cosL[s], sa = sinL[s];
        let sx = cx + ddx * ca - ddy * sa;
        let sy = cy + ddy * ca + ddx * sa;
        if (sx < 0) sx = 0; else if (sx > Wm) sx = Wm;
        if (sy < 0) sy = 0; else if (sy > Hm) sy = Hm;
        const x0 = sx | 0, y0 = sy | 0;
        const x1 = x0 < Wm ? x0 + 1 : Wm;
        const y1 = y0 < Hm ? y0 + 1 : Hm;
        const fx = sx - x0, fy = sy - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const i00 = (y0 * W + x0) << 2;
        const i10 = (y0 * W + x1) << 2;
        const i01 = (y1 * W + x0) << 2;
        const i11 = (y1 * W + x1) << 2;
        const a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
        if (a > 0) {
          const r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
          const g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
          const b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
          sR += r * a; sG += g * a; sB += b * a;
          sA += a;
        }
      }
      const outA = sA * invSamples;
      if (sA > 0) {
        const inv = 1 / sA;
        dst[idx]     = sR * inv;
        dst[idx + 1] = sG * inv;
        dst[idx + 2] = sB * inv;
      } else {
        dst[idx] = dst[idx + 1] = dst[idx + 2] = 0;
      }
      dst[idx + 3] = outA;
    }
  }
}

// Bilinear sampling is now inlined in each kernel for performance — function
// call + array allocation per sample was a 30% overhead on the radial paths.
