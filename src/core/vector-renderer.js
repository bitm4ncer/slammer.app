// vector-renderer — rasterise a vector layer's paths to a 2D canvas via
// Paper.js, then return ImageData for the existing effect pipeline.
//
// Why Paper.js: gives us bezier paths, gradient fills, stroke alignment,
// boolean ops, simplification, hit-testing — all battle-tested. We use the
// headless mode (no view, no DOM) and feed our own canvas.

import paper from 'paper';

let _project = null;
function ensureProject() {
  if (!_project) {
    // Headless setup — create a tiny canvas just to keep paper happy. We
    // never draw to it directly; we use Paper to compute paths + render via
    // our own ctx in rasterizeVectorLayer().
    const dummy = document.createElement('canvas');
    dummy.width = 1; dummy.height = 1;
    paper.setup(dummy);
    _project = paper.project;
  } else {
    // Other modules (e.g. svg-import) may activate their own Paper project
    // and then remove it, leaving paper.project pointing somewhere else.
    // Re-activate ours every time so new objects land in our project and
    // hydratePath() never throws "no active project".
    _project.activate();
  }
  return _project;
}

// Hydrate a serialised path-record back into a paper.Path / CompoundPath.
// Path records: { d, closed, fill, stroke }
export function hydratePath(record) {
  ensureProject();
  // paper.Path supports SVG d-strings directly.
  const path = new paper.CompoundPath({ pathData: record.d });
  if (record.closed != null) {
    for (const child of path.children || [path]) {
      if (child.closed !== undefined) child.closed = !!record.closed;
    }
  }
  return path;
}

// Just the path geometry bbox (NO stroke expansion). Used by tools that
// need to position layers at the user's drawn coords without flinching as
// stroke width changes.
export function computePathBounds(paths) {
  ensureProject();
  if (!paths || !paths.length) return { x: 0, y: 0, width: 0, height: 0 };
  let union = null;
  const created = [];
  for (const rec of paths) {
    try {
      const p = hydratePath(rec);
      created.push(p);
      const b = p.bounds;
      union = union ? union.unite(b) : b;
    } catch (e) { /* skip */ }
  }
  for (const p of created) p.remove();
  return union
    ? { x: union.x, y: union.y, width: union.width, height: union.height }
    : { x: 0, y: 0, width: 0, height: 0 };
}

// Compute the union bounding-box of every path in the layer.
// Stroke expansion depends on alignment:
//   inside  → 0          (stroke fits within the path)
//   center  → width / 2  (half on each side of the path)
//   outside → width      (stroke sits entirely outside the path)
export function computeBounds(paths) {
  ensureProject();
  if (!paths || !paths.length) return { x: 0, y: 0, width: 0, height: 0 };
  let union = null;
  const created = [];
  for (const rec of paths) {
    try {
      const p = hydratePath(rec);
      created.push(p);
      const strokeW = rec.stroke && rec.stroke.type !== 'none' ? (rec.stroke.width || 0) : 0;
      const align = rec.stroke?.align || 'center';
      const grow = strokeW > 0
        ? (align === 'inside' ? 0 : align === 'outside' ? strokeW : strokeW / 2)
        : 0;
      const b = p.bounds;
      const expanded = grow > 0
        ? new paper.Rectangle(b.x - grow, b.y - grow, b.width + grow * 2, b.height + grow * 2)
        : b;
      union = union ? union.unite(expanded) : expanded;
    } catch (e) { /* skip malformed */ }
  }
  for (const p of created) p.remove();
  return union
    ? { x: union.x, y: union.y, width: union.width, height: union.height }
    : { x: 0, y: 0, width: 0, height: 0 };
}

// Apply a fill / stroke style spec to a Canvas2D context for one drawing.
// Origin is the path's local-space (after we've translated the ctx so the
// path's bounding-box top-left is at 0,0 with `pad` padding for stroke halo).
function applyFill(ctx, fill, bounds) {
  if (!fill || fill.type === 'none') { ctx.fillStyle = 'rgba(0,0,0,0)'; return false; }
  if (fill.type === 'solid') {
    ctx.fillStyle = withOpacity(fill.color, fill.opacity ?? 1);
    return true;
  }
  if (fill.type === 'gradient') {
    const grad = makeGradient(ctx, fill, bounds);
    if (grad) { ctx.fillStyle = grad; return true; }
  }
  return false;
}

function applyStroke(ctx, stroke, bounds) {
  if (!stroke || stroke.type === 'none') return false;
  if (stroke.type === 'solid') {
    ctx.strokeStyle = withOpacity(stroke.color, stroke.opacity ?? 1);
  } else if (stroke.type === 'gradient' || stroke.type === 'gradientAlong') {
    const grad = makeGradient(ctx, stroke, bounds);
    if (!grad) return false;
    ctx.strokeStyle = grad;
  }
  ctx.lineWidth   = stroke.width || 1;
  ctx.lineCap     = stroke.cap || 'butt';
  ctx.lineJoin    = stroke.join || 'miter';
  if (stroke.dash && stroke.dash.length) ctx.setLineDash(stroke.dash);
  return true;
}

function makeGradient(ctx, spec, bounds) {
  // bounds is { x, y, width, height } in pad-translated coords.
  // For 'linear' the from/to positions are FRACTIONS of bounds (0..1) so
  // gradients survive resizing without recomputation.
  const from = spec.from || { x: 0, y: 0.5 };
  const to   = spec.to   || { x: 1, y: 0.5 };
  const x1 = bounds.x + from.x * bounds.width;
  const y1 = bounds.y + from.y * bounds.height;
  const x2 = bounds.x + to.x * bounds.width;
  const y2 = bounds.y + to.y * bounds.height;
  let g;
  if ((spec.gradientType || 'linear') === 'linear') {
    g = ctx.createLinearGradient(x1, y1, x2, y2);
  } else {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const r = Math.hypot(x2 - x1, y2 - y1) / 2;
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
  }
  for (const stop of (spec.stops || [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }])) {
    g.addColorStop(Math.max(0, Math.min(1, stop.at)), withOpacity(stop.color, stop.opacity ?? 1));
  }
  return g;
}

function withOpacity(hex, op) {
  if (op == null || op >= 1) return hex;
  // accept #rgb, #rrggbb
  let r, g, b;
  if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
  else                  { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
  return `rgba(${r},${g},${b},${op})`;
}

// Walk a Paper.Path / CompoundPath and render its segments into a Canvas2D
// path. Set `beginNew=true` to start a fresh path; pass false to ADD to the
// existing path (used when building compound clips like outside-stroke).
function tracePathToCtx(ctx, paperPath, dx, dy, beginNew = true) {
  if (beginNew) ctx.beginPath();
  const walk = (path) => {
    if (!path.segments || !path.segments.length) return;
    let prev = null;
    for (let i = 0; i < path.segments.length; i++) {
      const s = path.segments[i];
      const pt = s.point;
      if (i === 0) {
        ctx.moveTo(pt.x + dx, pt.y + dy);
      } else {
        // Cubic bezier from prev.handleOut + s.handleIn
        const h1x = prev.point.x + (prev.handleOut?.x || 0);
        const h1y = prev.point.y + (prev.handleOut?.y || 0);
        const h2x = pt.x + (s.handleIn?.x || 0);
        const h2y = pt.y + (s.handleIn?.y || 0);
        if ((prev.handleOut && (prev.handleOut.x || prev.handleOut.y)) ||
            (s.handleIn && (s.handleIn.x || s.handleIn.y))) {
          ctx.bezierCurveTo(h1x + dx, h1y + dy, h2x + dx, h2y + dy, pt.x + dx, pt.y + dy);
        } else {
          ctx.lineTo(pt.x + dx, pt.y + dy);
        }
      }
      prev = s;
    }
    if (path.closed && path.segments.length > 1) {
      const first = path.segments[0];
      const h1x = prev.point.x + (prev.handleOut?.x || 0);
      const h1y = prev.point.y + (prev.handleOut?.y || 0);
      const h2x = first.point.x + (first.handleIn?.x || 0);
      const h2y = first.point.y + (first.handleIn?.y || 0);
      if ((prev.handleOut && (prev.handleOut.x || prev.handleOut.y)) ||
          (first.handleIn && (first.handleIn.x || first.handleIn.y))) {
        ctx.bezierCurveTo(h1x + dx, h1y + dy, h2x + dx, h2y + dy, first.point.x + dx, first.point.y + dy);
      }
      ctx.closePath();
    }
  };
  if (paperPath.children && paperPath.children.length) {
    for (const c of paperPath.children) walk(c);
  } else {
    walk(paperPath);
  }
}

// Main entry: rasterise an entire vector layer to ImageData.
//   layer.vector.paths → series of SVG d-strings + fill/stroke specs
//   Returns { imageData, naturalSize }
export function rasterizeVectorLayer(layer) {
  ensureProject();
  const recs = (layer.vector && layer.vector.paths) || [];
  // Empty placeholder used by the early-out branches. Always include
  // pathBounds + contentOffsetInImage so the renderer can call
  // image.position(...) without `undefined` crashes — the symptom of the
  // bug we used to ship: TypeError reading 'x' on initial shape draw.
  const empty = () => ({
    imageData: new ImageData(1, 1),
    naturalSize: { w: 1, h: 1 },
    pathBounds: { x: 0, y: 0, width: 1, height: 1 },
    contentOffsetInImage: { x: 0, y: 0 },
  });
  if (!recs.length) return empty();

  const b = computeBounds(recs);
  if (b.width <= 0 || b.height <= 0) return empty();
  const pad = 16;
  const w = Math.max(1, Math.ceil(b.width + pad * 2));
  const h = Math.max(1, Math.ceil(b.height + pad * 2));
  const dx = -b.x + pad;
  const dy = -b.y + pad;

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  for (const rec of recs) {
    let p;
    try { p = hydratePath(rec); } catch { continue; }
    const localBounds = {
      x: (p.bounds?.x || 0) + dx,
      y: (p.bounds?.y || 0) + dy,
      width: p.bounds?.width || 1,
      height: p.bounds?.height || 1,
    };
    // Fill
    tracePathToCtx(ctx, p, dx, dy);
    if (applyFill(ctx, rec.fill, localBounds)) ctx.fill();

    // Stroke — Canvas2D natively centres strokes on the path. For 'inside'
    // we clip to the path then double the line width (half clipped outside).
    // For 'outside' we build an even-odd clip = (giant rect) ⊕ path so only
    // the area OUTSIDE the path passes; stroke at 2× width keeps the outer half.
    if (rec.stroke && rec.stroke.type !== 'none') {
      ctx.save();
      const align = rec.stroke.align || 'center';
      let widthScale = 1;
      if (align === 'inside') {
        // Clip uses the path we already traced + filled.
        tracePathToCtx(ctx, p, dx, dy);
        ctx.clip();
        widthScale = 2;
      } else if (align === 'outside') {
        // Build a compound path: outer rect (CCW) + path → even-odd carves the path out.
        ctx.beginPath();
        ctx.rect(-1e5, -1e5, 2e5, 2e5);
        tracePathToCtx(ctx, p, dx, dy, /* beginNew */ false); // ADD to current path
        ctx.clip('evenodd');
        widthScale = 2;
      }
      // Now draw the stroke as a fresh path so the clip is applied correctly.
      tracePathToCtx(ctx, p, dx, dy);
      if (applyStroke(ctx, rec.stroke, localBounds)) {
        if (widthScale !== 1) ctx.lineWidth *= widthScale;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }
    p.remove();
  }

  const imageData = ctx.getImageData(0, 0, w, h);
  // Path-only bounds (no stroke / no pad) — the renderer + canvas-view use
  // these to position the image inside the layer group so that group origin
  // (0,0) coincides with the path's top-left in WORLD space. That keeps
  // selection handles tight to the path geometry and makes Konva.Transformer
  // scale around the path's actual top-left, not the padded canvas edge.
  const pathBounds = computePathBounds(recs);
  // contentOffsetInImage = where, in canvas pixels, the path's top-left sits.
  // dx = pad - b.x (b includes stroke), so canvas x for path.bounds.x is
  // path.bounds.x + dx = pad + (path.bounds.x - b.x) = pad + outsideStrokeGrow.
  const contentOffsetInImage = {
    x: pathBounds.x + dx,
    y: pathBounds.y + dy,
  };
  return {
    imageData,
    naturalSize: { w, h },
    pathBounds,
    contentOffsetInImage,
  };
}
