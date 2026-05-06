// Roughen — random per-anchor displacement, optionally with sharp
// corners (true to AI's Roughen) or smoothed handles. Density adds
// extra anchors per unit length so the noise has room to breathe.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, subpaths, withD, smoothPath, noise2 } from '../_helpers.js';

export default {
  id: 'vector-roughen',
  name: 'Roughen',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'mountain',
  category: 'distort',

  defaultParams() { return { amplitude: 8, density: 12, smooth: true, seed: 1 }; },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const A = Math.max(0, params.amplitude || 0);
    if (A === 0) return paths;
    const step = Math.max(2, params.density || 12);
    const seed = params.seed || 1;
    return paths.map((rec) => {
      const cp = hydrate(paper, rec);
      if (!cp) return rec;
      const out = new paper.CompoundPath();
      for (const sub of subpaths(cp)) {
        if (!sub.segments?.length || !(sub.length > 0)) continue;
        const len = sub.length;
        const count = Math.max(3, Math.ceil(len / step));
        const newPts = [];
        for (let i = 0; i <= count; i++) {
          const off = Math.min((i / count) * len, len);
          const pt = sub.getPointAt(off);
          if (!pt) continue;
          const dx = noise2(pt.x * 0.13, pt.y * 0.13, seed) * A;
          const dy = noise2(pt.x * 0.17 + 7.7, pt.y * 0.11 - 3.3, seed + 11) * A;
          newPts.push(new paper.Point(pt.x + dx, pt.y + dy));
        }
        const fresh = new paper.Path({
          segments: newPts.map((p) => new paper.Segment(p)),
          closed: !!sub.closed,
        });
        if (params.smooth) smoothPath(fresh);
        out.addChild(fresh);
      }
      const d = out.pathData;
      out.remove();
      cp.remove();
      return d ? withD(rec, d) : rec;
    });
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Amount', min: 0, max: 80, step: 1,
      value: params.amplitude ?? 8, defaultValue: 8, suffix: 'px',
      onChange: (v) => onChange({ amplitude: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Density', min: 2, max: 60, step: 1,
      value: params.density ?? 12, defaultValue: 12, suffix: 'px',
      onChange: (v) => onChange({ density: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Seed', min: 1, max: 999, step: 1,
      value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
    }));
    const row = document.createElement('label');
    row.className = 'effect-slider-row';
    row.innerHTML = '<span class="effect-label">Smooth</span>';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!params.smooth;
    cb.addEventListener('change', () => onChange({ smooth: cb.checked }));
    row.appendChild(cb);
    root.appendChild(row);
    return root;
  },
};
