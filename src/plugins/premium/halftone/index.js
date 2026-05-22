// Halftone — like Stipple, but each dot's size varies across the
// field by a chosen gradient (linear-x / linear-y / radial / noise).
// The size sweeps from `minSize` at one end to `maxSize` at the other.

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';
import { hydrate, fbm } from '../../vector/_helpers.js';

export default {
  id: 'vector-halftone',
  name: 'Halftone',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'circle-notch',
  category: 'pattern',
  description: 'CMYK dot grid raster',
  pro: true,
  pack: 'dots-pack',

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
      const maxDist = Math.sqrt(b.width * b.width + b.height * b.height) / 2;
      const compound = new paper.CompoundPath();
      const rowH = sp * Math.sqrt(3) / 2;
      const rows = Math.ceil(b.height / rowH) + 2;
      const cols = Math.ceil(b.width / sp) + 2;
      // Hoist denominators + branch — pick one gradient sampler upfront.
      const invW = 1 / Math.max(1, b.width);
      const invH = 1 / Math.max(1, b.height);
      const invMaxDist = 1 / Math.max(1, maxDist);
      const bx = b.x, by = b.y;
      const rRange = maxR - minR;
      let sampleT;
      switch (grad) {
        case 'linear-x': sampleT = (xx, yy) => (xx - bx) * invW; break;
        case 'linear-y': sampleT = (xx, yy) => (yy - by) * invH; break;
        case 'radial':   sampleT = (xx, yy) => {
          const dx = xx - cx, dy = yy - cy;
          return Math.sqrt(dx * dx + dy * dy) * invMaxDist;
        }; break;
        case 'noise':    sampleT = (xx, yy) => (fbm(xx * 0.02, yy * 0.02, seed, 2) + 1) * 0.5; break;
        default:         sampleT = () => 0.5;
      }
      // Reuse a single point for the contains() probe — avoids one
      // paper.Point allocation per grid cell.
      const probe = new paper.Point(0, 0);
      for (let j = 0; j < rows; j++) {
        const yy = by + j * rowH;
        const xOff = (j & 1) ? sp / 2 : 0;
        for (let i = 0; i < cols; i++) {
          const xx = bx + i * sp + xOff;
          probe.x = xx; probe.y = yy;
          if (!cp.contains(probe)) continue;
          let t = sampleT(xx, yy);
          if (invert) t = 1 - t;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          const r = minR + rRange * t;
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
