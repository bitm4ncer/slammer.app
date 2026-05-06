// ZigZag — perpendicular wave displacement along the path.
//
// Resamples each sub-path at `wavelength` arc-length increments, then
// shoves every other sample +/- `amplitude` along the local normal.
// The result is reconnected as either sharp corners (saw-tooth) or
// catmull-smoothed curves (sinusoidal feel).

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, subpaths, withD, smoothPath } from '../_helpers.js';

export default {
  id: 'vector-zigzag',
  name: 'ZigZag',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'wave-square',
  category: 'distort',

  defaultParams() { return { amplitude: 12, wavelength: 24, smooth: false }; },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const A = Math.max(0, params.amplitude || 0);
    const W = Math.max(2, params.wavelength || 2);
    if (A === 0) return paths;
    return paths.map((rec) => {
      const cp = hydrate(paper, rec);
      if (!cp) return rec;
      const out = new paper.CompoundPath();
      for (const sub of subpaths(cp)) {
        if (!sub.segments?.length || !(sub.length > 0)) continue;
        const len = sub.length;
        const count = Math.max(3, Math.ceil(len / W));
        const step = len / count;
        const newPts = [];
        for (let i = 0; i <= count; i++) {
          const off = Math.min(i * step, len);
          const pt = sub.getPointAt(off);
          if (!pt) continue;
          const tan = sub.getTangentAt(off) || new paper.Point(1, 0);
          // Perpendicular = rotate tangent 90°.
          const nx = -tan.y, ny = tan.x;
          const sign = (i % 2 === 0) ? 1 : -1;
          // Endpoints stay put for open paths so the curve still meets
          // its neighbours; closed paths get the full wave everywhere.
          const isEnd = !sub.closed && (i === 0 || i === count);
          const a = isEnd ? 0 : A * sign;
          newPts.push(new paper.Point(pt.x + nx * a, pt.y + ny * a));
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
      label: 'Amplitude', min: 0, max: 80, step: 1,
      value: params.amplitude ?? 12, defaultValue: 12, suffix: 'px',
      onChange: (v) => onChange({ amplitude: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Wavelength', min: 4, max: 200, step: 1,
      value: params.wavelength ?? 24, defaultValue: 24, suffix: 'px',
      onChange: (v) => onChange({ wavelength: v }),
    }));
    const smoothRow = document.createElement('label');
    smoothRow.className = 'effect-slider-row';
    smoothRow.innerHTML = '<span class="effect-label">Smooth</span>';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!params.smooth;
    cb.addEventListener('change', () => onChange({ smooth: cb.checked }));
    smoothRow.appendChild(cb);
    root.appendChild(smoothRow);
    return root;
  },
};
