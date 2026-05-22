// Reaktor — Gray-Scott reaction-diffusion. The input layer seeds the
// concentration field; iterating produces organic spotted / striped patterns.
// TEST IMPLEMENTATION (v0). Roadmap target ships richer presets + WebGL.

import { sliderRow, makeRoot, pillGroup } from '../../shared/ui-helpers.js';

const PRESETS = {
  spots:   { feed: 0.035, kill: 0.065 },
  stripes: { feed: 0.030, kill: 0.062 },
  coral:   { feed: 0.055, kill: 0.062 },
  worms:   { feed: 0.042, kill: 0.060 },
};

export default {
  id: 'reaktor',
  name: 'Reaktor',
  version: '0.1.0',
  type: 'filter',
  icon: 'circle-nodes',
  category: 'render',
  pack: 'generative-pack',
  pro: true,

  defaultParams() {
    return {
      preset: 'spots',
      iterations: 30,   // 5..200
      scale: 50,        // % output resolution — Gray-Scott is expensive
      seedStrength: 50, // 0..100 — how strongly luma seeds the B field
    };
  },

  process(imageData, params) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const preset     = PRESETS[params.preset] || PRESETS.spots;
    const f          = preset.feed;
    const k          = preset.kill;
    const iters      = Math.max(5, Math.min(200, params.iterations ?? 30));
    const scale      = Math.max(10, Math.min(100, params.scale ?? 50)) / 100;
    const seedAmt    = Math.max(0, Math.min(100, params.seedStrength ?? 50)) / 100;

    // Coarse grid — Gray-Scott is O(N * iters), keep N small.
    const w = Math.max(64, Math.round(W * scale));
    const h = Math.max(64, Math.round(H * scale));

    // A: substrate (starts at 1). B: catalyst (seeded from source luma).
    const A = new Float32Array(w * h);
    const B = new Float32Array(w * h);
    const A2 = new Float32Array(w * h);
    const B2 = new Float32Array(w * h);

    const sx = W / w;
    const sy = H / h;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        // Sample source luma at corresponding pixel.
        const px = Math.min(W - 1, (i * sx) | 0);
        const py = Math.min(H - 1, (j * sy) | 0);
        const si = (py * W + px) * 4;
        const lum = (src[si] * 0.299 + src[si + 1] * 0.587 + src[si + 2] * 0.114) / 255;
        A[idx] = 1.0;
        B[idx] = lum * seedAmt;
      }
    }

    // Diffusion coefficients + time step (classic Gray-Scott values).
    const Da = 1.0;
    const Db = 0.5;
    const dt = 1.0;

    for (let step = 0; step < iters; step++) {
      for (let j = 1; j < h - 1; j++) {
        for (let i = 1; i < w - 1; i++) {
          const idx = j * w + i;
          // 5-point laplacian (-1 centre, 1/5 each neighbour, wrap edges = clamp).
          const lapA = A[idx - 1] + A[idx + 1] + A[idx - w] + A[idx + w] - 4 * A[idx];
          const lapB = B[idx - 1] + B[idx + 1] + B[idx - w] + B[idx + w] - 4 * B[idx];
          const ab2 = A[idx] * B[idx] * B[idx];
          A2[idx] = A[idx] + (Da * lapA - ab2 + f * (1 - A[idx])) * dt;
          B2[idx] = B[idx] + (Db * lapB + ab2 - (k + f) * B[idx]) * dt;
        }
      }
      A.set(A2);
      B.set(B2);
    }

    // Map B field back to output — modulate source RGB by B.
    for (let y = 0; y < H; y++) {
      const j = Math.min(h - 1, (y / sy) | 0);
      for (let x = 0; x < W; x++) {
        const i = Math.min(w - 1, (x / sx) | 0);
        const bv = Math.max(0, Math.min(1, B[j * w + i] * 2)); // amplify
        const oi = (y * W + x) * 4;
        // Output = source × B field (high B = bright, low B = dark).
        src[oi]     = Math.round(src[oi]     * bv);
        src[oi + 1] = Math.round(src[oi + 1] * bv);
        src[oi + 2] = Math.round(src[oi + 2] * bv);
        // alpha unchanged
      }
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(pillGroup({
      label: 'Pattern',
      options: [
        { value: 'spots',   label: 'Spots' },
        { value: 'stripes', label: 'Stripes' },
        { value: 'coral',   label: 'Coral' },
        { value: 'worms',   label: 'Worms' },
      ],
      value: params.preset || 'spots',
      onChange: (v) => onChange({ preset: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Iterations', min: 5, max: 200, step: 1,
      value: params.iterations ?? 30, defaultValue: 30,
      onChange: (v) => onChange({ iterations: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Resolution', min: 10, max: 100, step: 1,
      value: params.scale ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => onChange({ scale: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Seed', min: 0, max: 100, step: 1,
      value: params.seedStrength ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => onChange({ seedStrength: v }),
    }));
    return root;
  },
};
