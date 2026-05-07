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

// Bilinear sample of src at float coords (sx, sy) with given edge fn.
// Returns [r, g, b, a].
function sampleNearest(src, W, H, sx, sy, edgeFn) {
  const ix = edgeFn(Math.round(sx) | 0, W);
  const iy = edgeFn(Math.round(sy) | 0, H);
  const i = (iy * W + ix) * 4;
  return [src[i], src[i + 1], src[i + 2], src[i + 3]];
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

    const mode    = params.mode  || 'flat';
    const edge    = params.edge  || 'clamp';
    const mix     = Math.max(0, Math.min(100, params.mix ?? 100)) / 100;
    const edgeFn  = makeEdgeFn(edge);

    if (mode === 'flat') {
      const rx = Math.round(params.rx ?? 4);
      const ry = Math.round(params.ry ?? 0);
      const gx = Math.round(params.gx ?? 0);
      const gy = Math.round(params.gy ?? 0);
      const bx = Math.round(params.bx ?? -4);
      const by = Math.round(params.by ?? 0);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const di = (y * W + x) * 4;

          const rr = sampleNearest(src, W, H, x + rx, y + ry, edgeFn);
          const gg = sampleNearest(src, W, H, x + gx, y + gy, edgeFn);
          const bb = sampleNearest(src, W, H, x + bx, y + by, edgeFn);

          // Alpha preserved from green channel to avoid fringing at transparent edges
          const R = rr[0];
          const G = gg[1];
          const B = bb[2];
          const A = gg[3];

          if (mix >= 1) {
            dst[di]     = R;
            dst[di + 1] = G;
            dst[di + 2] = B;
            dst[di + 3] = A;
          } else {
            const origI = di;
            dst[di]     = Math.round(src[origI]     * (1 - mix) + R * mix);
            dst[di + 1] = Math.round(src[origI + 1] * (1 - mix) + G * mix);
            dst[di + 2] = Math.round(src[origI + 2] * (1 - mix) + B * mix);
            dst[di + 3] = Math.round(src[origI + 3] * (1 - mix) + A * mix);
          }
        }
      }
    } else {
      // radial mode — anchor centre + max-dim to the original content rect
      // when available so the focal point stays consistent regardless of pad.
      const rect = ctx?.contentRect || { x: 0, y: 0, w: W, h: H };
      const strength = Math.max(0, Math.min(500, params.strength ?? 6));
      const cx = rect.x + rect.w * (params.centerX ?? 50) / 100;
      const cy = rect.y + rect.h * (params.centerY ?? 50) / 100;
      const bias = Math.max(-1, Math.min(1, params.bias ?? 0));
      const maxDim = Math.max(rect.w, rect.h);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const di = (y * W + x) * 4;
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const m = (dist / maxDim) * 2; // 0 at centre → peaks at corners

          let ux = 0, uy = 0;
          if (dist > 0) {
            ux = dx / dist;
            uy = dy / dist;
          }

          // Red: pushed outward, modulated by positive bias
          const rStrength = strength * m * (1 + bias);
          // Blue: pushed inward (opposite direction), modulated by negative bias
          const bStrength = strength * m * (1 - bias);

          const rr = sampleNearest(src, W, H, x + ux * rStrength, y + uy * rStrength, edgeFn);
          // Green stays at the original pixel (anchors the alpha)
          const origI = di;
          const bb = sampleNearest(src, W, H, x - ux * bStrength, y - uy * bStrength, edgeFn);

          const R = rr[0];
          const G = src[origI + 1];
          const B = bb[2];
          const A = src[origI + 3];

          if (mix >= 1) {
            dst[di]     = R;
            dst[di + 1] = G;
            dst[di + 2] = B;
            dst[di + 3] = A;
          } else {
            dst[di]     = Math.round(src[origI]     * (1 - mix) + R * mix);
            dst[di + 1] = Math.round(src[origI + 1] * (1 - mix) + G * mix);
            dst[di + 2] = Math.round(src[origI + 2] * (1 - mix) + B * mix);
            dst[di + 3] = Math.round(src[origI + 3] * (1 - mix) + A * mix);
          }
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

      root.appendChild(sliderRow({
        label: 'Mix', min: 0, max: 100, step: 1,
        value: local.mix ?? 100, defaultValue: 100, suffix: '%',
        onChange: (v) => { local.mix = v; onChange({ mix: v }); },
      }));
    }

    rebuild();
    return root;
  },
};
