// vector-renderer — rasterise a vector layer's paths to a 2D canvas via
// Paper.js, then return ImageData for the existing effect pipeline.
//
// Why Paper.js: gives us bezier paths, gradient fills, stroke alignment,
// boolean ops, simplification, hit-testing — all battle-tested. We use the
// headless mode (no view, no DOM) and feed our own canvas.

// COORDINATE CONVENTION (load-bearing — read this if you touch any vector
// tool). Every vector layer's path d-strings are stored in WORLD
// coordinates (the same world-space pixel positions where the user drew
// them). `layer.transform.x/y` is the rotation/scale anchor — typically
// the path-bbox top-left in world but not guaranteed (text→path keeps
// the source text layer's transform so rotations are consistent across
// the convert).
//
// The renderer compensates for any drift between layer.transform and
// pathBounds via `image.position` (see renderer.js around L207) so
// non-edited anchors stay put as the path grows or shrinks. The math:
//   world(lx) = group.x + image.x + canvas_x_for_lx
//             = transform.x + (pathBounds.x - transform.x - pad)
//                          + (lx + pad - pathBounds.x)
//             = lx
// — i.e. path-coord lx ALWAYS lands at world lx regardless of where
// transform.x/y sits.
//
// All vector tooling (pen, pencil, shape-drawer, svg-import, text→path,
// anchor-overlay) MUST emit / read world-coord path data so this
// invariant holds. Text→path uses layer.transform = (sourceText.x,
// sourceText.y) for rotation continuity; pen/pencil/shape use
// (pathBounds.x, pathBounds.y).

import { paper, ensurePaper } from './paper-context.js';

// Padding around the path bbox so blur / displacement / glow don't clip.
// Exported via the rasterise return so the consumer (renderer.js) can
// position the Konva.Image to compensate for path-bounds shifts.
const PAD = 16;

function ensureProject() { return ensurePaper(); }

// Translate a path d-string by (dx, dy) in WORLD coords. Used by the
// renderer when a vector layer is dragged/transformed: layer.transform
// updates to the new Konva.Group position, so the path d-coords need to
// shift by the same amount or the next paint will jump the image back to
// its creation-time world location (anchor overlay would also drift).
export function translatePathD(d, dx, dy) {
  if (!d || (dx === 0 && dy === 0)) return d;
  ensurePaper();
  let p;
  try { p = new paper.CompoundPath({ pathData: d }); } catch { return d; }
  p.translate(new paper.Point(dx, dy));
  const out = p.pathData;
  p.remove();
  return out || d;
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

// Parse a #rgb / #rrggbb / rgba()/rgb() colour into [r, g, b, a] floats.
function parseRGBA(spec) {
  if (!spec) return [0, 0, 0, 1];
  if (spec[0] === '#') {
    let r, g, b;
    if (spec.length === 4) {
      r = parseInt(spec[1] + spec[1], 16); g = parseInt(spec[2] + spec[2], 16); b = parseInt(spec[3] + spec[3], 16);
    } else {
      r = parseInt(spec.slice(1, 3), 16); g = parseInt(spec.slice(3, 5), 16); b = parseInt(spec.slice(5, 7), 16);
    }
    return [r, g, b, 1];
  }
  const m = spec.match(/rgba?\(([^)]+)\)/i);
  if (!m) return [0, 0, 0, 1];
  const parts = m[1].split(',').map((s) => parseFloat(s));
  return [parts[0] | 0, parts[1] | 0, parts[2] | 0, parts[3] == null ? 1 : parts[3]];
}

// Sample a gradient stops list at offset t (0..1) → "rgba(...)".
function sampleGradient(stops, t) {
  if (!stops || !stops.length) return 'rgba(0,0,0,1)';
  const sorted = stops.slice().sort((a, b) => a.at - b.at);
  if (t <= sorted[0].at) {
    const c = parseRGBA(sorted[0].color);
    const a = (sorted[0].opacity ?? 1) * c[3];
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  if (t >= sorted[sorted.length - 1].at) {
    const c = parseRGBA(sorted[sorted.length - 1].color);
    const a = (sorted[sorted.length - 1].opacity ?? 1) * c[3];
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].at >= t) {
      const a0 = sorted[i - 1], a1 = sorted[i];
      const u = (t - a0.at) / Math.max(1e-6, a1.at - a0.at);
      const c0 = parseRGBA(a0.color), c1 = parseRGBA(a1.color);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
      const op0 = (a0.opacity ?? 1) * c0[3];
      const op1 = (a1.opacity ?? 1) * c1[3];
      const op  = op0 + (op1 - op0) * u;
      return `rgba(${r},${g},${b},${op})`;
    }
  }
  return 'rgba(0,0,0,1)';
}

// Paint a stroke that follows the path direction — colour at arc-length
// fraction t comes from the gradient stops. Implemented by walking the
// path in ~2-px arc-length steps and stroking each tiny line segment with
// the sampled colour. Supports compound paths (each subpath strokes
// independently). Cap/join settings are inherited from `stroke`.
function strokeGradientAlong(ctx, paperPath, stroke, dx, dy) {
  const stops = stroke.stops || [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }];
  const lineWidth = stroke.width || 1;
  const cap = stroke.cap || 'butt';
  const join = stroke.join || 'miter';
  ctx.save();
  ctx.lineCap = cap;
  ctx.lineJoin = join;
  ctx.lineWidth = lineWidth;
  if (stroke.dash && stroke.dash.length) ctx.setLineDash(stroke.dash);
  const subs = paperPath.children && paperPath.children.length ? paperPath.children : [paperPath];
  for (const sub of subs) {
    if (!sub.segments || sub.segments.length < 2) continue;
    const len = sub.length;
    if (!(len > 0)) continue;
    const stepPx = 2;  // arc-length step in pixels
    const steps = Math.max(2, Math.ceil(len / stepPx));
    let prev = sub.getPointAt(0);
    for (let i = 1; i <= steps; i++) {
      const offset = (i / steps) * len;
      const pt = sub.getPointAt(Math.min(offset, len));
      if (!pt) continue;
      const t = i / steps;
      ctx.strokeStyle = sampleGradient(stops, t);
      ctx.beginPath();
      ctx.moveTo(prev.x + dx, prev.y + dy);
      ctx.lineTo(pt.x + dx, pt.y + dy);
      ctx.stroke();
      prev = pt;
    }
  }
  ctx.restore();
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
  // pathBounds + pad so the renderer can call image.position(...) without
  // `undefined` crashes — the symptom of the bug we used to ship: TypeError
  // reading 'x' on initial shape draw.
  const empty = () => ({
    imageData: new ImageData(1, 1),
    naturalSize: { w: 1, h: 1 },
    pathBounds: { x: 0, y: 0, width: 1, height: 1 },
    pad: PAD,
  });
  if (!recs.length) return empty();

  const b = computeBounds(recs);
  if (b.width <= 0 || b.height <= 0) return empty();
  const pad = PAD;
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
      const isAlong = rec.stroke.type === 'gradient' && rec.stroke.alongPath;
      if (isAlong) {
        // Gradient sampled along arc-length: tiny line segments coloured
        // by the stops at their offset. widthScale clipping still applies.
        const lw = (rec.stroke.width || 1) * widthScale;
        strokeGradientAlong(ctx, p, { ...rec.stroke, width: lw }, dx, dy);
      } else {
        // Now draw the stroke as a fresh path so the clip is applied correctly.
        tracePathToCtx(ctx, p, dx, dy);
        if (applyStroke(ctx, rec.stroke, localBounds)) {
          if (widthScale !== 1) ctx.lineWidth *= widthScale;
          ctx.stroke();
        }
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
  return {
    imageData,
    naturalSize: { w, h },
    pathBounds,
    pad,
  };
}
