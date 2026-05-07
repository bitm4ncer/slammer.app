// RGB Shift — chromatic aberration / glitch filter.
// Two modes:
//   flat   — independent per-channel X/Y offsets (meme-glitch / stripe look)
//   radial — lens-style aberration spreading from a configurable center point
//
// Edge handling: clamp (default) · mirror · wrap
// Common: mix (0-100%)

import { sliderRow, pillGroup, makeRoot } from '../../shared/ui-helpers.js';

// ---------- edge helpers ----------
function edgeClamp(v, max) {
  return v < 0 ? 0 : v >= max ? max - 1 : v;
}

function edgeMirror(v, max) {
  // Fold at boundaries: 0..max-1 → 0..max-1..0..max-1..
  const period = max * 2;
  let m = ((v % period) + period) % period;
  if (m >= max) m = period - 1 - m;
  return m;
}

function edgeWrap(v, max) {
  return ((v % max) + max) % max;
}

function makeEdgeFn(mode) {
  if (mode === 'mirror') return edgeMirror;
  if (mode === 'wrap')   return edgeWrap;
  return edgeClamp; // default: clamp
}

// Per-axis specialised wrap/mirror — pre-binds the period so the inner loop
// can call them without re-multiplying max each tick.
function makeWrapFn(max) {
  return (v) => ((v % max) + max) % max;
}
function makeMirrorFn(max) {
  const period = max * 2;
  return (v) => {
    let m = ((v % period) + period) % period;
    if (m >= max) m = period - 1 - m;
    return m;
  };
}

export default {
  id: 'rgb-shift',
  name: 'RGB Shift',
  version: '1.0.0',
  type: 'filter',
  icon: 'arrow-right-arrow-left',
  category: 'glitch',

  defaultParams() {
    return {
      mode: 'flat',
      // flat controls
      rx: 4,   ry: 0,
      gx: 0,   gy: 0,
      bx: -4,  by: 0,
      // radial controls
      strength: 6,
      centerX: 50,
      centerY: 50,
      bias: 0,
      // common
      edge: 'clamp',
      mix: 100,
    };
  },

  process(imageData, params, ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;
    const out = new ImageData(W, H);
    const dst = out.data;

    const mode = params.mode || 'flat';
    const edge = params.edge || 'clamp';
    const Wm = W - 1, Hm = H - 1;

    // Inline edge functions per axis. Specialised at process()-entry so V8
    // can inline the small body in the per-pixel call site. Was previously a
    // closure returning [r,g,b,a] → 3 array allocations × 4M pixels = GC-fest.
    const edgeX = edge === 'mirror'
      ? makeMirrorFn(W)
      : edge === 'wrap'
        ? makeWrapFn(W)
        : (v) => (v < 0 ? 0 : v > Wm ? Wm : v);
    const edgeY = edge === 'mirror'
      ? makeMirrorFn(H)
      : edge === 'wrap'
        ? makeWrapFn(H)
        : (v) => (v < 0 ? 0 : v > Hm ? Hm : v);

    if (mode === 'flat') {
      const rx = Math.round(params.rx ?? 4);
      const ry = Math.round(params.ry ?? 0);
      const gx = Math.round(params.gx ?? 0);
      const gy = Math.round(params.gy ?? 0);
      const bx = Math.round(params.bx ?? -4);
      const by = Math.round(params.by ?? 0);

      for (let y = 0; y < H; y++) {
        // Row offsets are constant for this y; lift them out of the inner loop.
        const rRow = edgeY(y + ry) * W;
        const gRow = edgeY(y + gy) * W;
        const bRow = edgeY(y + by) * W;
        for (let x = 0; x < W; x++) {
          const di = (y * W + x) * 4;
          const ri = (rRow + edgeX(x + rx)) * 4;
          const gi = (gRow + edgeX(x + gx)) * 4;
          const bi = (bRow + edgeX(x + bx)) * 4;
          dst[di]     = src[ri];          // R from red-shifted sample
          dst[di + 1] = src[gi + 1];      // G from green-shifted sample
          dst[di + 2] = src[bi + 2];      // B from blue-shifted sample
          dst[di + 3] = src[gi + 3];      // alpha tracks green to avoid fringing
        }
      }
    } else {
      // radial — anchor centre + max-dim to the original content rect when
      // available so the focal point stays stable regardless of pad.
      const rect = ctx?.contentRect || { x: 0, y: 0, w: W, h: H };
      const strength = Math.max(0, Math.min(500, params.strength ?? 6));
      const cx = rect.x + rect.w * (params.centerX ?? 50) / 100;
      const cy = rect.y + rect.h * (params.centerY ?? 50) / 100;
      const bias = Math.max(-1, Math.min(1, params.bias ?? 0));
      const maxDim = Math.max(rect.w, rect.h);
      const rFactor = strength * (1 + bias) * (2 / maxDim);
      const bFactor = strength * (1 - bias) * (2 / maxDim);

      // Math note: original was sx = x + (dx/dist) * (strength * m * (1+bias))
      // with m = 2*dist/maxDim. The dist cancels: sx = x + dx * rFactor where
      // rFactor folds strength*(1+bias)*2/maxDim. Saves one sqrt + one
      // division per pixel and removes the dist > 0 guard entirely.
      for (let y = 0; y < H; y++) {
        const dy = y - cy;
        for (let x = 0; x < W; x++) {
          const dx = x - cx;
          const di = (y * W + x) * 4;
          const rxs = edgeX(Math.round(x + dx * rFactor));
          const rys = edgeY(Math.round(y + dy * rFactor));
          const bxs = edgeX(Math.round(x - dx * bFactor));
          const bys = edgeY(Math.round(y - dy * bFactor));
          const ri = (rys * W + rxs) * 4;
          const bi = (bys * W + bxs) * 4;
          dst[di]     = src[ri];
          dst[di + 1] = src[di + 1];   // green/alpha stay at the original pixel
          dst[di + 2] = src[bi + 2];
          dst[di + 3] = src[di + 3];
        }
      }
    }

    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { ...params };

    function rebuild() {
      root.innerHTML = '';

      // Mode pill switcher
      root.appendChild(pillGroup({
        label: 'Mode',
        options: [
          { value: 'flat',   label: 'Flat' },
          { value: 'radial', label: 'Radial' },
        ],
        value: local.mode || 'flat',
        onChange: (v) => { local.mode = v; onChange({ mode: v }); rebuild(); },
      }));

      if (local.mode === 'flat' || !local.mode) {
        // -- Red channel --
        root.appendChild(sliderRow({
          label: 'R  X', min: -50, max: 50, step: 1,
          value: local.rx ?? 4, defaultValue: 4, suffix: 'px',
          onChange: (v) => { local.rx = v; onChange({ rx: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'R  Y', min: -50, max: 50, step: 1,
          value: local.ry ?? 0, defaultValue: 0, suffix: 'px',
          onChange: (v) => { local.ry = v; onChange({ ry: v }); },
        }));
        // -- Green channel --
        root.appendChild(sliderRow({
          label: 'G  X', min: -50, max: 50, step: 1,
          value: local.gx ?? 0, defaultValue: 0, suffix: 'px',
          onChange: (v) => { local.gx = v; onChange({ gx: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'G  Y', min: -50, max: 50, step: 1,
          value: local.gy ?? 0, defaultValue: 0, suffix: 'px',
          onChange: (v) => { local.gy = v; onChange({ gy: v }); },
        }));
        // -- Blue channel --
        root.appendChild(sliderRow({
          label: 'B  X', min: -50, max: 50, step: 1,
          value: local.bx ?? -4, defaultValue: -4, suffix: 'px',
          onChange: (v) => { local.bx = v; onChange({ bx: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'B  Y', min: -50, max: 50, step: 1,
          value: local.by ?? 0, defaultValue: 0, suffix: 'px',
          onChange: (v) => { local.by = v; onChange({ by: v }); },
        }));
      } else {
        // radial controls
        root.appendChild(sliderRow({
          label: 'Strength', min: 0, max: 50, step: 0.5,
          value: local.strength ?? 6, defaultValue: 6, suffix: 'px',
          onChange: (v) => { local.strength = v; onChange({ strength: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'Center X', min: 0, max: 100, step: 1,
          value: local.centerX ?? 50, defaultValue: 50, suffix: '%',
          onChange: (v) => { local.centerX = v; onChange({ centerX: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'Center Y', min: 0, max: 100, step: 1,
          value: local.centerY ?? 50, defaultValue: 50, suffix: '%',
          onChange: (v) => { local.centerY = v; onChange({ centerY: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'Bias', min: -1, max: 1, step: 0.05,
          value: local.bias ?? 0, defaultValue: 0,
          onChange: (v) => { local.bias = v; onChange({ bias: v }); },
        }));
      }

      // Common controls
      root.appendChild(pillGroup({
        label: 'Edge',
        options: [
          { value: 'clamp',  label: 'Clamp' },
          { value: 'mirror', label: 'Mirror' },
          { value: 'wrap',   label: 'Wrap' },
        ],
        value: local.edge || 'clamp',
        onChange: (v) => { local.edge = v; onChange({ edge: v }); },
      }));
    }

    rebuild();
    return root;
  },
};
