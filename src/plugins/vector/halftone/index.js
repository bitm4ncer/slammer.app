// Halftone — like Stipple, but each dot's size varies across the
// field by a chosen gradient (linear-x / linear-y / radial / noise).
// The size sweeps from `minSize` at one end to `maxSize` at the other.

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';
import { hydrate, fbm } from '../_helpers.js';

export default {
  id: 'vector-halftone',
  name: 'Halftone',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'circle-notch',
  category: 'pattern',

  defaultParams() {
    return {
      spacing: 12, minSize: 0.5, maxSize: 6,
      gradient: 'radial', invert: false,
      color: '#FFFFFF', seed: 1,
    };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const sp = Math.max(2, params.spacing || 12);
    const minR = Math.max(0.1, (params.minSize || 0.5) / 2);
    const maxR = Math.max(minR + 0.1, (params.maxSize || 6) / 2);
    const grad = params.gradient || 'radial';
    const invert = !!params.invert;
    const seed = params.seed || 1;
    const color = params.color || '#FFFFFF';
    const out = [];
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) { out.push(rec); continue; }
      const b = cp.bounds;
      if (!b || !(b.width > 0) || !(b.height > 0)) { cp.remove(); out.push(rec); continue; }
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const maxDist = Math.hypot(b.width, b.height) / 2;
      const compound = new paper.CompoundPath();
      const rowH = sp * Math.sqrt(3) / 2;
      const rows = Math.ceil(b.height / rowH) + 2;
      const cols = Math.ceil(b.width / sp) + 2;
      for (let j = 0; j < rows; j++) {
        const yy = b.y + j * rowH;
        const xOff = (j % 2) ? sp / 2 : 0;
        for (let i = 0; i < cols; i++) {
          const xx = b.x + i * sp + xOff;
          if (!cp.contains(new paper.Point(xx, yy))) continue;
          let t;
          switch (grad) {
            case 'linear-x': t = (xx - b.x) / Math.max(1, b.width);  break;
            case 'linear-y': t = (yy - b.y) / Math.max(1, b.height); break;
            case 'radial':   t = Math.hypot(xx - cx, yy - cy) / Math.max(1, maxDist); break;
            case 'noise':    t = (fbm(xx * 0.02, yy * 0.02, seed, 2) + 1) / 2; break;
            default:         t = 0.5;
          }
          if (invert) t = 1 - t;
          t = Math.max(0, Math.min(1, t));
          const r = minR + (maxR - minR) * t;
          if (r < 0.2) continue;
          const c = new paper.Path.Circle({
            center: new paper.Point(xx, yy),
            radius: r,
            insert: false,
          });
          compound.addChild(c);
        }
      }
      const d = compound.pathData;
      compound.remove();
      cp.remove();
      if (d) {
        out.push({
          d, closed: true,
          fill: { type: 'solid', color, opacity: 1 },
          stroke: { type: 'none' },
        });
      }
    }
    return out.length ? out : paths;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Spacing', min: 3, max: 50, step: 1,
      value: params.spacing ?? 12, defaultValue: 12, suffix: 'px',
      onChange: (v) => onChange({ spacing: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Min size', min: 0, max: 30, step: 0.5,
      value: params.minSize ?? 0.5, defaultValue: 0.5, suffix: 'px',
      onChange: (v) => onChange({ minSize: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Max size', min: 0.5, max: 40, step: 0.5,
      value: params.maxSize ?? 6, defaultValue: 6, suffix: 'px',
      onChange: (v) => onChange({ maxSize: v }),
    }));
    root.appendChild(selectRow({
      label: 'Gradient',
      value: params.gradient || 'radial',
      options: [
        { v: 'radial',   label: 'Radial' },
        { v: 'linear-x', label: 'Horizontal' },
        { v: 'linear-y', label: 'Vertical' },
        { v: 'noise',    label: 'Noise' },
      ],
      onChange: (v) => onChange({ gradient: v }),
    }));
    const invertRow = document.createElement('label');
    invertRow.className = 'effect-slider-row';
    invertRow.innerHTML = '<span class="effect-label">Invert</span>';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!params.invert;
    cb.addEventListener('change', () => onChange({ invert: cb.checked }));
    invertRow.appendChild(cb);
    root.appendChild(invertRow);
    root.appendChild(sliderRow({
      label: 'Seed', min: 1, max: 999, step: 1,
      value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
    }));
    const colorRow = document.createElement('label');
    colorRow.className = 'effect-slider-row';
    colorRow.innerHTML = '<span class="effect-label">Color</span>';
    const ci = document.createElement('input');
    ci.type = 'color';
    ci.value = params.color || '#FFFFFF';
    ci.addEventListener('input', () => onChange({ color: ci.value }));
    colorRow.appendChild(ci);
    root.appendChild(colorRow);
    return root;
  },
};
