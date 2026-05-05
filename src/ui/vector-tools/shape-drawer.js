// shape-drawer — translates a Shape-tool drag on the canvas into a new
// vector layer with a single primitive path.
//
// Modifiers:
//   Shift = constrain (square / circle / equal-sided polygon / 45° line)
//   Alt   = draw from center (start point becomes the centre, drag = radius/half-extent)
//
// The actual SVG path d-string is built here so the renderer + project
// file stay format-agnostic. Paper.js is only invoked for parsing/rendering.

import { DEFAULT_VECTOR_FILL, DEFAULT_VECTOR_STROKE } from '../../core/layer.js';
import { getTool } from './active-tool.js';
import { computePathBounds } from '../../core/vector-renderer.js';

let active = null;

export function attachShapeDrawer({ stage, document: doc, getStageScale }) {
  // Helper: convert a stage-pointer event to world (layer) coords.
  function worldXY(e) {
    const stagePos = stage.getPointerPosition();
    if (!stagePos) return { x: 0, y: 0 };
    const scale = getStageScale();
    const ox = stage.x();
    const oy = stage.y();
    return { x: (stagePos.x - ox) / scale, y: (stagePos.y - oy) / scale };
  }

  function start(e) {
    const tool = getTool();
    if (!tool.startsWith('shape:')) return false;
    const kind = tool.slice('shape:'.length);
    const start = worldXY(e);
    active = {
      kind,
      start,
      cur: { ...start },
      shift: !!(e.evt && e.evt.shiftKey),
      alt: !!(e.evt && e.evt.altKey),
      layerId: null,
    };
    // Create the layer up-front with a placeholder path; we update on every move.
    const d = buildPathD(active);
    const shapeMeta = makeShapeMeta(active);
    const layer = doc.addVectorLayer({
      name: niceName(kind),
      vector: {
        paths: [{
          d, closed: kind !== 'line',
          shape: shapeMeta,
          fill: kind === 'line' ? { type: 'none' } : DEFAULT_VECTOR_FILL(),
          stroke: kind === 'line'
            ? { ...DEFAULT_VECTOR_STROKE(), type: 'solid' }
            : DEFAULT_VECTOR_STROKE(),
        }],
      },
    });
    active.layerId = layer.id;
    syncLayerTransform();
    return true;
  }

  function move(e) {
    if (!active) return false;
    active.cur = worldXY(e);
    active.shift = !!(e.evt && e.evt.shiftKey);
    active.alt = !!(e.evt && e.evt.altKey);
    const d = buildPathD(active);
    const shape = makeShapeMeta(active);
    doc.setVectorPath(active.layerId, 0, { d, shape });
    syncLayerTransform();
    return true;
  }

  // Vector layers use a CENTRE-origin convention so rotation / scale via
  // the transformer pivot around the shape's geometric centre. The renderer
  // sets group.offset = (w/2, h/2); we set group.x/y (= transform.x/y) to
  // the shape's centre in world coords.
  function syncLayerTransform() {
    if (!active) return;
    const layer = doc.findLayer(active.layerId);
    if (!layer) return;
    const b = computePathBounds(layer.vector.paths);
    if (!(b.width > 0) || !(b.height > 0)) return;
    doc.setLayerTransform(active.layerId, {
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
    });
  }

  function end() {
    if (!active) return false;
    // If the drag was zero-distance, remove the empty layer.
    const dx = Math.abs(active.cur.x - active.start.x);
    const dy = Math.abs(active.cur.y - active.start.y);
    if (dx < 2 && dy < 2) {
      doc.removeLayer(active.layerId);
    }
    active = null;
    return true;
  }

  function cancel() {
    if (!active) return;
    doc.removeLayer(active.layerId);
    active = null;
  }

  return { start, move, end, cancel };
}

function niceName(kind) {
  return ({ rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line' })[kind] || 'Shape';
}

function buildPathD(state) {
  const { kind, start, cur, shift, alt } = state;

  // Rect bounds, optionally constrained / from-center.
  let x = Math.min(start.x, cur.x);
  let y = Math.min(start.y, cur.y);
  let w = Math.abs(cur.x - start.x);
  let h = Math.abs(cur.y - start.y);

  if (shift && (kind === 'rect' || kind === 'ellipse')) {
    const s = Math.max(w, h);
    if (cur.x < start.x) x = start.x - s; else x = start.x;
    if (cur.y < start.y) y = start.y - s; else y = start.y;
    w = s; h = s;
  }
  if (alt && (kind === 'rect' || kind === 'ellipse' || kind === 'polygon' || kind === 'star')) {
    x = start.x - w; y = start.y - h;
    w *= 2; h *= 2;
  }

  switch (kind) {
    case 'rect':    return rectD(x, y, w, h);
    case 'ellipse': return ellipsePathD(x, y, w, h);
    case 'polygon': {
      const cx = alt ? start.x : x + w / 2;
      const cy = alt ? start.y : y + h / 2;
      const r  = (alt || shift) ? Math.max(w, h) / 2 : Math.min(w, h) / 2;
      return polygonD(cx, cy, r, 6, -Math.PI / 2);
    }
    case 'star': {
      const cx = alt ? start.x : x + w / 2;
      const cy = alt ? start.y : y + h / 2;
      const rOuter = (alt || shift) ? Math.max(w, h) / 2 : Math.min(w, h) / 2;
      return starD(cx, cy, rOuter, rOuter * 0.42, 5, -Math.PI / 2);
    }
    case 'line': {
      let ex = cur.x, ey = cur.y;
      if (shift) {
        const ang = Math.atan2(ey - start.y, ex - start.x);
        const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(ex - start.x, ey - start.y);
        ex = start.x + Math.cos(snap) * len;
        ey = start.y + Math.sin(snap) * len;
      }
      return `M ${start.x} ${start.y} L ${ex} ${ey}`;
    }
    default:
      return `M ${x} ${y} L ${x + w} ${y + h}`;
  }
}

// Re-generate a path's d-string from its parametric `shape` record. Falls
// back to the supplied bounds when the shape doesn't carry its own
// geometry (older paths created before we stored cx/cy/r).
//
// Polygons + stars store cx/cy/r so changing sides preserves the
// circumscribing circle (the user-drawn outer dimensions). Rectangles
// regenerate from bounds + cornerRadius.
export function rebuildShapePathD(shape, bounds) {
  if (!shape) return null;
  switch (shape.kind) {
    case 'rect': {
      const b = (bounds && bounds.width > 0) ? bounds : { x: 0, y: 0, width: 100, height: 100 };
      return rectD(b.x, b.y, b.width, b.height, shape.cornerRadius || 0);
    }
    case 'ellipse': {
      const b = (bounds && bounds.width > 0) ? bounds : { x: 0, y: 0, width: 100, height: 100 };
      return ellipsePathD(b.x, b.y, b.width, b.height);
    }
    case 'polygon': {
      const cx = shape.cx ?? (bounds ? bounds.x + bounds.width / 2 : 0);
      const cy = shape.cy ?? (bounds ? bounds.y + bounds.height / 2 : 0);
      const r  = shape.r  ?? (bounds ? Math.min(bounds.width, bounds.height) / 2 : 50);
      return polygonD(cx, cy, r, Math.max(3, (shape.sides | 0) || 6), -Math.PI / 2);
    }
    case 'star': {
      const cx = shape.cx ?? (bounds ? bounds.x + bounds.width / 2 : 0);
      const cy = shape.cy ?? (bounds ? bounds.y + bounds.height / 2 : 0);
      const r  = shape.r  ?? (bounds ? Math.min(bounds.width, bounds.height) / 2 : 50);
      const points = Math.max(3, (shape.points | 0) || 5);
      const inner = Math.max(0.05, Math.min(0.95, shape.innerRatio || 0.42));
      return starD(cx, cy, r, r * inner, points, -Math.PI / 2);
    }
    default: return null;
  }
}

// Build the shape metadata record from the in-progress drag state. Captures
// cx/cy/r for polygon/star so the panel can later regen at the same outer
// size when the user changes sides/points.
function makeShapeMeta(state) {
  const { kind, start, cur, shift, alt } = state;
  if (kind === 'rect')    return { kind: 'rect', cornerRadius: 0 };
  if (kind === 'ellipse') return { kind: 'ellipse' };
  if (kind === 'line')    return { kind: 'line' };
  if (kind === 'polygon' || kind === 'star') {
    let x = Math.min(start.x, cur.x);
    let y = Math.min(start.y, cur.y);
    let w = Math.abs(cur.x - start.x);
    let h = Math.abs(cur.y - start.y);
    if (alt) { x = start.x - w; y = start.y - h; w *= 2; h *= 2; }
    const cx = alt ? start.x : x + w / 2;
    const cy = alt ? start.y : y + h / 2;
    const r  = (alt || shift) ? Math.max(w, h) / 2 : Math.min(w, h) / 2;
    if (kind === 'polygon') return { kind: 'polygon', sides: 6, cx, cy, r };
    if (kind === 'star')    return { kind: 'star', points: 5, innerRatio: 0.42, cx, cy, r };
  }
  return null;
}

function rectD(x, y, w, h, cr = 0) {
  if (cr <= 0) {
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  const r = Math.min(cr, w / 2, h / 2);
  // SVG arc-curve rounded rect.
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

// Cubic-bezier ellipse approximation (4 segments, kappa = 0.5522847…)
function ellipsePathD(x, y, w, h) {
  const k = 0.5522847498307936;
  const rx = w / 2, ry = h / 2;
  const cx = x + rx, cy = y + ry;
  const ox = rx * k, oy = ry * k;
  return [
    `M ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - oy}, ${cx - ox} ${cy - ry}, ${cx} ${cy - ry}`,
    `C ${cx + ox} ${cy - ry}, ${cx + rx} ${cy - oy}, ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy + oy}, ${cx + ox} ${cy + ry}, ${cx} ${cy + ry}`,
    `C ${cx - ox} ${cy + ry}, ${cx - rx} ${cy + oy}, ${cx - rx} ${cy}`,
    'Z',
  ].join(' ');
}

function polygonD(cx, cy, r, sides, startAngle = 0) {
  const parts = [];
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    parts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function starD(cx, cy, ro, ri, points, startAngle = 0) {
  const total = points * 2;
  const parts = [];
  for (let i = 0; i < total; i++) {
    const a = startAngle + (i / total) * Math.PI * 2;
    const r = i % 2 === 0 ? ro : ri;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    parts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  parts.push('Z');
  return parts.join(' ');
}
