// svg-import — turn a dropped .svg file into a new vector layer.
// Uses Paper.js's importSVG which understands almost every SVG construct
// (paths, shapes, transforms, groups, gradients, basic style attributes).
//
// Optional `opts.position` (world coords) makes the SVG's CENTRE land at
// the drop point. Translates every path d-string at creation time and
// sets the layer's transform accordingly, honouring the Phase 13
// top-left-origin contract (transform.x/y set ONCE at creation, never
// mutated later — see CLAUDE.md "Vector layer architecture").

import { paper, ensurePaper, activatePaper } from '../../core/paper-context.js';
import { translatePathD } from '../../core/vector-renderer.js';

export async function importSvgFile(file, doc, opts = {}) {
  ensurePaper();
  const text = await file.text();
  // Use a temporary detached project so we don't pollute the rasterise pipeline.
  const tempProject = new paper.Project(document.createElement('canvas'));
  tempProject.activate();
  const root = tempProject.importSVG(text, { expandShapes: true });

  // Walk every leaf path/compound and emit a serialisable record.
  // CRITICAL: Paper's `p.pathData` returns coords in the path's LOCAL space,
  // ignoring any parent <g transform="…"> matrices. We bake the accumulated
  // global matrix into the segments first so the d-string we store is in
  // the SVG's root coordinate system — otherwise paths land in the wrong
  // place on canvas and their anchor overlay drifts away from the visible
  // raster (paths with parent translates are the worst offenders).
  const records = [];
  root.getItems({ class: paper.PathItem }).forEach((p) => {
    if (!p.pathData) return;
    const m = p.globalMatrix;
    if (m && !m.isIdentity()) {
      try { p.transform(m); } catch {}
    }
    const fillSpec = paperFillToSpec(p.fillColor);
    const strokeSpec = paperStrokeToSpec(p);
    records.push({
      d: p.pathData,
      closed: !!p.closed,
      fill: fillSpec,
      stroke: strokeSpec,
    });
  });
  // Tear down the temp project so memory doesn't leak between imports.
  tempProject.remove();
  // Re-activate the shared project so subsequent path hydrations land in it.
  activatePaper();

  if (!records.length) {
    console.warn('[svg] no paths found in', file.name);
    return null;
  }
  // Compute combined bounds and set the layer's transform so the SVG renders
  // at the world coords matching the path data inside the file.
  const { computePathBounds } = await import('../../core/vector-renderer.js');
  const b = computePathBounds(records);
  // If a drop position is supplied, translate every path d-string so the
  // SVG's centre lands at (position.x, position.y). The new top-left is
  // (position.x - b.width/2, position.y - b.height/2). transform.x/y is
  // set ONCE here per the Phase 13 top-left-origin contract.
  let finalRecords = records;
  let originX = b.x;
  let originY = b.y;
  const position = opts && opts.position;
  if (position) {
    const targetX = position.x - b.width / 2;
    const targetY = position.y - b.height / 2;
    const dx = targetX - b.x;
    const dy = targetY - b.y;
    finalRecords = records.map((rec) => ({
      ...rec,
      d: translatePathD(rec.d, dx, dy),
    }));
    originX = targetX;
    originY = targetY;
  }
  return doc.addVectorLayer({
    name: file.name.replace(/\.svg$/i, ''),
    // Top-left origin: layer's transform = path bbox top-left in world.
    transform: { x: originX, y: originY },
    vector: { paths: finalRecords },
  });
}

function paperFillToSpec(color) {
  if (!color) return { type: 'none' };
  if (color.type === 'gradient') {
    return {
      type: 'gradient',
      gradientType: color.gradient?.radial ? 'radial' : 'linear',
      stops: (color.gradient?.stops || []).map((s) => ({
        at: s.offset,
        color: s.color?.toCSS(true) || '#000',
      })),
      // Origin / destination — Paper exposes these on the Color instance.
      from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 },  // crude default; a future pass can map paper's origin/destination back to fractions
    };
  }
  return { type: 'solid', color: color.toCSS(true), opacity: color.alpha ?? 1 };
}

function paperStrokeToSpec(p) {
  if (!p.strokeColor) return { type: 'none' };
  const color = p.strokeColor;
  const base = {
    type: color.type === 'gradient' ? 'gradient' : 'solid',
    color: color.type === 'gradient' ? '#000' : color.toCSS(true),
    width: p.strokeWidth || 1,
    align: 'center',
    cap: p.strokeCap || 'butt',
    join: p.strokeJoin || 'miter',
    dash: p.dashArray || [],
    alongPath: false,
    opacity: color.alpha ?? 1,
  };
  if (color.type === 'gradient') {
    base.gradientType = color.gradient?.radial ? 'radial' : 'linear';
    base.stops = (color.gradient?.stops || []).map((s) => ({
      at: s.offset, color: s.color?.toCSS(true) || '#000',
    }));
    base.from = { x: 0, y: 0.5 }; base.to = { x: 1, y: 0.5 };
  }
  return base;
}
