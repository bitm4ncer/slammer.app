// Stipple — fill a closed path with a uniform grid of small dots.
// Each dot that lies inside the path is emitted as its own circle. Use
// Halftone if you want size variation across the field.

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';
import { hydrate, noise2 } from '../_helpers.js';

export default {
  id: 'vector-stipple',
  name: 'Stipple',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'braille',
  category: 'pattern',

  defaultParams() {
    return { spacing: 12, dotSize: 3, jitter: 0.4, layout: 'hex', color: '#FFFFFF', seed: 1 };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const sp = Math.max(2, params.spacing || 12);
    const r = Math.max(0.3, (params.dotSize || 3) / 2);
    const jitter = Math.max(0, Math.min(1, params.jitter ?? 0));
    const seed = params.seed || 1;
    const color = params.color || '#FFFFFF';
    const hex = (params.layout || 'hex') === 'hex';
    const out = [];
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) { out.push(rec); continue; }
      const b = cp.bounds;
      if (!b || !(b.width > 0) || !(b.height > 0)) { cp.remove(); out.push(rec); continue; }
      const compound = new paper.CompoundPath();
      const rowH = hex ? sp * Math.sqrt(3) / 2 : sp;
      const rows = Math.ceil(b.height / rowH) + 2;
      const cols = Math.ceil(b.width / sp) + 2;
      for (let j = 0; j < rows; j++) {
        const yy = b.y + j * rowH;
        const xOff = hex && (j % 2) ? sp / 2 : 0;
        for (let i = 0; i < cols; i++) {
          const xx = b.x + i * sp + xOff;
          // Jitter inside the cell (deterministic via noise2).
          const jx = noise2(xx * 0.07, yy * 0.07, seed) * jitter * sp * 0.5;
          const jy = noise2(xx * 0.11, yy * 0.05, seed + 7) * jitter * sp * 0.5;
          const px = xx + jx;
          const py = yy + jy;
          if (cp.contains(new paper.Point(px, py))) {
            const c = new paper.Path.Circle({
              center: new paper.Point(px, py),
              radius: r,
              insert: false,
            });
            compound.addChild(c);
          }
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
      label: 'Dot size', min: 0.5, max: 30, step: 0.5,
      value: params.dotSize ?? 3, defaultValue: 3, suffix: 'px',
      onChange: (v) => onChange({ dotSize: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Jitter', min: 0, max: 100, step: 1,
      value: Math.round((params.jitter ?? 0.4) * 100), defaultValue: 40, suffix: '%',
      onChange: (v) => onChange({ jitter: v / 100 }),
    }));
    root.appendChild(selectRow({
      label: 'Layout',
      value: params.layout || 'hex',
      options: [{ v: 'hex', label: 'Hex grid' }, { v: 'grid', label: 'Square grid' }],
      onChange: (v) => onChange({ layout: v }),
    }));
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
