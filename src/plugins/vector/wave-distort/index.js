// Wave Distort — sinusoidal screen-space displacement. The user picks
// the source axis (which coordinate drives the wave) and the
// displacement axis (which coordinate gets shifted). Defaults give the
// classic "horizontal sine wave on a vertical line" look.

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';
import { hydrate, subpaths, withD, smoothPath } from '../_helpers.js';

export default {
  id: 'vector-wave-distort',
  name: 'Wave Distort',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'water',
  category: 'distort',

  defaultParams() {
    return { amplitude: 14, wavelength: 80, axis: 'x', displace: 'y', phase: 0, density: 8 };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const A = Math.max(0, params.amplitude || 0);
    if (A === 0) return paths;
    const W = Math.max(2, params.wavelength || 80);
    const k = 2 * Math.PI / W;
    const phi = (params.phase || 0) * Math.PI / 180;
    const sourceX = (params.axis || 'x') === 'x';
    const dispX = (params.displace || 'y') === 'x';
    const step = Math.max(2, params.density || 8);
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
          const drive = sourceX ? pt.x : pt.y;
          const d = Math.sin(drive * k + phi) * A;
          newPts.push(new paper.Point(
            pt.x + (dispX ? d : 0),
            pt.y + (dispX ? 0 : d),
          ));
        }
        const fresh = new paper.Path({
          segments: newPts.map((p) => new paper.Segment(p)),
          closed: !!sub.closed,
        });
        smoothPath(fresh);
        out.addChild(fresh);
      }
      const d = out.pathData;
      out.remove(); cp.remove();
      return d ? withD(rec, d) : rec;
    });
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Amplitude', min: 0, max: 100, step: 1,
      value: params.amplitude ?? 14, defaultValue: 14, suffix: 'px',
      onChange: (v) => onChange({ amplitude: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Wavelength', min: 10, max: 400, step: 1,
      value: params.wavelength ?? 80, defaultValue: 80, suffix: 'px',
      onChange: (v) => onChange({ wavelength: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Phase', min: 0, max: 360, step: 1,
      value: params.phase ?? 0, defaultValue: 0, suffix: '°',
      onChange: (v) => onChange({ phase: v }),
    }));
    root.appendChild(selectRow({
      label: 'Driven by',
      value: params.axis || 'x',
      options: [{ v: 'x', label: 'X position' }, { v: 'y', label: 'Y position' }],
      onChange: (v) => onChange({ axis: v }),
    }));
    root.appendChild(selectRow({
      label: 'Shift',
      value: params.displace || 'y',
      options: [{ v: 'y', label: 'Vertically' }, { v: 'x', label: 'Horizontally' }],
      onChange: (v) => onChange({ displace: v }),
    }));
    return root;
  },
};
