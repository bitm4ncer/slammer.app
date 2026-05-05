// pencil-tool — freehand drawing.
//
// Mousedown begins a polyline. Mousemove samples points (~every 4 px in
// screen space). Mouseup hydrates the polyline as a Paper.Path and runs
// path.simplify(tolerance) to convert it to a smooth bezier path.
//
// Tolerance comes from a slider in the footer (visible only when the
// pencil tool is active). Higher tolerance = fewer anchors = smoother.
// Persisted to localStorage so the user's preference survives reloads.
//
// Auto-close: if the user releases within 8 px (screen space) of the
// path's first sample point, the resulting path is set closed = true.

import paper from 'paper';
import { DEFAULT_VECTOR_STROKE } from '../../core/layer.js';
import { getTool } from './active-tool.js';
import { computePathBounds } from '../../core/vector-renderer.js';

const SMOOTH_KEY = 'slammer:pencilSmoothness';
let _paperReady = false;

function ensurePaper() {
  if (_paperReady) return;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  paper.setup(c);
  _paperReady = true;
}
function activatePaper() {
  if (!_paperReady) { ensurePaper(); return; }
  if (paper.project) paper.project.activate();
}

export function getPencilSmoothness() {
  const stored = parseFloat(localStorage.getItem(SMOOTH_KEY));
  return Number.isFinite(stored) ? stored : 2.5;
}
export function setPencilSmoothness(v) {
  const clamped = Math.max(0, Math.min(10, v));
  try { localStorage.setItem(SMOOTH_KEY, String(clamped)); } catch {}
}

function freshStrokeStyle() {
  const accent = getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';
  return { ...DEFAULT_VECTOR_STROKE(), type: 'solid', color: accent, width: 2 };
}

export function attachPencilTool({ stage, document: doc }) {
  const state = {
    drawing: false,
    layerId: null,
    pathIdx: null,
    samples: [],   // path-local world coords [{x, y}]
  };

  function worldXY(e) {
    const stagePos = stage.getPointerPosition();
    if (!stagePos) return { x: 0, y: 0 };
    const sc = stage.scaleX() || 1;
    return { x: (stagePos.x - stage.x()) / sc, y: (stagePos.y - stage.y()) / sc };
  }

  function screenDist(a, b) {
    const sc = stage.scaleX() || 1;
    return Math.hypot((a.x - b.x) * sc, (a.y - b.y) * sc);
  }

  function syncCenterTransform(layerId) {
    const layer = doc.findLayer(layerId);
    if (!layer) return;
    const b = computePathBounds(layer.vector.paths);
    if (b.width <= 0 || b.height <= 0) return;
    doc.setLayerTransform(layerId, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }

  function samplesToD(samples, closed) {
    if (!samples.length) return '';
    const parts = samples.map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.x.toFixed(2)} ${s.y.toFixed(2)}`);
    if (closed) parts.push('Z');
    return parts.join(' ');
  }

  function start(e) {
    if (getTool() !== 'pencil') return false;
    const pt = worldXY(e);
    state.samples = [pt];
    // Same routing convention as pen — extend active vector layer or create new.
    let layer = doc.activeLayer;
    if (layer && layer.type === 'vector') {
      const next = layer.vector.paths.slice();
      next.push({
        d: samplesToD(state.samples, false),
        closed: false,
        fill: { type: 'none' },
        stroke: freshStrokeStyle(),
      });
      doc.setVectorPaths(layer.id, next);
      state.pathIdx = layer.vector.paths.length - 1;
    } else {
      layer = doc.addVectorLayer({
        name: 'Pencil path',
        vector: {
          paths: [{
            d: samplesToD(state.samples, false),
            closed: false,
            fill: { type: 'none' },
            stroke: freshStrokeStyle(),
          }],
        },
      });
      state.pathIdx = 0;
    }
    state.layerId = layer.id;
    state.drawing = true;
    syncCenterTransform(layer.id);
    return true;
  }

  function move(e) {
    if (!state.drawing) return;
    const pt = worldXY(e);
    const last = state.samples[state.samples.length - 1];
    if (screenDist(last, pt) < 4) return;  // ~4 px screen-space sample spacing
    state.samples.push(pt);
    // Live polyline preview while dragging — cheap rewrite of d each tick.
    doc.setVectorPath(state.layerId, state.pathIdx, { d: samplesToD(state.samples, false) });
    syncCenterTransform(state.layerId);
  }

  function end() {
    if (!state.drawing) return;
    if (state.samples.length < 2) {
      // Treat as a no-op — drop the empty path (and layer if it's the only one).
      const layer = doc.findLayer(state.layerId);
      if (layer) {
        if (layer.vector.paths.length === 1) doc.removeLayer(layer.id);
        else {
          const next = layer.vector.paths.slice();
          next.splice(state.pathIdx, 1);
          doc.setVectorPaths(layer.id, next);
        }
      }
      reset();
      return;
    }
    // Auto-close if release is within 8 px of the start sample.
    const first = state.samples[0];
    const lastPt = state.samples[state.samples.length - 1];
    const closed = screenDist(first, lastPt) <= 8 && state.samples.length >= 4;

    // Hydrate as Paper.Path, run simplify(tolerance), extract pathData.
    activatePaper();
    const tolerance = 0.5 + getPencilSmoothness() * 0.55; // 0..10 → ~0.5..6
    const p = new paper.Path({
      segments: state.samples.map((s) => new paper.Point(s.x, s.y)),
      closed,
    });
    try { p.simplify(tolerance); } catch {}
    const newD = p.pathData;
    p.remove();

    doc.setVectorPath(state.layerId, state.pathIdx, { d: newD, closed });
    syncCenterTransform(state.layerId);
    reset();
  }

  function reset() {
    state.drawing = false;
    state.layerId = null;
    state.pathIdx = null;
    state.samples = [];
  }

  return {
    start, move, end,
    cancel: end,    // pointer left container = treat as commit
    isDrawing: () => state.drawing,
  };
}
