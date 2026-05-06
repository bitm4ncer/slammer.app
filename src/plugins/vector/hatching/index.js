// Hatching — fills closed paths with parallel scanlines clipped to the
// shape's interior. Output replaces the source path's fill (stroke
// stays so the lines are visible). Input must be closed; open paths
// are passed through untouched.

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';
import { hydrate } from '../_helpers.js';

export default {
  id: 'vector-hatching',
  name: 'Hatching',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'grip-lines',
  category: 'pattern',

  defaultParams() {
    return { spacing: 8, angle: 45, lineWidth: 1, color: '#FFFFFF', double: false };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    const spacing = Math.max(1, params.spacing || 8);
    const angle = ((params.angle || 0) * Math.PI) / 180;
    const lineWidth = Math.max(0.1, params.lineWidth || 1);
    const color = params.color || '#FFFFFF';
    const out = [];
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) { out.push(rec); continue; }
      const angles = params.double ? [angle, angle + Math.PI / 2] : [angle];
      for (const a of angles) {
        const segs = hatchOne(paper, cp, spacing, a);
        if (!segs.length) continue;
        const compound = new paper.CompoundPath({ children: segs });
        const d = compound.pathData;
        compound.remove();
        if (d) {
          out.push({
            d, closed: false,
            fill: { type: 'none' },
            stroke: {
              type: 'solid', color, width: lineWidth,
              align: 'center', cap: 'butt', join: 'miter', dash: [],
            },
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
      label: 'Spacing', min: 2, max: 60, step: 1,
      value: params.spacing ?? 8, defaultValue: 8, suffix: 'px',
      onChange: (v) => onChange({ spacing: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Angle', min: 0, max: 180, step: 1,
      value: params.angle ?? 45, defaultValue: 45, suffix: '°',
      onChange: (v) => onChange({ angle: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Line', min: 0.5, max: 8, step: 0.5,
      value: params.lineWidth ?? 1, defaultValue: 1, suffix: 'px',
      onChange: (v) => onChange({ lineWidth: v }),
    }));
    root.appendChild(selectRow({
      label: 'Pattern',
      value: params.double ? 'cross' : 'single',
      options: [{ v: 'single', label: 'Single' }, { v: 'cross', label: 'Cross-hatch' }],
      onChange: (v) => onChange({ double: v === 'cross' }),
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

// Generate parallel scanlines at `angle` (radians) spaced `spacing` apart,
// clipped to the interior of compoundPath. Returns an array of fresh
// paper.Path line segments.
function hatchOne(paper, compoundPath, spacing, angle) {
  const b = compoundPath.bounds;
  if (!b || !(b.width > 0) || !(b.height > 0)) return [];
  // Rotate the bbox into hatch-aligned space so we can sweep along the
  // y-axis. We generate lines in the local (uAxis, vAxis) frame, then
  // intersect each with the original (un-rotated) path.
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Diagonal of bbox = max distance any sweep line might travel.
  const diag = Math.hypot(b.width, b.height) + spacing * 2;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  // Sweep v from -diag/2 to +diag/2 in `spacing` steps.
  const out = [];
  for (let v = -diag / 2; v <= diag / 2; v += spacing) {
    // Endpoint in local frame: (-diag/2, v) and (+diag/2, v)
    const x1L = -diag / 2, x2L = diag / 2, yL = v;
    // Rotate back into world.
    const x1 = cx + x1L * cos - yL * sin;
    const y1 = cy + x1L * sin + yL * cos;
    const x2 = cx + x2L * cos - yL * sin;
    const y2 = cy + x2L * sin + yL * cos;
    const line = new paper.Path.Line({
      from: new paper.Point(x1, y1),
      to:   new paper.Point(x2, y2),
      insert: false,
    });
    let clipped;
    try { clipped = line.intersect(compoundPath, { insert: false }); }
    catch { clipped = null; }
    if (clipped) {
      const subs = clipped.children?.length ? clipped.children : [clipped];
      for (const s of subs) {
        if (s.segments && s.segments.length >= 2) {
          out.push(s.clone({ insert: false }));
        }
      }
      try { clipped.remove(); } catch {}
    }
  }
  return out;
}
