// Twist — rotate each anchor around the sub-path's centroid by an angle
// proportional to its distance from the centre. Like AI's Twirl: the
// shape spirals around itself.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, subpaths, withD, centroid } from '../_helpers.js';

export default {
  id: 'vector-twist',
  name: 'Twist',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'sync-alt',
  category: 'distort',

  defaultParams() { return { angle: 30 }; },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const baseAngle = (params.angle || 0) * Math.PI / 180;
    if (baseAngle === 0) return paths;
    return paths.map((rec) => {
      const cp = hydrate(paper, rec);
      if (!cp) return rec;
      for (const sub of subpaths(cp)) {
        if (!sub.segments?.length) continue;
        const c = centroid(sub);
        // Reference radius — max distance from centroid. Twist scales
        // linearly with r/maxR so the outer rim swings the full angle.
        let maxR = 1;
        for (const seg of sub.segments) {
          const r = Math.hypot(seg.point.x - c.x, seg.point.y - c.y);
          if (r > maxR) maxR = r;
        }
        for (const seg of sub.segments) {
          const dx = seg.point.x - c.x;
          const dy = seg.point.y - c.y;
          const r = Math.hypot(dx, dy);
          const ang = baseAngle * (r / maxR);
          const cs = Math.cos(ang), sn = Math.sin(ang);
          seg.point.x = c.x + dx * cs - dy * sn;
          seg.point.y = c.y + dx * sn + dy * cs;
          // Rotate handles by the same local angle (they're relative to
          // the anchor, so no centroid offset needed).
          if (seg.handleIn) {
            const hx = seg.handleIn.x, hy = seg.handleIn.y;
            seg.handleIn = new paper.Point(hx * cs - hy * sn, hx * sn + hy * cs);
          }
          if (seg.handleOut) {
            const hx = seg.handleOut.x, hy = seg.handleOut.y;
            seg.handleOut = new paper.Point(hx * cs - hy * sn, hx * sn + hy * cs);
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
      label: 'Angle', min: -360, max: 360, step: 1,
      value: params.angle ?? 30, defaultValue: 30, suffix: '°',
      onChange: (v) => onChange({ angle: v }),
    }));
    return root;
  },
};
