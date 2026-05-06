// Offset Path — grow (positive) or shrink (negative) the path along
// its local normal. We approximate by densely resampling the path,
// displacing each sample along its perpendicular tangent, then rebuilding
// as a smooth curve. Not a true minkowski offset (no self-intersection
// resolution) but matches the visual intent for moderate offsets.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, subpaths, withD, smoothPath } from '../_helpers.js';

export default {
  id: 'vector-offset-path',
  name: 'Offset Path',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'expand-arrows-alt',
  category: 'distort',

  defaultParams() { return { distance: 6, density: 6 }; },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const d0 = params.distance || 0;
    if (d0 === 0) return paths;
    const step = Math.max(2, params.density || 6);
    return paths.map((rec) => {
      const cp = hydrate(paper, rec);
      if (!cp) return rec;
      const out = new paper.CompoundPath();
      for (const sub of subpaths(cp)) {
        if (!sub.segments?.length || !(sub.length > 0)) continue;
        const len = sub.length;
        const count = Math.max(4, Math.ceil(len / step));
        const newPts = [];
        for (let i = 0; i <= count; i++) {
          const off = Math.min((i / count) * len, len);
          const pt = sub.getPointAt(off);
          const tan = sub.getTangentAt(off);
          if (!pt || !tan) continue;
          // Perpendicular = rotate tangent +90°. Positive distance
          // pushes left of travel direction (visually outward for a
          // CCW-wound shape; CW shapes invert — both behaviours are
          // legitimate "offset").
          newPts.push(new paper.Point(pt.x - tan.y * d0, pt.y + tan.x * d0));
        }
        const fresh = new paper.Path({
          segments: newPts.map((p) => new paper.Segment(p)),
          closed: !!sub.closed,
        });
        smoothPath(fresh);
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
      label: 'Distance', min: -100, max: 100, step: 1,
      value: params.distance ?? 6, defaultValue: 6, suffix: 'px',
      onChange: (v) => onChange({ distance: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Density', min: 2, max: 30, step: 1,
      value: params.density ?? 6, defaultValue: 6, suffix: 'px',
      onChange: (v) => onChange({ density: v }),
    }));
    return root;
  },
};
