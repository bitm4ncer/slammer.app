// Slime Mold — Physarum agent simulation. Agents sense ahead, deposit
// pheromone, follow trails. Source luma seeds the pheromone field so the
// slime "feeds on" the image; agents also CARRY the source colour at their
// deposit point so the resulting network paints itself with the photo's
// own palette. Output is the glowing trail network over a darkened source.
// TEST IMPLEMENTATION (v0.2 — bolder, colour-carrying). Roadmap target ships
// WebGL agent pass + diffusion + presets.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'slime-mold',
  name: 'Slime Mold',
  version: '0.2.0',
  type: 'filter',
  icon: 'bacterium',
  category: 'render',
  pack: 'generative-pack',
  pro: true,

  defaultParams() {
    return {
      agents: 5000,     // 100..5000 — dense network out of the box
      steps: 255,       // 10..400 — long simulation lets trails interlace
      sensorAngle: 29,  // degrees from forward
      sensorDist: 2,    // pixels — short sensor → tight, fine-grained turns
      turnRate: 45,     // degrees per step toward strongest sensor
      decay: 1,         // 0..30 (%/step) — very low decay = persistent network
      depositAmt: 0.4,  // 0..1 — bold deposits
      bgDarken: 80,     // 0..100 — how much to darken the source under the trail
      bloom: 65,        // 0..100 — additive trail glow on top of source
    };
  },

  process(imageData, params) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const nAgents     = Math.max(100, Math.min(5000, params.agents     ?? 5000));
    const nSteps      = Math.max(10,  Math.min(400,  params.steps      ?? 255));
    const sensorAngle = ((params.sensorAngle ?? 29) * Math.PI) / 180;
    const sensorDist  = Math.max(2, Math.min(40, params.sensorDist ?? 2));
    const moveSpeed   = 1.0;
    const turnRate    = ((params.turnRate ?? 45) * Math.PI) / 180;
    const depositAmt  = Math.max(0, Math.min(1, params.depositAmt ?? 0.4));
    const decayRate   = Math.max(0, Math.min(0.3, (params.decay ?? 1) / 100));
    const bgDarken    = Math.max(0, Math.min(1, (params.bgDarken ?? 80) / 100));
    const bloom       = Math.max(0, Math.min(2, (params.bloom ?? 65) / 100 * 2));

    // ── Pheromone field (intensity) + colour-carry RGB field ─────────────
    // Trail scalar drives sensing + agent steering. RGB fields accumulate
    // the source colours the agents pass through so the final network
    // paints itself with the photo's own palette (the "Slime Mold eats
    // the colours of the image" effect).
    const N = W * H;
    const trail = new Float32Array(N);
    const trailR = new Float32Array(N);
    const trailG = new Float32Array(N);
    const trailB = new Float32Array(N);

    // Seed the trail field from source luma so brighter regions attract
    // agents from the start.
    for (let i = 0; i < N; i++) {
      const si = i * 4;
      const lum = (src[si] * 0.299 + src[si + 1] * 0.587 + src[si + 2] * 0.114) / 255;
      trail[i] = lum * 0.25;
    }

    // ── Spawn agents — random position + random heading ──────────────────
    const ax = new Float32Array(nAgents);
    const ay = new Float32Array(nAgents);
    const ah = new Float32Array(nAgents);
    let seed = 0x9e3779b1;
    const rng = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < nAgents; i++) {
      ax[i] = rng() * W;
      ay[i] = rng() * H;
      ah[i] = rng() * Math.PI * 2;
    }

    const sense = (x, y) => {
      const xi = ((x | 0) % W + W) % W;
      const yi = ((y | 0) % H + H) % H;
      return trail[yi * W + xi];
    };

    // ── Simulation steps ────────────────────────────────────────────────
    for (let step = 0; step < nSteps; step++) {
      for (let i = 0; i < nAgents; i++) {
        const hd = ah[i];
        const fx = ax[i] + Math.cos(hd) * sensorDist;
        const fy = ay[i] + Math.sin(hd) * sensorDist;
        const lx = ax[i] + Math.cos(hd - sensorAngle) * sensorDist;
        const ly = ay[i] + Math.sin(hd - sensorAngle) * sensorDist;
        const rx = ax[i] + Math.cos(hd + sensorAngle) * sensorDist;
        const ry = ay[i] + Math.sin(hd + sensorAngle) * sensorDist;
        const sf = sense(fx, fy);
        const sl = sense(lx, ly);
        const sr = sense(rx, ry);
        if (sf > sl && sf > sr) {
          // stay
        } else if (sl > sr) {
          ah[i] -= turnRate;
        } else if (sr > sl) {
          ah[i] += turnRate;
        } else {
          ah[i] += (rng() - 0.5) * turnRate;
        }
        ax[i] += Math.cos(ah[i]) * moveSpeed;
        ay[i] += Math.sin(ah[i]) * moveSpeed;
        if (ax[i] < 0)  ax[i] += W;
        if (ax[i] >= W) ax[i] -= W;
        if (ay[i] < 0)  ay[i] += H;
        if (ay[i] >= H) ay[i] -= H;
        // Deposit at integer pixel — both intensity AND the source colour
        // sampled at that pixel. The colour-carry is what makes the trails
        // visibly inherit the image palette instead of all looking white.
        const xi = ax[i] | 0;
        const yi = ay[i] | 0;
        const idx = yi * W + xi;
        const si = idx * 4;
        trail[idx]  = Math.min(2, trail[idx]  + depositAmt);
        trailR[idx] = Math.min(2 * 255, trailR[idx] + depositAmt * src[si]);
        trailG[idx] = Math.min(2 * 255, trailG[idx] + depositAmt * src[si + 1]);
        trailB[idx] = Math.min(2 * 255, trailB[idx] + depositAmt * src[si + 2]);
      }
      // Decay everything in lockstep.
      const decay = 1 - decayRate;
      for (let i = 0; i < N; i++) {
        trail[i]  *= decay;
        trailR[i] *= decay;
        trailG[i] *= decay;
        trailB[i] *= decay;
      }
    }

    // ── Output ───────────────────────────────────────────────────────────
    // background = source × (1 − bgDarken) → darker base for the trails
    //              to glow over.
    // trailColor = trailRGB / trail (weighted-average of carried source
    //              colours at this pixel; falls back to neutral when no
    //              trail yet).
    // intensity  = clamp(trail × bloom, 0, 1) → controls how brightly the
    //              trail overrides the background.
    // final RGB  = lerp(background, trailColor, intensity).
    for (let i = 0; i < N; i++) {
      const oi = i * 4;
      const t  = trail[i];
      const intensity = Math.max(0, Math.min(1, t * bloom));
      // Background pass: dim the source so trails can punch through.
      const bgR = src[oi]     * (1 - bgDarken);
      const bgG = src[oi + 1] * (1 - bgDarken);
      const bgB = src[oi + 2] * (1 - bgDarken);
      // Trail colour: weighted-mean of carried source pixels. Guard
      // against div-by-zero (zero-trail pixels stay on the background).
      let trR = 255, trG = 255, trB = 255;
      if (t > 0.001) {
        trR = trailR[i] / t;
        trG = trailG[i] / t;
        trB = trailB[i] / t;
      }
      // Boost trail colour by intensity so dense trails read as truly
      // bright (additive on top of weighted-mean). Without this they
      // average out to mid-grey on dense intersections.
      const boost = 1 + intensity * 0.6;
      src[oi]     = clamp8(bgR * (1 - intensity) + trR * boost * intensity);
      src[oi + 1] = clamp8(bgG * (1 - intensity) + trG * boost * intensity);
      src[oi + 2] = clamp8(bgB * (1 - intensity) + trB * boost * intensity);
      // alpha unchanged
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Agents', min: 100, max: 5000, step: 50,
      value: params.agents ?? 5000, defaultValue: 5000,
      onChange: (v) => onChange({ agents: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Steps', min: 10, max: 400, step: 5,
      value: params.steps ?? 255, defaultValue: 255,
      onChange: (v) => onChange({ steps: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Sensor angle', min: 5, max: 90, step: 1,
      value: params.sensorAngle ?? 29, defaultValue: 29, suffix: '°',
      onChange: (v) => onChange({ sensorAngle: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Sensor distance', min: 2, max: 40, step: 1,
      value: params.sensorDist ?? 2, defaultValue: 2, suffix: 'px',
      onChange: (v) => onChange({ sensorDist: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Turn rate', min: 1, max: 90, step: 1,
      value: params.turnRate ?? 45, defaultValue: 45, suffix: '°',
      onChange: (v) => onChange({ turnRate: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Decay', min: 0, max: 30, step: 1,
      value: params.decay ?? 1, defaultValue: 1, suffix: '%',
      onChange: (v) => onChange({ decay: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Background fade', min: 0, max: 100, step: 1,
      value: params.bgDarken ?? 80, defaultValue: 80, suffix: '%',
      onChange: (v) => onChange({ bgDarken: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Bloom', min: 0, max: 100, step: 1,
      value: params.bloom ?? 65, defaultValue: 65, suffix: '%',
      onChange: (v) => onChange({ bloom: v }),
    }));
    return root;
  },
};

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
