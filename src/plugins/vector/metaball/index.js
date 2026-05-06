// Metaball — true iso-surface around all input paths. Each source
// shape becomes a charge centred on its bbox, contributing a 1/r²
// potential to a sampled grid. Marching squares walks the grid and
// extracts the contour where the field equals `threshold`. Contours
// are then stitched into closed polygons and emitted as one
// CompoundPath. The smooth "bridge" between near-touching shapes that
// you can't get from a plain unite of circles falls out for free.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';
import { hydrate } from '../_helpers.js';

export default {
  id: 'vector-metaball',
  name: 'Metaball',
  version: '1.0.0',
  type: 'vector-filter',
  icon: 'circle',
  category: 'combine',
  multiPathPreferred: true,

  defaultParams() {
    return { strength: 1.0, threshold: 1.0, resolution: 80, smooth: true };
  },

  processPaths(paths, params, ctx) {
    const { paper } = ctx;
    if (!paths.length) return paths;
    const strength = Math.max(0.1, params.strength || 1.0);
    const threshold = Math.max(0.05, params.threshold || 1.0);
    const res = Math.max(20, Math.min(300, Math.round(params.resolution || 80)));
    const smooth = params.smooth !== false;

    // 1. Convert each input path into a metaball: centre + radius.
    const balls = [];
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const rec of paths) {
      const cp = hydrate(paper, rec);
      if (!cp) continue;
      const b = cp.bounds;
      cp.remove();
      if (!(b && b.width > 0 && b.height > 0)) continue;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const r  = (Math.min(b.width, b.height) / 2) * strength;
      balls.push({ cx, cy, r2: r * r });
      // Pad by ~1.5× radius so the iso contour has room to envelope.
      const pad = r * 1.6;
      bx0 = Math.min(bx0, b.x - pad);
      by0 = Math.min(by0, b.y - pad);
      bx1 = Math.max(bx1, b.x + b.width + pad);
      by1 = Math.max(by1, b.y + b.height + pad);
    }
    if (!balls.length) return paths;

    const W = bx1 - bx0;
    const H = by1 - by0;
    if (!(W > 0 && H > 0)) return paths;

    // 2. Sample the field on a (cols × rows) grid. Resolution is the
    //    LONGER dimension's cell count; the other matches aspect.
    const cellSize = Math.max(W, H) / res;
    const cols = Math.max(2, Math.ceil(W / cellSize));
    const rows = Math.max(2, Math.ceil(H / cellSize));
    const field = new Float32Array((cols + 1) * (rows + 1));
    const idx = (i, j) => j * (cols + 1) + i;
    for (let j = 0; j <= rows; j++) {
      const y = by0 + j * cellSize;
      for (let i = 0; i <= cols; i++) {
        const x = bx0 + i * cellSize;
        let f = 0;
        for (const b of balls) {
          const dx = x - b.cx, dy = y - b.cy;
          const d2 = dx * dx + dy * dy;
          if (d2 < 1e-3) { f += 1e6; continue; }
          f += b.r2 / d2;
        }
        field[idx(i, j)] = f;
      }
    }

    // 3. Marching squares — emit raw line segments per cell.
    //    Cell corners (BL, BR, TR, TL) → 16 cases. Standard table.
    const segs = [];
    const cell = (i0, j0) => {
      const v0 = field[idx(i0,     j0    )]; // BL
      const v1 = field[idx(i0 + 1, j0    )]; // BR
      const v2 = field[idx(i0 + 1, j0 + 1)]; // TR
      const v3 = field[idx(i0,     j0 + 1)]; // TL
      let c = 0;
      if (v0 >= threshold) c |= 1;
      if (v1 >= threshold) c |= 2;
      if (v2 >= threshold) c |= 4;
      if (v3 >= threshold) c |= 8;
      if (c === 0 || c === 15) return;
      const x0 = bx0 + i0 * cellSize;
      const y0 = by0 + j0 * cellSize;
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;
      // Linear interpolation along each edge that the iso crosses.
      const lerp = (a, b) => (threshold - a) / (b - a);
      const E_BOT = () => ({ x: x0 + lerp(v0, v1) * cellSize, y: y0 });
      const E_RGT = () => ({ x: x1, y: y0 + lerp(v1, v2) * cellSize });
      const E_TOP = () => ({ x: x0 + lerp(v3, v2) * cellSize, y: y1 });
      const E_LFT = () => ({ x: x0, y: y0 + lerp(v0, v3) * cellSize });
      // Saddle handling: case 5 + 10 are ambiguous; resolve via centre.
      const center = (v0 + v1 + v2 + v3) / 4;
      switch (c) {
        case 1:  segs.push([E_LFT(), E_BOT()]); break;
        case 2:  segs.push([E_BOT(), E_RGT()]); break;
        case 3:  segs.push([E_LFT(), E_RGT()]); break;
        case 4:  segs.push([E_RGT(), E_TOP()]); break;
        case 5:
          if (center >= threshold) {
            segs.push([E_LFT(), E_TOP()]);
            segs.push([E_BOT(), E_RGT()]);
          } else {
            segs.push([E_LFT(), E_BOT()]);
            segs.push([E_RGT(), E_TOP()]);
          }
          break;
        case 6:  segs.push([E_BOT(), E_TOP()]); break;
        case 7:  segs.push([E_LFT(), E_TOP()]); break;
        case 8:  segs.push([E_TOP(), E_LFT()]); break;
        case 9:  segs.push([E_TOP(), E_BOT()]); break;
        case 10:
          if (center >= threshold) {
            segs.push([E_TOP(), E_RGT()]);
            segs.push([E_BOT(), E_LFT()]);
          } else {
            segs.push([E_TOP(), E_LFT()]);
            segs.push([E_BOT(), E_RGT()]);
          }
          break;
        case 11: segs.push([E_TOP(), E_RGT()]); break;
        case 12: segs.push([E_RGT(), E_LFT()]); break;
        case 13: segs.push([E_RGT(), E_BOT()]); break;
        case 14: segs.push([E_BOT(), E_LFT()]); break;
      }
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) cell(i, j);
    }
    if (!segs.length) return paths;

    // 4. Stitch raw segments into chains via endpoint-matching. We bin
    //    points into a small spatial hash so floating-point matches
    //    survive linear-interpolation rounding.
    const eps = cellSize * 0.05;
    const bin = (p) => `${Math.round(p.x / eps)}|${Math.round(p.y / eps)}`;
    const open = new Map();   // key -> array of segs that touch
    for (const s of segs) {
      const ka = bin(s[0]), kb = bin(s[1]);
      if (!open.has(ka)) open.set(ka, []);
      if (!open.has(kb)) open.set(kb, []);
      open.get(ka).push({ seg: s, end: 0 });
      open.get(kb).push({ seg: s, end: 1 });
    }

    const used = new Set();
    const chains = [];
    for (const start of segs) {
      if (used.has(start)) continue;
      used.add(start);
      const chain = [start[0], start[1]];
      let head = start[1];
      let prev = start;
      // Walk forward.
      while (true) {
        const k = bin(head);
        const list = open.get(k) || [];
        let nextEntry = null;
        for (const e of list) {
          if (e.seg === prev || used.has(e.seg)) continue;
          nextEntry = e;
          break;
        }
        if (!nextEntry) break;
        used.add(nextEntry.seg);
        const other = nextEntry.seg[1 - nextEntry.end];
        chain.push(other);
        prev = nextEntry.seg;
        head = other;
        if (bin(head) === bin(start[0])) break; // closed
      }
      chains.push(chain);
    }

    // 5. Emit ONE CompoundPath whose subpaths are the contour chains.
    const compound = new paper.CompoundPath();
    for (const chain of chains) {
      if (chain.length < 3) continue;
      const closed = bin(chain[0]) === bin(chain[chain.length - 1]);
      const trimmed = closed ? chain.slice(0, -1) : chain;
      const sp = new paper.Path({
        segments: trimmed.map((p) => new paper.Segment(new paper.Point(p.x, p.y))),
        closed,
        insert: false,
      });
      if (smooth) { try { sp.smooth({ type: 'catmull-rom' }); } catch {} }
      compound.addChild(sp);
    }
    const d = compound.pathData;
    compound.remove();
    if (!d) return paths;
    // Inherit fill/stroke from path[0] so the user's chosen colour
    // propagates onto the merged blob.
    const base = paths[0];
    return [{
      d, closed: true,
      fill: base.fill || { type: 'solid', color: '#FFFFFF', opacity: 1 },
      stroke: base.stroke || { type: 'none' },
    }];
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Strength', min: 10, max: 300, step: 5,
      value: Math.round((params.strength ?? 1.0) * 100), defaultValue: 100, suffix: '%',
      onChange: (v) => onChange({ strength: v / 100 }),
    }));
    root.appendChild(sliderRow({
      label: 'Threshold', min: 5, max: 300, step: 5,
      value: Math.round((params.threshold ?? 1.0) * 100), defaultValue: 100, suffix: '%',
      onChange: (v) => onChange({ threshold: v / 100 }),
    }));
    root.appendChild(sliderRow({
      label: 'Resolution', min: 20, max: 300, step: 5,
      value: params.resolution ?? 80, defaultValue: 80,
      onChange: (v) => onChange({ resolution: v }),
    }));
    const smoothRow = document.createElement('label');
    smoothRow.className = 'effect-slider-row';
    smoothRow.innerHTML = '<span class="effect-label">Smooth</span>';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = params.smooth !== false;
    cb.addEventListener('change', () => onChange({ smooth: cb.checked }));
    smoothRow.appendChild(cb);
    root.appendChild(smoothRow);
    return root;
  },
};
