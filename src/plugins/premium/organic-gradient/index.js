// Organic Gradient — PREMIUM filter · Infinity Gradients Pack
// Shader-quality domain-warped noise with multi-stop gradient mapping.
// Phase 20 · first item in the Infinity Gradients Pack.

import { sliderRow, pillGroup, toggleRow, gradientStopsRow, makeRoot } from '../../shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// Simplex 2D noise — MIT-licensed implementation, ~40 LOC.
// Based on the public-domain algorithm by Stefan Gustavson (2012).
// ---------------------------------------------------------------------------

// Flattened gradient table — one Float32Array of [gx0, gy0, gx1, gy1, …].
// Indexed by `g * 2` so the inner-loop `noise2` can avoid the array-of-array
// double-deref on hot pixel paths.
const GRAD = new Float32Array([
  1, 1,  -1, 1,   1, -1,  -1, -1,
  1, 0,  -1, 0,   1, 0,   -1, 0,
  0, 1,   0, -1,  0, 1,    0, -1,
]);

function buildPermTable(seed) {
  // Seeded Fisher-Yates shuffle of 0..255 via mulberry32.
  let s = seed >>> 0;
  function rand() {
    s = (s + 0x6D2B79F5) >>> 0;
    let r = s;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  // Double to avoid modular arithmetic
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

// Pre-computed simplex constants. F2 / G2 don't depend on perm — hoist.
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const G2_2 = 2 * G2;

function makeSimplex(perm) {
  // The previous version defined `corner(g, x, y)` INSIDE noise2, allocating
  // a fresh function on every call. With ~3 noise calls per pixel × 4 M pixels
  // on a 2k canvas that's 12 M function allocs per process() — prime GC fuel.
  // Now: corner is inlined three times. Same algorithm, no allocations.
  return function noise2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const tu = (i + j) * G2;
    const x0 = xin - (i - tu);
    const y0 = yin - (j - tu);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + G2_2;
    const y2 = y0 - 1 + G2_2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = (perm[ii + perm[jj]] % 12) * 2;
    const gi1 = (perm[ii + i1 + perm[jj + j1]] % 12) * 2;
    const gi2 = (perm[ii + 1 + perm[jj + 1]] % 12) * 2;
    // Inlined corner contributions — t = 0.5 - x*x - y*y; if t<0 → 0,
    // else t^4 * (gx*x + gy*y).
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (GRAD[gi0] * x0 + GRAD[gi0 + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (GRAD[gi1] * x1 + GRAD[gi1 + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (GRAD[gi2] * x2 + GRAD[gi2 + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}

// ---------------------------------------------------------------------------
// Domain-warped noise (Inigo Quilez's approach)
// ---------------------------------------------------------------------------

// scale/warpStrength/warpScale/iterations + the time-dependent offsets
// (t*0.7, t*0.5, t*0.1) are constant for the duration of a single
// process() call. The old version destructured params inside the per-pixel
// loop and recomputed t*0.5 etc. on every noise lookup. We now pass the
// already-precomputed scalars via a flat tuple.
function warpedNoise(nx, ny, scale, warpStrength, warpScale, iterations,
                    t05, t07, t01, noise) {
  let px = nx * scale;
  let py = ny * scale;
  for (let i = 0; i < iterations; i++) {
    const wx = noise(px * warpScale + 100 + t07, py * warpScale + t05);
    const wy = noise(px * warpScale - 200 + t05, py * warpScale + 50 + t07);
    px = px + wx * warpStrength;
    py = py + wy * warpStrength;
  }
  return noise(px + t01, py + t01);
}

// ---------------------------------------------------------------------------
// Gradient LUT — build a 256-entry RGBA lookup from gradient stops
// ---------------------------------------------------------------------------

function buildGradientLUT(stops) {
  const sorted = stops.slice().sort((a, b) => a.at - b.at);
  const lut = new Uint8Array(256 * 4);

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }

  for (let i = 0; i < 256; i++) {
    const at = i / 255;
    // Find surrounding stops
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    for (let s = 0; s < sorted.length - 1; s++) {
      if (sorted[s].at <= at && sorted[s + 1].at >= at) {
        lo = sorted[s];
        hi = sorted[s + 1];
        break;
      }
    }
    const span = hi.at - lo.at;
    const k = span > 0.0001 ? Math.max(0, Math.min(1, (at - lo.at) / span)) : 0;
    const [r0, g0, b0] = hexToRgb(lo.color);
    const [r1, g1, b1] = hexToRgb(hi.color);
    lut[i * 4 + 0] = Math.round(r0 + (r1 - r0) * k);
    lut[i * 4 + 1] = Math.round(g0 + (g1 - g0) * k);
    lut[i * 4 + 2] = Math.round(b0 + (b1 - b0) * k);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

// ---------------------------------------------------------------------------
// Blend mode compositing helpers
// ---------------------------------------------------------------------------

function blend(mode, base, over) {
  // base and over are 0..255 channel values
  const b = base / 255;
  const o = over / 255;
  let r;
  switch (mode) {
    case 'multiply':  r = b * o; break;
    case 'screen':    r = 1 - (1 - b) * (1 - o); break;
    case 'overlay':   r = b < 0.5 ? 2 * b * o : 1 - 2 * (1 - b) * (1 - o); break;
    case 'soft-light':
      r = b < 0.5
        ? b - (1 - 2 * o) * b * (1 - b)
        : b + (2 * o - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);
      break;
    default: r = o; // replace
  }
  return Math.max(0, Math.min(255, Math.round(r * 255)));
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export default {
  id: 'organic-gradient',
  name: 'Organic Gradient',
  version: '1.0.0',
  type: 'filter',
  icon: 'wand-magic-sparkles',
  category: 'render',
  description: 'Painterly noise-shaped gradient',
  pro: true,
  pack: 'infinity-gradients',

  defaultParams() {
    return {
      // Field
      scale: 1,
      warpStrength: 0.5,
      warpScale: 1,
      iterations: 2,
      seed: 1,
      // Gradient
      stops: [
        { at: 0,   color: '#1e0a3c' },
        { at: 0.5, color: '#fc476c' },
        { at: 1,   color: '#ffd166' },
      ],
      gradientSampling: 'linear',
      // Animation
      animate: false,
      speed: 0.3,
      timeOffset: 0,
      // Internal animation tick (never shown in UI)
      _tick: 0,
      // Composition
      vignette: 0,
      grain: 0,
      blendMode: 'replace',
    };
  },

  // Per-session cache of the gradient layer (outR/outG/outB buffers).
  // The noise + warp + LUT-sample step is the expensive part (~800 ms at
  // 1500x1500), and its output depends ONLY on (dims, scale, warp params,
  // seed, stops, sampling, vignette, grain, time). When the user drags a
  // slider on a DIFFERENT effect in the stack, we re-run the pipeline but
  // organic-gradient's params haven't changed — cache hit, skip the heavy
  // loop, jump straight to compositing.
  _cache: null,

  process(imageData, params) {
    const W = imageData.width;
    const H = imageData.height;
    if (W === 0 || H === 0) return imageData;

    const scale       = Math.max(0.05, params.scale ?? 1);
    const warpStrength = Math.max(0, params.warpStrength ?? 0.5);
    const warpScale   = Math.max(0.1, params.warpScale ?? 1);
    const iterations  = Math.max(1, Math.min(4, Math.round(params.iterations ?? 2)));
    const seed        = Math.max(1, Math.floor(params.seed ?? 1));
    const stops       = params.stops?.length >= 2 ? params.stops : [{ at: 0, color: '#1e0a3c' }, { at: 1, color: '#ffd166' }];
    const gradSampling = params.gradientSampling || 'linear';
    const vigAmt      = Math.max(0, Math.min(100, params.vignette ?? 0)) / 100;
    const grainAmt    = Math.max(0, Math.min(100, params.grain ?? 0)) / 100;
    const blendMode   = params.blendMode || 'replace';

    // Time: if animating, use _tick to drive t; otherwise use timeOffset.
    let t;
    if (params.animate) {
      const now = (params._tick || Date.now()) / 1000;
      t = now * (params.speed ?? 0.3) + (params.timeOffset ?? 0);
    } else {
      t = params.timeOffset ?? 0;
    }

    // Build noise function with seed
    const perm = buildPermTable(seed * 0x9E3779B1);
    const noise = makeSimplex(perm);

    // Build gradient LUT
    const lut = buildGradientLUT(stops);

    // Build a secondary grain noise perm (offset seed)
    const grainPerm = grainAmt > 0 ? buildPermTable((seed + 37) * 0xBF58476D) : null;
    const grainNoise = grainPerm ? makeSimplex(grainPerm) : null;

    const d = imageData.data;
    const cx = W / 2;
    const cy = H / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;
    const invMaxDist = 1 / maxDist;
    const TWO_PI = Math.PI * 2;
    const invTwoPi = 1 / TWO_PI;
    const invW = 1 / W;
    const invH = 1 / H;

    // Pre-compute the time-derived offsets once per process() call. The
    // inner-loop warpedNoise / grainNoise calls multiplied t by 0.7/0.5/0.1/10
    // on every pixel — millions of redundant multiplies per frame.
    const t05 = t * 0.5;
    const t07 = t * 0.7;
    const t01 = t * 0.1;
    const tg  = t * 10;

    // Per-axis distance-sample sharing: if EITHER spherical OR vignette is
    // active we need `dx*dx + dy*dy`; compute once, share. Conic-only or
    // linear-only paths skip the sqrt entirely.
    const needDist = gradSampling === 'spherical' || vigAmt > 0;
    const needAngle = gradSampling === 'conic';

    // Cache key — every input that affects the output buffer. If unchanged
    // since last process() call, reuse the buffers and skip the heavy
    // noise loop. (User dragging a slider on a DIFFERENT effect in the
    // stack still invokes our process(), so a cache hit there is gold.)
    const cacheKey = `${W}|${H}|${scale}|${warpStrength}|${warpScale}|${iterations}|${seed}|${gradSampling}|${vigAmt}|${grainAmt}|${t}|${JSON.stringify(stops)}`;
    let outR, outG, outB;
    const cached = this._cache;
    if (cached && cached.key === cacheKey) {
      outR = cached.outR;
      outG = cached.outG;
      outB = cached.outB;
    } else {
      outR = new Uint8Array(W * H);
      outG = new Uint8Array(W * H);
      outB = new Uint8Array(W * H);

      for (let y = 0; y < H; y++) {
      const ny = y * invH;
      const dy = y - cy;
      const dySq = dy * dy;
      for (let x = 0; x < W; x++) {
        const nx = x * invW;
        const dx = x - cx;
        const idx = y * W + x;

        // Raw noise value -1..1 → normalise to 0..1
        const rawN = warpedNoise(nx, ny, scale, warpStrength, warpScale, iterations,
                                  t05, t07, t01, noise);
        const n = rawN < -1 ? 0 : rawN > 1 ? 1 : (rawN * 0.5 + 0.5);

        // Compute dist once if either spherical-sampling or vignette wants it.
        let dist = 0;
        if (needDist) dist = Math.sqrt(dx * dx + dySq) * invMaxDist;

        // Gradient sample position
        let pos;
        if (gradSampling === 'spherical') {
          pos = n * 0.5 + 0.5 * dist;
          if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
        } else if (needAngle) {
          const angle = Math.atan2(dy, dx) * invTwoPi + 0.5;
          pos = n * 0.3 + 0.7 * angle;
          if (pos < 0) pos = 0; else if (pos > 1) pos = 1;
        } else {
          pos = n;
        }

        // Sample LUT (fast int-truncate, no rounding needed for 8-bit output)
        const lutIdx = ((pos * 255 + 0.5) | 0) * 4;
        let r = lut[lutIdx];
        let g = lut[lutIdx + 1];
        let b = lut[lutIdx + 2];

        // Vignette: radial darkening (reuses `dist` from above when set)
        if (vigAmt > 0) {
          const vf = 1 - vigAmt * dist * dist;
          r = (r * vf + 0.5) | 0;
          g = (g * vf + 0.5) | 0;
          b = (b * vf + 0.5) | 0;
        }

        // Grain overlay
        if (grainAmt > 0 && grainNoise) {
          const gn = (grainNoise(x * 0.5 + tg, y * 0.5 + tg) * 0.5) * grainAmt * 80;
          let rr = r + ((gn + (gn < 0 ? -0.5 : 0.5)) | 0);
          let gg = g + ((gn + (gn < 0 ? -0.5 : 0.5)) | 0);
          let bb = b + ((gn + (gn < 0 ? -0.5 : 0.5)) | 0);
          if (rr < 0) rr = 0; else if (rr > 255) rr = 255;
          if (gg < 0) gg = 0; else if (gg > 255) gg = 255;
          if (bb < 0) bb = 0; else if (bb > 255) bb = 255;
          r = rr; g = gg; b = bb;
        }

        outR[idx] = r;
        outG[idx] = g;
        outB[idx] = b;
      }
      }
      this._cache = { key: cacheKey, outR, outG, outB };
    }

    // Composite gradient layer onto input with blendMode (fully wet — slot-
    // level dry/wet on the effect card handles dry blending against source).
    for (let i = 0; i < W * H; i++) {
      const pi = i * 4;
      const baseR = d[pi], baseG = d[pi + 1], baseB = d[pi + 2];
      const overR = outR[i], overG = outG[i], overB = outB[i];

      if (blendMode === 'replace') {
        d[pi] = overR; d[pi + 1] = overG; d[pi + 2] = overB;
      } else {
        d[pi]     = blend(blendMode, baseR, overR);
        d[pi + 1] = blend(blendMode, baseG, overG);
        d[pi + 2] = blend(blendMode, baseB, overB);
      }
      // alpha unchanged
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();

    // Teardown guard for animation loop
    let isAlive = true;
    let rafId = null;

    function startAnimLoop() {
      if (rafId !== null) return; // already running
      let lastTick = 0;
      function tick() {
        if (!isAlive || !root.isConnected) {
          isAlive = false;
          rafId = null;
          return;
        }
        const now = Date.now();
        if (now - lastTick >= 50) { // ~20fps — enough for smooth animation, easy on CPU
          lastTick = now;
          onChange({ _tick: now });
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    }

    function stopAnimLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    // Start loop immediately if animate is already on
    if (params.animate) startAnimLoop();

    // ── Section: Field ──────────────────────────────────────────────────────
    const fieldLabel = document.createElement('div');
    fieldLabel.className = 'effect-section-label';
    fieldLabel.textContent = 'Field';
    root.appendChild(fieldLabel);

    root.appendChild(sliderRow({
      label: 'Scale',
      min: 0.05, max: 10, step: 0.05,
      value: params.scale ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ scale: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Warp strength',
      min: 0, max: 2, step: 0.05,
      value: params.warpStrength ?? 0.5, defaultValue: 0.5,
      onChange: (v) => onChange({ warpStrength: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Warp scale',
      min: 0.1, max: 5, step: 0.05,
      value: params.warpScale ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ warpScale: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Iterations',
      min: 1, max: 4, step: 1,
      value: params.iterations ?? 2, defaultValue: 2,
      onChange: (v) => onChange({ iterations: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Seed',
      min: 1, max: 99, step: 1,
      value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
    }));

    // ── Section: Gradient ───────────────────────────────────────────────────
    const gradLabel = document.createElement('div');
    gradLabel.className = 'effect-section-label';
    gradLabel.textContent = 'Gradient';
    root.appendChild(gradLabel);

    const stopsWidget = gradientStopsRow({
      label: 'Stops',
      stops: params.stops || [
        { at: 0,   color: '#1e0a3c' },
        { at: 0.5, color: '#fc476c' },
        { at: 1,   color: '#ffd166' },
      ],
      onChange: (stops) => onChange({ stops }),
    });
    root.appendChild(stopsWidget);

    root.appendChild(pillGroup({
      label: 'Sampling',
      options: [
        { value: 'linear',     label: 'Linear' },
        { value: 'spherical',  label: 'Spherical' },
        { value: 'conic',      label: 'Conic' },
      ],
      value: params.gradientSampling || 'linear',
      onChange: (v) => onChange({ gradientSampling: v }),
    }));

    // ── Section: Animation ──────────────────────────────────────────────────
    const animLabel = document.createElement('div');
    animLabel.className = 'effect-section-label';
    animLabel.textContent = 'Animation';
    root.appendChild(animLabel);

    root.appendChild(toggleRow({
      label: 'Animate',
      value: params.animate || false,
      onChange: (v) => {
        onChange({ animate: v });
        if (v) startAnimLoop();
        else stopAnimLoop();
      },
      align: 'left',
    }));
    root.appendChild(sliderRow({
      label: 'Speed',
      min: 0, max: 2, step: 0.05,
      value: params.speed ?? 0.3, defaultValue: 0.3,
      onChange: (v) => onChange({ speed: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Time offset',
      min: -10, max: 10, step: 0.1,
      value: params.timeOffset ?? 0, defaultValue: 0,
      suffix: 's',
      onChange: (v) => onChange({ timeOffset: v }),
    }));

    // ── Section: Composition ────────────────────────────────────────────────
    const compLabel = document.createElement('div');
    compLabel.className = 'effect-section-label';
    compLabel.textContent = 'Composition';
    root.appendChild(compLabel);

    root.appendChild(sliderRow({
      label: 'Vignette',
      min: 0, max: 100, step: 1,
      value: params.vignette ?? 0, defaultValue: 0, suffix: '%',
      onChange: (v) => onChange({ vignette: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Grain',
      min: 0, max: 100, step: 1,
      value: params.grain ?? 0, defaultValue: 0, suffix: '%',
      onChange: (v) => onChange({ grain: v }),
    }));

    root.appendChild(pillGroup({
      label: 'Blend',
      options: [
        { value: 'replace',    label: 'Replace' },
        { value: 'multiply',   label: 'Multiply' },
        { value: 'screen',     label: 'Screen' },
        { value: 'overlay',    label: 'Overlay' },
        { value: 'soft-light', label: 'Soft' },
      ],
      value: params.blendMode || 'replace',
      onChange: (v) => onChange({ blendMode: v }),
    }));

    // Teardown: stop the RAF loop when the root is removed from DOM.
    // We use a MutationObserver on the parent when possible; simpler fallback
    // is the isAlive flag checked inside tick().
    const observer = new MutationObserver(() => {
      if (!root.isConnected) {
        isAlive = false;
        stopAnimLoop();
        observer.disconnect();
      }
    });
    // Observe document.body for subtree changes — lightweight, fires when our
    // root's ancestor is removed.
    observer.observe(document.body, { childList: true, subtree: true });

    return root;
  },
};
