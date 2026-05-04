// JPEG Compression — fakes JPEG block artefacts via DCT quantization on 8x8 blocks.
// Modes: artifacts (classic blocky), heavy, glitch (perturb DC coefficients), block-shift.

import { sliderRow, pillGroup, makeToolRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'jpeg-compression',
  name: 'JPEG Compression',
  version: '1.0.0',
  type: 'tool',
  icon: 'compress',
  category: 'crush',

  defaultParams() {
    return {
      blockSize: 8,
      quantization: 12,
      freqNoise: 0,
      mode: 'artifacts',
    };
  },

  process(imageData, params) {
    const N = clampPow2(params.blockSize || 8);
    const Q = Math.max(1, params.quantization ?? 12);
    const noise = (params.freqNoise || 0) / 100;
    const mode = params.mode || 'artifacts';
    const w = imageData.width, h = imageData.height;
    const d = imageData.data;
    const Y = new Float32Array(w * h);
    const Cb = new Float32Array(w * h);
    const Cr = new Float32Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      Y[p] =  0.299  * r + 0.587  * g + 0.114  * b;
      Cb[p] = -0.169 * r - 0.331  * g + 0.500  * b + 128;
      Cr[p] =  0.500 * r - 0.419  * g - 0.081  * b + 128;
    }

    const cosTbl = buildCosineTable(N);

    function processChannel(ch, qBoost = 1) {
      const Qs = Q * qBoost;
      for (let by = 0; by < h; by += N) {
        for (let bx = 0; bx < w; bx += N) {
          // Extract block (with edge clamp).
          const block = new Float32Array(N * N);
          for (let y = 0; y < N; y++) {
            const yy = Math.min(h - 1, by + y);
            for (let x = 0; x < N; x++) {
              const xx = Math.min(w - 1, bx + x);
              block[y * N + x] = ch[yy * w + xx] - 128;
            }
          }
          const dct = forwardDCT(block, N, cosTbl);
          // Quantize.
          for (let i = 0; i < dct.length; i++) {
            const u = i % N, v = Math.floor(i / N);
            const qf = 1 + (u + v) * Qs / 16;
            dct[i] = Math.round(dct[i] / qf) * qf;
            if (noise && Math.random() < noise) {
              dct[i] += (Math.random() - 0.5) * 200;
            }
            if (mode === 'glitch' && i === 0 && Math.random() < 0.04) {
              dct[i] += (Math.random() - 0.5) * 800;
            }
          }
          if (mode === 'block-shift' && Math.random() < 0.02) {
            // Swap two random coefficients.
            const a = (Math.random() * dct.length) | 0;
            const b = (Math.random() * dct.length) | 0;
            const t = dct[a]; dct[a] = dct[b]; dct[b] = t;
          }
          const idct = inverseDCT(dct, N, cosTbl);
          for (let y = 0; y < N; y++) {
            const yy = by + y; if (yy >= h) break;
            for (let x = 0; x < N; x++) {
              const xx = bx + x; if (xx >= w) break;
              ch[yy * w + xx] = idct[y * N + x] + 128;
            }
          }
        }
      }
    }

    processChannel(Y, 1);
    if (mode !== 'mono') {
      processChannel(Cb, 2);
      processChannel(Cr, 2);
    }

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const y = Y[p], cb = Cb[p] - 128, cr = Cr[p] - 128;
      d[i]     = clamp255(y + 1.402   * cr);
      d[i + 1] = clamp255(y - 0.344136 * cb - 0.714136 * cr);
      d[i + 2] = clamp255(y + 1.772   * cb);
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeToolRoot();
    root.appendChild(pillGroup({
      label: 'Mode',
      options: [
        { value: 'artifacts', label: 'Artefacts' },
        { value: 'heavy', label: 'Heavy' },
        { value: 'glitch', label: 'Glitch' },
        { value: 'block-shift', label: 'Block Shift' },
        { value: 'mono', label: 'Mono' },
      ],
      value: params.mode,
      onChange: (v) => onChange({ mode: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Block Size', min: 4, max: 32, step: 4, value: params.blockSize,
      onChange: (v) => onChange({ blockSize: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Quant', min: 1, max: 60, step: 1, value: params.quantization,
      onChange: (v) => onChange({ quantization: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Freq Noise', min: 0, max: 100, step: 1, value: params.freqNoise,
      onChange: (v) => onChange({ freqNoise: v }),
    }));
    return root;
  },
};

function clampPow2(n) {
  // Snap to 4, 8, 16, 32.
  const opts = [4, 8, 16, 32];
  let best = 8, dist = Infinity;
  for (const o of opts) { const d = Math.abs(o - n); if (d < dist) { best = o; dist = d; } }
  return best;
}

function buildCosineTable(N) {
  const tbl = new Float32Array(N * N);
  for (let u = 0; u < N; u++) {
    for (let x = 0; x < N; x++) {
      tbl[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
    }
  }
  return tbl;
}
function alpha(k, N) { return k === 0 ? Math.SQRT1_2 : 1; }

function forwardDCT(block, N, cosTbl) {
  const out = new Float32Array(N * N);
  // Separable 1D DCT: rows then cols.
  const tmp = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < N; u++) {
      let sum = 0;
      for (let x = 0; x < N; x++) sum += block[y * N + x] * cosTbl[u * N + x];
      tmp[y * N + u] = sum * alpha(u, N);
    }
  }
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let y = 0; y < N; y++) sum += tmp[y * N + u] * cosTbl[v * N + y];
      out[v * N + u] = sum * alpha(v, N) * (2 / N);
    }
  }
  return out;
}
function inverseDCT(coeffs, N, cosTbl) {
  const out = new Float32Array(N * N);
  const tmp = new Float32Array(N * N);
  for (let v = 0; v < N; v++) {
    for (let x = 0; x < N; x++) {
      let sum = 0;
      for (let u = 0; u < N; u++) sum += alpha(u, N) * coeffs[v * N + u] * cosTbl[u * N + x];
      tmp[v * N + x] = sum;
    }
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      for (let v = 0; v < N; v++) sum += alpha(v, N) * tmp[v * N + x] * cosTbl[v * N + y];
      out[y * N + x] = sum * (2 / N);
    }
  }
  return out;
}

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
