// Calligraphy — variable-width stroke. Walks the path's arc-length and
// builds two offset polylines (one each side, half-width apart) using
// a profile function. The two are joined into a closed silhouette and
// emitted as a FILLED path with no stroke — so the rasterised result
// looks like a real brushed line whose width tapers along its run.
//
// Source paths can be open or closed; closed paths produce a "fat ring"
// silhouette. The original fill is dropped (the silhouette IS the fill).

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';
import { hydrate, subpaths } from '../_helpers.js';

const PROFILES = ['linear', 'tapered', 'reverse', 'wave', 'bulge'];

function profileAt(t, kind) {
  // t in [0,1]; returns multiplier in [0,1].
  switch (kind) {
    case 'linear':  return 1 - t;          // thick start → thin end
    case 'reverse': return t;              // thin start → thick end
    case 'tapered': return Math.sin(t * Math.PI);  // fat middle
    case 'bulge':   return 1 - Math.abs(2 * t - 1) * 0.6;  // soft bell
    case 'wave':    return 0.5 + 0.5 * Math.sin(t * Math.PI * 4);
    default:        return 1;
  }
}

export default {
  id: 'vector-calligraphy',
  name: 'Calligraphy',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'paint-brush',
  category: 'stroke',

  defaultParams() {
    return { width: 24, profile: 'tapered', density: 4, color: '#FFFFFF' };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const W = Math.max(0.1, params.width || 1) / 2;  // half-width
    const profile = params.profile || 'tapered';
    const step = Math.max(2, params.density || 4);
    const color = params.color || '#FFFFFF';
    const out = [];
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) { out.push(rec); continue; }
      for (const sub of subpaths(cp)) {
        if (!sub.segments?.length || !(sub.length > 0)) continue;
        const len = sub.length;
        const count = Math.max(8, Math.ceil(len / step));
        const left = [];
        const right = [];
        for (let i = 0; i <= count; i++) {
          const t = i / count;
          const off = Math.min(t * len, len);
          const pt = sub.getPointAt(off);
          const tan = sub.getTangentAt(off);
          if (!pt || !tan) continue;
          const w = W * profileAt(t, profile);
          // Perpendicular = rotate tangent 90°.
          const nx = -tan.y, ny = tan.x;
          left.push(new paper.Point(pt.x + nx * w, pt.y + ny * w));
          right.push(new paper.Point(pt.x - nx * w, pt.y - ny * w));
        }
        if (left.length < 2) continue;
        // Stitch: left forward + right reversed → closed silhouette.
        const segs = left.concat(right.reverse()).map((p) => new paper.Segment(p));
        const blob = new paper.Path({ segments: segs, closed: true });
        try { blob.smooth({ type: 'catmull-rom' }); } catch {}
        const d = blob.pathData;
        blob.remove();
        if (d) {
          out.push({
            d, closed: true,
            fill: { type: 'solid', color, opacity: 1 },
            stroke: { type: 'none' },
          });
        }
      }
      cp.remove();
    }
    return out.length ? out : paths;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Width', min: 1, max: 200, step: 1,
      value: params.width ?? 24, defaultValue: 24, suffix: 'px',
      onChange: (v) => onChange({ width: v }),
    }));
    root.appendChild(selectRow({
      label: 'Profile',
      value: params.profile || 'tapered',
      options: PROFILES.map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1) })),
      onChange: (v) => onChange({ profile: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Density', min: 2, max: 30, step: 1,
      value: params.density ?? 4, defaultValue: 4, suffix: 'px',
      onChange: (v) => onChange({ density: v }),
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
