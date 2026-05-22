// Kaleidoscope — n-fold radial mirror.
// TEST IMPLEMENTATION (v0, ~120 LOC). Roadmap target is richer (recursive depth,
// synth mode, presets) — see roadmap.md Generative Pack section.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
  version: '0.1.0',
  type: 'filter',
  icon: 'snowflake',
  category: 'distort',
  pack: 'generative-pack',
  pro: true,

  defaultParams() {
    return {
      folds: 6,         // 3..24
      rotation: 0,      // 0..360 (degrees)
      cx: 50,           // centre x (% of width)
      cy: 50,           // centre y (% of height)
    };
  },

  process(imageData, params) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const folds   = Math.max(3, Math.min(24, params.folds ?? 6));
    const rot     = ((params.rotation ?? 0) * Math.PI) / 180;
    const cxPct   = Math.max(0, Math.min(100, params.cx ?? 50)) / 100;
    const cyPct   = Math.max(0, Math.min(100, params.cy ?? 50)) / 100;
    const cx      = cxPct * W;
    const cy      = cyPct * H;

    const wedge = (Math.PI * 2) / folds;
    const out   = new Uint8ClampedArray(src.length);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Output → polar around (cx, cy).
        const dx = x - cx;
        const dy = y - cy;
        const r  = Math.sqrt(dx * dx + dy * dy);
        let ang  = Math.atan2(dy, dx) - rot;
        // Fold into [0, wedge) with mirror at the wedge boundary.
        ang = ((ang % wedge) + wedge) % wedge;
        if (ang > wedge * 0.5) ang = wedge - ang;
        // Back to cartesian → source sample.
        let sx = cx + Math.cos(ang + rot) * r;
        let sy = cy + Math.sin(ang + rot) * r;
        // Clamp to source bounds; off-edge stays transparent.
        sx = Math.round(sx);
        sy = Math.round(sy);
        const oi = (y * W + x) * 4;
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) {
          out[oi + 3] = 0;
          continue;
        }
        const si = (sy * W + sx) * 4;
        out[oi]     = src[si];
        out[oi + 1] = src[si + 1];
        out[oi + 2] = src[si + 2];
        out[oi + 3] = src[si + 3];
      }
    }

    src.set(out);
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Folds', min: 3, max: 24, step: 1,
      value: params.folds ?? 6, defaultValue: 6,
      onChange: (v) => onChange({ folds: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Rotation', min: 0, max: 360, step: 1,
      value: params.rotation ?? 0, defaultValue: 0, suffix: '°',
      onChange: (v) => onChange({ rotation: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Centre X', min: 0, max: 100, step: 1,
      value: params.cx ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => onChange({ cx: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Centre Y', min: 0, max: 100, step: 1,
      value: params.cy ?? 50, defaultValue: 50, suffix: '%',
      onChange: (v) => onChange({ cy: v }),
    }));
    return root;
  },
};
