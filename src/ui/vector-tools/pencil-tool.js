// pencil-tool — freehand drawing.
//
// Mousedown begins sampling. Mousemove samples points (~every 4 px in screen
// space) and renders a live Konva polyline on a rubber layer — NO doc model
// updates, NO rasterise — so the stroke feels instant regardless of length
// or layer effects. Mouseup hydrates the samples as a Paper.Path, runs
// path.simplify(tolerance), and emits ONE doc.setVectorPath/addVectorLayer
// to commit.
//
// Tolerance comes from a slider in the footer (visible only when the
// pencil tool is active). Higher tolerance = fewer anchors = smoother.
// Persisted to localStorage so the user's preference survives reloads.
//
// Auto-close: if the user releases within 8 px (screen space) of the
// path's first sample point, the resulting path is set closed = true.

import Konva from 'konva';
import { DEFAULT_VECTOR_STROKE } from '../../core/layer.js';
import { getTool } from './active-tool.js';
import { computePathBounds } from '../../core/vector-renderer.js';
import { paper, activatePaper } from '../../core/paper-context.js';

const SMOOTH_KEY = 'slammer:pencilSmoothness';

export function getPencilSmoothness() {
  const stored = parseFloat(localStorage.getItem(SMOOTH_KEY));
  return Number.isFinite(stored) ? stored : 2.5;
}
export function setPencilSmoothness(v) {
  const clamped = Math.max(0, Math.min(10, v));
  try { localStorage.setItem(SMOOTH_KEY, String(clamped)); } catch {}
}

function accentColor() {
  return getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';
}

function freshStrokeStyle() {
  return { ...DEFAULT_VECTOR_STROKE(), type: 'solid', color: accentColor(), width: 2 };
}

export function attachPencilTool({ stage, document: doc }) {
  const state = {
    drawing: false,
    samples: [],          // world-space [{x, y}]
    rubberLayer: null,
    rubberLine: null,
  };

  function worldXY() {
    const stagePos = stage.getPointerPosition();
    if (!stagePos) return { x: 0, y: 0 };
    const sc = stage.scaleX() || 1;
    return { x: (stagePos.x - stage.x()) / sc, y: (stagePos.y - stage.y()) / sc };
  }

  function screenDist(a, b) {
    const sc = stage.scaleX() || 1;
    return Math.hypot((a.x - b.x) * sc, (a.y - b.y) * sc);
  }

  function ensureRubber() {
    if (state.rubberLayer) return;
    state.rubberLayer = new Konva.Layer({ listening: false });
    stage.add(state.rubberLayer);
    state.rubberLine = new Konva.Line({
      points: [],
      stroke: accentColor(),
      strokeWidth: 2,
      strokeScaleEnabled: false,
      lineCap: 'round',
      lineJoin: 'round',
      listening: false,
    });
    state.rubberLayer.add(state.rubberLine);
  }

  function clearRubber() {
    if (!state.rubberLayer) return;
    state.rubberLayer.destroy();
    state.rubberLayer = null;
    state.rubberLine = null;
  }

  function flatPoints() {
    const out = new Array(state.samples.length * 2);
    for (let i = 0; i < state.samples.length; i++) {
      out[i * 2]     = state.samples[i].x;
      out[i * 2 + 1] = state.samples[i].y;
    }
    return out;
  }

  function start() {
    if (getTool() !== 'pencil') return false;
    state.samples = [worldXY()];
    state.drawing = true;
    ensureRubber();
    state.rubberLine.points(flatPoints());
    state.rubberLayer.batchDraw();
    return true;
  }

  function move() {
    if (!state.drawing) return;
    const pt = worldXY();
    const last = state.samples[state.samples.length - 1];
    if (screenDist(last, pt) < 4) return;  // ~4 px screen-space sample spacing
    state.samples.push(pt);
    state.rubberLine.points(flatPoints());
    state.rubberLayer.batchDraw();
  }

  function end() {
    if (!state.drawing) return;
    const samples = state.samples;
    state.drawing = false;
    state.samples = [];
    clearRubber();

    if (samples.length < 2) return;  // a tap without drag — drop it.

    // Auto-close if release is within 8 px of the start sample.
    const first = samples[0];
    const lastPt = samples[samples.length - 1];
    const closed = screenDist(first, lastPt) <= 8 && samples.length >= 4;

    // Hydrate as Paper.Path, run simplify(tolerance), extract pathData.
    activatePaper();
    const tolerance = 0.5 + getPencilSmoothness() * 0.55; // 0..10 → ~0.5..6
    const p = new paper.Path({
      segments: samples.map((s) => new paper.Point(s.x, s.y)),
      closed,
    });
    try { p.simplify(tolerance); } catch {}
    const newD = p.pathData;
    p.remove();

    if (!newD) return;

    // Commit ONCE — append to active vector layer or create a new one.
    let layer = doc.activeLayer;
    const newRec = {
      d: newD,
      closed,
      fill: { type: 'none' },
      stroke: freshStrokeStyle(),
    };
    if (layer && layer.type === 'vector') {
      const next = layer.vector.paths.slice();
      next.push(newRec);
      doc.setVectorPaths(layer.id, next);
    } else {
      layer = doc.addVectorLayer({
        name: 'Pencil path',
        vector: { paths: [newRec] },
      });
      // Anchor the layer at the path's bbox top-left in world.
      const b = computePathBounds([newRec]);
      if (b.width > 0 || b.height > 0) {
        doc.setLayerTransform(layer.id, { x: b.x, y: b.y });
      }
    }
  }

  function cancel() {
    state.drawing = false;
    state.samples = [];
    clearRubber();
  }

  return {
    start, move, end, cancel,
    isDrawing: () => state.drawing,
  };
}
