// Scribble — replace the fill region of each closed path with a single
// wandering polyline that bounces inside the silhouette. Generates
// horizontal scanlines clipped to the interior, then connects their
// endpoints with a slight arc to mimic a hand-sketched fill.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate, noise2 } from '../_helpers.js';

export default {
  id: 'vector-scribble',
  name: 'Scribble',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'pencil-alt',
  category: 'pattern',

  defaultParams() {
    return { spacing: 6, jitter: 2, lineWidth: 1, color: '#FFFFFF', angle: 0, seed: 1 };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const sp = Math.max(1, params.spacing || 6);
    const jit = Math.max(0, params.jitter || 0);
    const angle = ((params.angle || 0) * Math.PI) / 180;
    const lineWidth = Math.max(0.1, params.lineWidth || 1);
    const color = params.color || '#FFFFFF';
    const seed = params.seed || 1;
    const out = [];
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) { out.push(rec); continue; }
      const b = cp.bounds;
      if (!b || !(b.width > 0) || !(b.height > 0)) { cp.remove(); out.push(rec); continue; }
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const diag = Math.hypot(b.width, b.height) + sp * 2;
      // Walk scanlines top→bottom collecting clipped segments, then
      // connect end-to-start with the next scanline's start (zig-zag).
      const segments = [];
      let parity = 0;
      for (let v = -diag / 2; v <= diag / 2; v += sp) {
        const x1L = -diag / 2, x2L = diag / 2;
        const x1 = cx + x1L * cos - v * sin;
        const y1 = cy + x1L * sin + v * cos;
        const x2 = cx + x2L * cos - v * sin;
        const y2 = cy + x2L * sin + v * cos;
        const line = new paper.Path.Line({
          from: new paper.Point(x1, y1),
          to:   new paper.Point(x2, y2),
          insert: false,
        });
        let clipped;
        try { clipped = line.intersect(cp, { insert: false }); }
        catch { clipped = null; }
        if (!clipped) continue;
        const subs = clipped.children?.length ? clipped.children : [clipped];
        for (const sub of subs) {
          const segs = sub.segments || [];
          if (segs.length < 2) continue;
          const a = segs[0].point;
          const z = segs[segs.length - 1].point;
          // Reverse every other line so the polyline forms a continuous zig-zag.
          const ordered = (parity % 2 === 0) ? [a, z] : [z, a];
          // Per-endpoint jitter via deterministic noise.
          const jx1 = noise2(ordered[0].x * 0.2, ordered[0].y * 0.2, seed) * jit;
          const jy1 = noise2(ordered[0].x * 0.18, ordered[0].y * 0.22, seed + 4) * jit;
          const jx2 = noise2(ordered[1].x * 0.2, ordered[1].y * 0.2, seed + 9) * jit;
          const jy2 = noise2(ordered[1].x * 0.18, ordered[1].y * 0.22, seed + 13) * jit;
          segments.push(new paper.Point(ordered[0].x + jx1, ordered[0].y + jy1));
          segments.push(new paper.Point(ordered[1].x + jx2, ordered[1].y + jy2));
          parity++;
        }
        try { clipped.remove(); } catch {}
      }
      cp.remove();
      if (segments.length < 2) { out.push(rec); continue; }
      const polyline = new paper.Path({
        segments: segments.map((p) => new paper.Segment(p)),
        closed: false,
      });
      try { polyline.smooth({ type: 'catmull-rom' }); } catch {}
      const d = polyline.pathData;
      polyline.remove();
      if (d) {
        out.push({
          d, closed: false,
          fill: { type: 'none' },
          stroke: {
            type: 'solid', color, width: lineWidth,
            align: 'center', cap: 'round', join: 'round', dash: [],
          },
        });
      }
    }
    return out.length ? out : paths;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Spacing', min: 1, max: 30, step: 0.5,
      value: params.spacing ?? 6, defaultValue: 6, suffix: 'px',
      onChange: (v) => onChange({ spacing: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Jitter', min: 0, max: 20, step: 0.5,
      value: params.jitter ?? 2, defaultValue: 2, suffix: 'px',
      onChange: (v) => onChange({ jitter: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Angle', min: 0, max: 180, step: 1,
      value: params.angle ?? 0, defaultValue: 0, suffix: '°',
      onChange: (v) => onChange({ angle: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Line', min: 0.5, max: 6, step: 0.5,
      value: params.lineWidth ?? 1, defaultValue: 1, suffix: 'px',
      onChange: (v) => onChange({ lineWidth: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Seed', min: 1, max: 999, step: 1,
      value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
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
