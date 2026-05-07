// Ripple — radial / directional wave distortion.
// For each output pixel (x, y) the displacement is derived from a wave
// function evaluated at the pixel's distance from a configurable center.
// Edge mode: clamp. Output is a fresh ImageData.

import { sliderRow, pillGroup, makeRoot } from '../../shared/ui-helpers.js';

const TWO_PI = Math.PI * 2;

// ---------- wave functions (return value in [-1, +1]) ----------
function waveSine(t)     { return Math.sin(t); }
function waveTriangle(t) { return (2 / Math.PI) * Math.asin(Math.sin(t)); }
function waveSquare(t)   { return Math.sign(Math.sin(t)); }
function waveSawtooth(t) {
  const n = t / TWO_PI;
  return 2 * (n - Math.floor(n + 0.5));
}

const WAVE_FNS = { sine: waveSine, triangle: waveTriangle, square: waveSquare, sawtooth: waveSawtooth };

// ---------- bilinear sampler ----------
function sampleBilinear(src, W, H, sx, sy) {
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = x0 + 1, y1 = y0 + 1;
  const fx = sx - x0, fy = sy - y0;
  const cx0 = x0 < 0 ? 0 : x0 >= W ? W - 1 : x0;
  const cx1 = x1 < 0 ? 0 : x1 >= W ? W - 1 : x1;
  const cy0 = y0 < 0 ? 0 : y0 >= H ? H - 1 : y0;
  const cy1 = y1 < 0 ? 0 : y1 >= H ? H - 1 : y1;
  const i00 = (cy0 * W + cx0) * 4;
  const i10 = (cy0 * W + cx1) * 4;
  const i01 = (cy1 * W + cx0) * 4;
  const i11 = (cy1 * W + cx1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  return [
    src[i00]     * w00 + src[i10]     * w10 + src[i01]     * w01 + src[i11]     * w11,
    src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11,
    src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11,
    src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11,
  ];
}

function sampleNearest(src, W, H, sx, sy) {
  const x = Math.round(sx) < 0 ? 0 : Math.round(sx) >= W ? W - 1 : Math.round(sx);
  const y = Math.round(sy) < 0 ? 0 : Math.round(sy) >= H ? H - 1 : Math.round(sy);
  const i = (y * W + x) * 4;
  return [src[i], src[i + 1], src[i + 2], src[i + 3]];
}

export default {
  id: 'ripple',
  name: 'Ripple',
  version: '1.0.0',
  type: 'filter',
  icon: 'bullseye',
  category: 'distort',
  pro: true,
  pack: 'liquid-pack',

  defaultParams() {
    return {
      scope:      'image',   // 'image' | 'layer' — anchor + alpha mask
      centerX:     50,       // 0..100 %
      centerY:     50,       // 0..100 %
      wavelength:  30,       // 5..200 px
      amplitude:   10,       // 0..80 px
      phase:        0,       // 0..360 °
      decay:        0.5,     // 0..1
      waveShape:  'sine',    // sine | triangle | square | sawtooth
      polarisation: 'radial',// radial | horizontal | vertical | diagonal
      sampling:  'bilinear', // bilinear | nearest
      mix:         100,      // 0..100 %
    };
  },

  process(imageData, params, ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const amplitude  = Math.max(0, Math.min(80,  params.amplitude  ?? 10));
    const mix        = Math.max(0, Math.min(100, params.mix        ?? 100)) / 100;

    // Early-out: no-op
    if (amplitude === 0 || mix === 0) return imageData;

    const scope = params.scope === 'layer' ? 'layer' : 'image';
    const rect = (scope === 'image' && ctx?.contentRect)
      ? ctx.contentRect
      : { x: 0, y: 0, w: W, h: H };

    const wavelength = Math.max(1,   params.wavelength  ?? 30);
    const phase      = (params.phase ?? 0) / 360;
    const decay      = Math.max(0, Math.min(1, params.decay ?? 0.5));
    const cx         = rect.x + rect.w * (params.centerX ?? 50) / 100;
    const cy         = rect.y + rect.h * (params.centerY ?? 50) / 100;
    const polarisation = params.polarisation || 'radial';
    const waveFn     = WAVE_FNS[params.waveShape] || waveSine;
    const sample     = params.sampling === 'nearest' ? sampleNearest : sampleBilinear;

    const maxDim = Math.max(W, H);
    const out  = new ImageData(W, H);
    const dst  = out.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const di = (y * W + x) * 4;

        // 1. Distance used for wave phase (depends on polarisation)
        let d;
        const dx = x - cx;
        const dy = y - cy;
        if (polarisation === 'radial') {
          d = Math.sqrt(dx * dx + dy * dy);
        } else if (polarisation === 'horizontal') {
          d = Math.abs(dx);
        } else if (polarisation === 'vertical') {
          d = Math.abs(dy);
        } else { // diagonal
          d = (dx + dy) / Math.SQRT2;
        }

        // 2. Wave value in [-1, +1]
        const t = (d / wavelength + phase) * TWO_PI;
        const waveValue = waveFn(t);

        // 3. Decay factor
        const decayFactor = Math.exp(-decay * d / maxDim);

        // 4. Displacement
        const disp = amplitude * waveValue * decayFactor;
        let sdx = 0, sdy = 0;

        if (polarisation === 'radial') {
          if (d > 0.5) {
            sdx = disp * dx / d;
            sdy = disp * dy / d;
          }
          // else: pixel is at center — no displacement
        } else if (polarisation === 'horizontal') {
          sdx = disp;
        } else if (polarisation === 'vertical') {
          sdy = disp;
        } else { // diagonal
          sdx = disp;
          sdy = disp;
        }

        // 5. Sample source at displaced coords
        const [r, g, b, a] = sample(src, W, H, x + sdx, y + sdy);

        // 6. Mix with original
        if (mix >= 1) {
          dst[di]     = r;
          dst[di + 1] = g;
          dst[di + 2] = b;
          dst[di + 3] = a;
        } else {
          const invMix = 1 - mix;
          dst[di]     = src[di]     * invMix + r * mix;
          dst[di + 1] = src[di + 1] * invMix + g * mix;
          dst[di + 2] = src[di + 2] * invMix + b * mix;
          dst[di + 3] = src[di + 3] * invMix + a * mix;
        }
      }
    }

    if (scope === 'image') {
      const xMin = Math.max(0, rect.x);
      const yMin = Math.max(0, rect.y);
      const xMax = Math.min(W, rect.x + rect.w);
      const yMax = Math.min(H, rect.y + rect.h);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const di = (y * W + x) * 4;
          if (x < xMin || x >= xMax || y < yMin || y >= yMax) {
            dst[di]     = src[di];
            dst[di + 1] = src[di + 1];
            dst[di + 2] = src[di + 2];
            dst[di + 3] = src[di + 3];
          } else {
            dst[di + 3] = src[di + 3];
          }
        }
      }
    }

    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { ...params };

    function set(patch) {
      Object.assign(local, patch);
      onChange(patch);
    }

    root.appendChild(pillGroup({
      label: 'Scope',
      options: [
        { value: 'image', label: 'Image' },
        { value: 'layer', label: 'Layer' },
      ],
      value: local.scope === 'layer' ? 'layer' : 'image',
      onChange: (v) => set({ scope: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Center X', min: 0, max: 100, step: 1,
      value: local.centerX ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => set({ centerX: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Center Y', min: 0, max: 100, step: 1,
      value: local.centerY ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => set({ centerY: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Wavelength', min: 5, max: 200, step: 1,
      value: local.wavelength ?? 30, defaultValue: 30, suffix: 'px',
      onChange: (v) => set({ wavelength: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Amplitude', min: 0, max: 80, step: 1,
      value: local.amplitude ?? 10, defaultValue: 10, suffix: 'px',
      onChange: (v) => set({ amplitude: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Phase', min: 0, max: 360, step: 1,
      value: local.phase ?? 0, defaultValue: 0, suffix: '°',
      onChange: (v) => set({ phase: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Decay', min: 0, max: 1, step: 0.01,
      value: local.decay ?? 0.5, defaultValue: 0.5,
      onChange: (v) => set({ decay: v }),
    }));

    root.appendChild(pillGroup({
      label: 'Wave',
      options: [
        { value: 'sine',     label: 'Sine' },
        { value: 'triangle', label: 'Tri' },
        { value: 'square',   label: 'Sq' },
        { value: 'sawtooth', label: 'Saw' },
      ],
      value: local.waveShape || 'sine',
      onChange: (v) => set({ waveShape: v }),
    }));

    root.appendChild(pillGroup({
      label: 'Polar',
      options: [
        { value: 'radial',     label: 'Radial' },
        { value: 'horizontal', label: 'H' },
        { value: 'vertical',   label: 'V' },
        { value: 'diagonal',   label: 'Diag' },
      ],
      value: local.polarisation || 'radial',
      onChange: (v) => set({ polarisation: v }),
    }));

    root.appendChild(pillGroup({
      label: 'Sample',
      options: [
        { value: 'bilinear', label: 'Bilinear' },
        { value: 'nearest',  label: 'Nearest' },
      ],
      value: local.sampling || 'bilinear',
      onChange: (v) => set({ sampling: v }),
    }));

    root.appendChild(sliderRow({
      label: 'Mix', min: 0, max: 100, step: 1,
      value: local.mix ?? 100, defaultValue: 100, suffix: '%',
      onChange: (v) => set({ mix: v }),
    }));

    return root;
  },
};
