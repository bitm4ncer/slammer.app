// Turbulence — fbm-noise displacement of every resampled path point.
// Gives an organic, hand-drawn wobble. Higher Detail packs the noise
// finer, higher Octaves layer multiple frequencies for a fractal feel.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, subpaths, withD, fbm, smoothPath } from '../_helpers.js';

export default {
  id: 'vector-turbulence',
  name: 'Turbulence',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'wind',
  category: 'distort',

  defaultParams() { return { amplitude: 14, detail: 0.02, octaves: 2, seed: 1, sampleEvery: 8 }; },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const A = Math.max(0, params.amplitude || 0);
    if (A === 0) return paths;
    const D = Math.max(0.001, params.detail || 0.02);
    const O = Math.max(1, Math.min(5, Math.round(params.octaves || 2)));
    const seed = params.seed || 1;
    const step = Math.max(2, params.sampleEvery || 8);
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
          const dx = fbm(pt.x * D, pt.y * D, seed, O) * A;
          const dy = fbm(pt.x * D + 31.7, pt.y * D - 17.3, seed + 5.5, O) * A;
          newPts.push(new paper.Point(pt.x + dx, pt.y + dy));
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
      label: 'Amplitude', min: 0, max: 80, step: 1,
      value: params.amplitude ?? 14, defaultValue: 14, suffix: 'px',
      onChange: (v) => onChange({ amplitude: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Detail', min: 1, max: 200, step: 1,
      value: Math.round((params.detail ?? 0.02) * 1000),
      defaultValue: 20, suffix: '/k',
      onChange: (v) => onChange({ detail: v / 1000 }),
    }));
    root.appendChild(sliderRow({
      label: 'Octaves', min: 1, max: 5, step: 1,
      value: params.octaves ?? 2, defaultValue: 2,
      onChange: (v) => onChange({ octaves: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Density', min: 2, max: 40, step: 1,
      value: params.sampleEvery ?? 8, defaultValue: 8, suffix: 'px',
      onChange: (v) => onChange({ sampleEvery: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Seed', min: 1, max: 999, step: 1,
      value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
    }));
    return root;
  },
};
