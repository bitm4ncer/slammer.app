// Spirograph — generate a hypotrochoid / epitrochoid pattern inscribed
// in each source path's bounding box. The original geometry is REPLACED
// with the spirograph curve (source path acts as a frame). Wire the
// inner radius and pen offset for the classic toy effect.

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';
import { hydrate } from '../_helpers.js';

export default {
  id: 'vector-spirograph',
  name: 'Spirograph',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'compact-disc',
  category: 'generate',

  defaultParams() {
    return { kind: 'hypo', innerRatio: 0.35, pen: 0.7, turns: 12, samples: 720 };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const kind = params.kind === 'epi' ? 'epi' : 'hypo';
    const innerRatio = Math.max(0.05, Math.min(0.95, params.innerRatio ?? 0.35));
    const pen = Math.max(0.05, Math.min(2, params.pen ?? 0.7));
    const turns = Math.max(1, Math.min(60, Math.round(params.turns ?? 12)));
    const samples = Math.max(64, Math.min(4000, Math.round(params.samples ?? 720)));
    const out = [];
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) { out.push(rec); continue; }
      const b = cp.bounds;
      cp.remove();
      if (!b || !(b.width > 0) || !(b.height > 0)) { out.push(rec); continue; }
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const R = Math.min(b.width, b.height) / 2;
      const r = R * innerRatio;
      const d = R * pen;
      const totalTheta = Math.PI * 2 * turns;
      const pts = new Array(samples + 1);
      for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * totalTheta;
        let x, y;
        if (kind === 'hypo') {
          const k = (R - r) / r;
          x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
          y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
        } else {
          const k = (R + r) / r;
          x = (R + r) * Math.cos(t) - d * Math.cos(k * t);
          y = (R + r) * Math.sin(t) - d * Math.sin(k * t);
        }
        pts[i] = new paper.Point(cx + x, cy + y);
      }
      const fresh = new paper.Path({
        segments: pts.map((p) => new paper.Segment(p)),
        closed: false,
      });
      try { fresh.smooth({ type: 'catmull-rom' }); } catch {}
      const newD = fresh.pathData;
      fresh.remove();
      if (newD) {
        out.push({
          d: newD, closed: false,
          fill: { type: 'none' },
          stroke: rec.stroke && rec.stroke.type !== 'none' ? rec.stroke : {
            type: 'solid', color: '#FFFFFF', width: 1,
            align: 'center', cap: 'round', join: 'round', dash: [],
          },
        });
      }
    }
    return out.length ? out : paths;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(selectRow({
      label: 'Kind',
      value: params.kind || 'hypo',
      options: [
        { v: 'hypo', label: 'Hypotrochoid (inside)' },
        { v: 'epi',  label: 'Epitrochoid (outside)' },
      ],
      onChange: (v) => onChange({ kind: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Inner', min: 5, max: 95, step: 1,
      value: Math.round((params.innerRatio ?? 0.35) * 100), defaultValue: 35, suffix: '%',
      onChange: (v) => onChange({ innerRatio: v / 100 }),
    }));
    root.appendChild(sliderRow({
      label: 'Pen', min: 5, max: 200, step: 1,
      value: Math.round((params.pen ?? 0.7) * 100), defaultValue: 70, suffix: '%',
      onChange: (v) => onChange({ pen: v / 100 }),
    }));
    root.appendChild(sliderRow({
      label: 'Turns', min: 1, max: 60, step: 1,
      value: params.turns ?? 12, defaultValue: 12,
      onChange: (v) => onChange({ turns: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Samples', min: 64, max: 4000, step: 16,
      value: params.samples ?? 720, defaultValue: 720,
      onChange: (v) => onChange({ samples: v }),
    }));
    return root;
  },
};
