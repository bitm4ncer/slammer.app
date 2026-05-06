// Pucker & Bloat — push every anchor toward (negative) or away from
// (positive) the sub-path's centroid by `amount` percent of its current
// distance. Negative pinches into a star; positive bulges into a blob.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, subpaths, withD, centroid } from '../_helpers.js';

export default {
  id: 'vector-pucker-bloat',
  name: 'Pucker & Bloat',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'compress-arrows-alt',
  category: 'distort',

  defaultParams() { return { amount: 0 }; },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const k = (params.amount || 0) / 100;
    if (k === 0) return paths;
    return paths.map((rec) => {
      const cp = hydrate(paper, rec);
      if (!cp) return rec;
      for (const sub of subpaths(cp)) {
        if (!sub.segments?.length) continue;
        const c = centroid(sub);
        for (const seg of sub.segments) {
          const dx = seg.point.x - c.x;
          const dy = seg.point.y - c.y;
          seg.point.x += dx * k;
          seg.point.y += dy * k;
          // Scale handles too so curvature stays roughly proportional.
          if (seg.handleIn) {
            seg.handleIn = new paper.Point(seg.handleIn.x * (1 + k), seg.handleIn.y * (1 + k));
          }
          if (seg.handleOut) {
            seg.handleOut = new paper.Point(seg.handleOut.x * (1 + k), seg.handleOut.y * (1 + k));
          }
        }
      }
      const d = cp.pathData;
      cp.remove();
      return d ? withD(rec, d) : rec;
    });
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Amount', min: -100, max: 100, step: 1,
      value: params.amount ?? 0, defaultValue: 0, suffix: '%',
      onChange: (v) => onChange({ amount: v }),
    }));
    return root;
  },
};
