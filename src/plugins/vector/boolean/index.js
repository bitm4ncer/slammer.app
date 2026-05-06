// Boolean (live) — non-destructive set ops on the layer's path list.
// Folds path[0] op path[1] op path[2] ... into a single result, applied
// at render time so the source paths stay editable. Use Path → Combine
// in the panel for a destructive equivalent.

import { sliderRow, makeRoot, selectRow } from '../../shared/ui-helpers.js';

const OPS = ['unite', 'subtract', 'intersect', 'exclude'];

export default {
  id: 'vector-boolean',
  name: 'Boolean',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'object-group',
  category: 'combine',
  multiPathPreferred: true,

  defaultParams() { return { op: 'unite' }; },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    if (paths.length < 2) return paths;
    const op = OPS.includes(params.op) ? params.op : 'unite';
    let agg = null;
    const created = [];
    for (const rec of paths) {
      let p;
      try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { continue; }
      // Boolean ops want closed regions; force-close any open subpath.
      for (const sub of (p.children?.length ? p.children : [p])) sub.closed = true;
      created.push(p);
      if (!agg) { agg = p; continue; }
      let next;
      try {
        if (op === 'unite')        next = agg.unite(p);
        else if (op === 'subtract') next = agg.subtract(p);
        else if (op === 'intersect') next = agg.intersect(p);
        else if (op === 'exclude')  next = agg.exclude(p);
      } catch { next = null; }
      if (next) {
        if (agg !== next) {
          // unite/subtract/intersect/exclude return a NEW item; remove
          // the previous accumulator to keep the project tidy.
          try { agg.remove(); } catch {}
          agg = next;
        }
      }
    }
    if (!agg) return paths;
    const d = agg.pathData;
    for (const c of created) {
      if (c !== agg) { try { c.remove(); } catch {} }
    }
    try { agg.remove(); } catch {}
    if (!d) return paths;
    // Inherit the first source path's fill/stroke (matches the "non-
    // destructive Combine" convention used by the panel command).
    const base = paths[0];
    return [{ d, closed: true, fill: base.fill, stroke: base.stroke }];
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(selectRow({
      label: 'Op',
      value: params.op || 'unite',
      options: OPS.map((v) => ({ v, label: v[0].toUpperCase() + v.slice(1) })),
      onChange: (v) => onChange({ op: v }),
    }));
    return root;
  },
};

// Hint to the unused-import linter that sliderRow is intentionally
// imported — kept available so downstream tweaks (per-op weight, etc.)
// can use it without having to re-add the import.
void sliderRow;
