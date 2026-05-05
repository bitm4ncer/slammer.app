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
import { computeBounds } from '../../core/vector-renderer.js';

// The vector renderer pads its output canvas by this much for blur safety.
// We must offset layer.transform by the same amount so the rendered pixels
// land at the world coords the user actually drew at.
const RASTER_PAD = 16;

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
    const layer = doc.addVectorLayer({
      name: niceName(kind),
      vector: {
        paths: [{
          d, closed: kind !== 'line',
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
    doc.setVectorPath(active.layerId, 0, { d });
    syncLayerTransform();
    return true;
  }

  // Path coords are stored in WORLD space (where the user drew). The
  // rasteriser produces a canvas of (b.width + 2*pad) × (b.height + 2*pad)
  // where `b` is the stroke-expanded bbox; the path interior renders at
  // canvas (pad - b.x + path.x, …). To make the rendered pixels appear at
  // the world coords the user actually drew we set the layer transform so
  // the canvas's pad-shifted origin lands on b.x / b.y.
  function syncLayerTransform() {
    if (!active) return;
    const layer = doc.findLayer(active.layerId);
    if (!layer) return;
    const b = computeBounds(layer.vector.paths);
    if (!(b.width > 0) || !(b.height > 0)) return;
    doc.setLayerTransform(active.layerId, {
      x: b.x - RASTER_PAD,
      y: b.y - RASTER_PAD,
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
    // Treat start as centre — bbox is 2× drag distance.
    x = start.x - w; y = start.y - h;
    w *= 2; h *= 2;
  }

  switch (kind) {
    case 'rect':
      return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;

    case 'ellipse':
      return ellipsePathD(x, y, w, h);

    case 'polygon': {
      // Default 6 sides; shift = perfect (radius = max axis).
      const sides = 6;
      const cx = alt ? start.x : x + w / 2;
      const cy = alt ? start.y : y + h / 2;
      const r  = (alt || shift) ? Math.max(w, h) / 2 : Math.min(w, h) / 2;
      return polygonD(cx, cy, r, sides, -Math.PI / 2);
    }

    case 'star': {
      const points = 5;
      const cx = alt ? start.x : x + w / 2;
      const cy = alt ? start.y : y + h / 2;
      const rOuter = (alt || shift) ? Math.max(w, h) / 2 : Math.min(w, h) / 2;
      const rInner = rOuter * 0.42;
      return starD(cx, cy, rOuter, rInner, points, -Math.PI / 2);
    }

    case 'line': {
      let ex = cur.x, ey = cur.y;
      if (shift) {
        // Snap to 0/45/90 degrees.
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
