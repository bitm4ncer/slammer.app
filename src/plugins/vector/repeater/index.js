// Repeater — duplicate every input path N times, applying an
// incremental transform (translate / rotate / scale) per copy. Each
// copy keeps the source's fill + stroke so the visual builds up as
// the same shape stamped along a transformation chain.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, withD } from '../_helpers.js';

export default {
  id: 'vector-repeater',
  name: 'Repeater',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'clone',
  category: 'generate',

  defaultParams() {
    return { count: 6, translateX: 12, translateY: 0, rotate: 0, scale: 100 };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const N = Math.max(1, Math.min(30, Math.round(params.count || 1)));
    if (N <= 1) return paths;
    const tx = params.translateX || 0;
    const ty = params.translateY || 0;
    const rot = (params.rotate || 0) * Math.PI / 180;
    const scl = Math.max(0.01, (params.scale ?? 100) / 100);
    const out = [];
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) { out.push(rec); continue; }
      // Pivot for rotate/scale = the source path's bbox centre. Each
      // copy's transform is applied as N stacked iterations of
      // (translate → rotate-around-centre → scale-around-centre).
      const bb = cp.bounds;
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      // Original copy first.
      out.push({ ...rec, d: cp.pathData });
      let acc = cp.clone({ insert: false });
      for (let i = 1; i < N; i++) {
        // Translate.
        acc.translate(new paper.Point(tx, ty));
        // Rotate + scale around the (translated) centre of THIS copy.
        const bbi = acc.bounds;
        const cxi = bbi.x + bbi.width / 2;
        const cyi = bbi.y + bbi.height / 2;
        if (rot !== 0)        acc.rotate((params.rotate || 0), new paper.Point(cxi, cyi));
        if (scl !== 1)        acc.scale(scl, new paper.Point(cxi, cyi));
        const d = acc.pathData;
        if (d) out.push(withD(rec, d));
      }
      try { acc.remove(); } catch {}
      cp.remove();
      void cx; void cy;
    }
    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Count', min: 1, max: 30, step: 1,
      value: params.count ?? 6, defaultValue: 6,
      onChange: (v) => onChange({ count: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Translate X', min: -200, max: 200, step: 1,
      value: params.translateX ?? 12, defaultValue: 12, suffix: 'px',
      onChange: (v) => onChange({ translateX: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Translate Y', min: -200, max: 200, step: 1,
      value: params.translateY ?? 0, defaultValue: 0, suffix: 'px',
      onChange: (v) => onChange({ translateY: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Rotate', min: -180, max: 180, step: 1,
      value: params.rotate ?? 0, defaultValue: 0, suffix: '°',
      onChange: (v) => onChange({ rotate: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Scale', min: 10, max: 200, step: 1,
      value: params.scale ?? 100, defaultValue: 100, suffix: '%',
      onChange: (v) => onChange({ scale: v }),
    }));
    return root;
  },
};
