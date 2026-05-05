// pen-tool — bezier path drawing.
//
// Gestures:
//   click           → corner anchor at the click point
//   click + drag    → smooth anchor; drag direction sets handleOut, mirrored
//                     to handleIn so the curve enters + exits symmetrically
//   click first     → close path (8 px screen-space hit zone)
//   Enter           → close path
//   Esc             → leave path open (in-progress anchors are kept)
//   tool-switch     → leave path open + drop pen state
//
// Layer routing — extends the active vector layer's last path. If the
// last path is closed (or there's no active vector layer) a new path is
// added; if there's no vector layer at all, one is created.

import Konva from 'konva';
import { DEFAULT_VECTOR_STROKE } from '../../core/layer.js';
import { getTool, onToolChange } from './active-tool.js';
import { computePathBounds } from '../../core/vector-renderer.js';
import { paper, activatePaper } from '../../core/paper-context.js';

// Default style for a freshly-created Pen path: stroke only, accent colour.
function freshStrokeStyle() {
  const accent = getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';
  return { ...DEFAULT_VECTOR_STROKE(), type: 'solid', color: accent, width: 2 };
}

export function attachPenTool({ stage, document: doc }) {
  const state = {
    drawing: false,
    layerId: null,
    pathIdx: null,
    rubberLayer: null,   // Konva.Layer for rubber-band line
    rubberLine: null,
    pressDownPos: null,  // for detecting click-vs-drag
    pressDownAnchorIdx: null,
    pressedHandleAnchorIdx: null,
  };

  function worldXY(e) {
    const stagePos = stage.getPointerPosition();
    if (!stagePos) return { x: 0, y: 0 };
    const sc = stage.scaleX() || 1;
    return { x: (stagePos.x - stage.x()) / sc, y: (stagePos.y - stage.y()) / sc };
  }

  function ensureRubber() {
    if (state.rubberLayer) return;
    state.rubberLayer = new Konva.Layer({ listening: false });
    stage.add(state.rubberLayer);
    state.rubberLine = new Konva.Line({
      points: [],
      stroke: getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c',
      strokeWidth: 1,
      strokeScaleEnabled: false,
      dash: [4, 4],
      listening: false,
    });
    state.rubberLayer.add(state.rubberLine);
    // Group for anchor-handle previews — repopulated each tick.
    state.handleGroup = new Konva.Group({ listening: false });
    state.rubberLayer.add(state.handleGroup);
  }
  function clearRubber() {
    if (!state.rubberLayer) return;
    state.rubberLayer.destroy();
    state.rubberLayer = null;
    state.rubberLine = null;
    state.handleGroup = null;
  }
  // Render the in-progress path's anchors + bezier tangents on the rubber
  // layer so the user can SEE what they're building (matches Affinity / AI
  // pen-tool feedback).
  function renderHandles() {
    if (!state.handleGroup) return;
    state.handleGroup.destroyChildren();
    const layer = doc.findLayer(state.layerId);
    if (!layer) { state.rubberLayer.batchDraw(); return; }
    const segs = dToSegments(layer.vector.paths[state.pathIdx].d);
    const accent = getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      // Tangent lines + dots
      if (s.hi && (s.hi.x || s.hi.y)) {
        state.handleGroup.add(new Konva.Line({
          points: [s.x, s.y, s.x + s.hi.x, s.y + s.hi.y],
          stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, opacity: 0.55, listening: false,
        }));
        state.handleGroup.add(new Konva.Circle({
          x: s.x + s.hi.x, y: s.y + s.hi.y,
          radius: 3.5, fill: '#fff', stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, listening: false,
        }));
      }
      if (s.ho && (s.ho.x || s.ho.y)) {
        state.handleGroup.add(new Konva.Line({
          points: [s.x, s.y, s.x + s.ho.x, s.y + s.ho.y],
          stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, opacity: 0.55, listening: false,
        }));
        state.handleGroup.add(new Konva.Circle({
          x: s.x + s.ho.x, y: s.y + s.ho.y,
          radius: 3.5, fill: '#fff', stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, listening: false,
        }));
      }
      // Anchor square (white-fill / dark-stroke). The first anchor is a
      // smidge bigger so the user can target it for the close-path click.
      const isFirst = i === 0;
      const half = isFirst ? 4.5 : 3.5;
      state.handleGroup.add(new Konva.Rect({
        x: s.x - half, y: s.y - half,
        width: half * 2, height: half * 2,
        fill: isFirst ? accent : '#fff',
        stroke: '#0a0a0a', strokeWidth: 1, strokeScaleEnabled: false,
        listening: false,
      }));
    }
    state.rubberLayer.batchDraw();
  }

  // Pick (or create) the layer + path index where new anchors will land.
  // Returns { layer, pathIdx, freshLayer }.
  function routeOrCreateLayer() {
    let layer = doc.activeLayer;
    let pathIdx = null;
    let freshLayer = false;
    if (layer && layer.type === 'vector' && layer.vector?.paths?.length) {
      const lastIdx = layer.vector.paths.length - 1;
      const last = layer.vector.paths[lastIdx];
      if (last && last.closed === false) {
        // Append to the open path on this layer.
        pathIdx = lastIdx;
      } else {
        // Last path closed (or no marker) — start a new path on this layer.
        const newRec = {
          d: '',
          closed: false,
          fill: { type: 'none' },
          stroke: freshStrokeStyle(),
        };
        const next = layer.vector.paths.slice();
        next.push(newRec);
        doc.setVectorPaths(layer.id, next);
        pathIdx = layer.vector.paths.length - 1;
      }
    } else {
      // No vector layer active — create one.
      layer = doc.addVectorLayer({
        name: 'Pen path',
        vector: {
          paths: [{
            d: '',
            closed: false,
            fill: { type: 'none' },
            stroke: freshStrokeStyle(),
          }],
        },
      });
      pathIdx = 0;
      freshLayer = true;
    }
    return { layer, pathIdx, freshLayer };
  }

  // Build the d-string from an array of segments.
  // Each segment: { x, y, hi: {x, y} | null, ho: {x, y} | null }
  function segmentsToD(segs, closed) {
    if (!segs.length) return '';
    activatePaper();
    const p = new paper.Path({
      segments: segs.map((s) => new paper.Segment(
        new paper.Point(s.x, s.y),
        s.hi ? new paper.Point(s.hi.x, s.hi.y) : null,
        s.ho ? new paper.Point(s.ho.x, s.ho.y) : null,
      )),
      closed,
    });
    const d = p.pathData;
    p.remove();
    return d;
  }

  // Hydrate a record's d-string back into [{x, y, hi, ho}, ...] for editing.
  function dToSegments(d) {
    if (!d) return [];
    activatePaper();
    const p = new paper.CompoundPath({ pathData: d });
    const subs = p.children && p.children.length ? p.children : [p];
    const segs = [];
    for (const sub of subs) {
      for (const s of sub.segments || []) {
        segs.push({
          x: s.point.x, y: s.point.y,
          hi: (s.handleIn && (s.handleIn.x || s.handleIn.y)) ? { x: s.handleIn.x, y: s.handleIn.y } : null,
          ho: (s.handleOut && (s.handleOut.x || s.handleOut.y)) ? { x: s.handleOut.x, y: s.handleOut.y } : null,
        });
      }
    }
    p.remove();
    return segs;
  }

  // Top-left origin: layer.transform.x/y is the path bbox top-left in
  // world space. Set on first anchor; never recomputed after that — the
  // renderer's image.position handles bounds shifts.
  function setInitialTransform(layerId) {
    const layer = doc.findLayer(layerId);
    if (!layer) return;
    const b = computePathBounds(layer.vector.paths);
    if (b.width <= 0 && b.height <= 0) {
      // Single-point — anchor at the path's first point.
      const seg0 = (layer.vector.paths[state.pathIdx]?.d || '').match(/M\s*(-?[\d.]+)\s*(-?[\d.]+)/);
      if (seg0) doc.setLayerTransform(layerId, { x: parseFloat(seg0[1]), y: parseFloat(seg0[2]) });
      return;
    }
    doc.setLayerTransform(layerId, { x: b.x, y: b.y });
  }

  // Distance in screen pixels (for hit-zone tests like "click first anchor").
  function screenDist(a, b) {
    const sc = stage.scaleX() || 1;
    return Math.hypot((a.x - b.x) * sc, (a.y - b.y) * sc);
  }

  // ---------- Pointer handlers ----------

  function start(e) {
    if (getTool() !== 'pen') return false;
    const pt = worldXY(e);
    if (!state.drawing) {
      // First anchor — set up the layer + path.
      const { layer, pathIdx } = routeOrCreateLayer();
      state.drawing = true;
      state.layerId = layer.id;
      state.pathIdx = pathIdx;
      const segs = dToSegments(layer.vector.paths[pathIdx].d);
      segs.push({ x: pt.x, y: pt.y, hi: null, ho: null });
      doc.setVectorPath(layer.id, pathIdx, { d: segmentsToD(segs, false) });
      setInitialTransform(layer.id);
      renderHandles();
      ensureRubber();
      state.pressDownPos = pt;
      state.pressedHandleAnchorIdx = segs.length - 1;
      return true;
    }
    // Subsequent anchor.
    const layer = doc.findLayer(state.layerId);
    if (!layer) { reset(); return false; }
    const segs = dToSegments(layer.vector.paths[state.pathIdx].d);
    // Close detection — click within 8 px of the first anchor.
    if (segs.length >= 2) {
      const first = segs[0];
      if (screenDist(first, pt) <= 8) {
        finishClose();
        return true;
      }
    }
    segs.push({ x: pt.x, y: pt.y, hi: null, ho: null });
    doc.setVectorPath(layer.id, state.pathIdx, { d: segmentsToD(segs, false) });
    // Don't recompute transform here — it stays at the layer's creation
    // anchor point so subsequent anchors stay visually put.
    state.pressDownPos = pt;
    state.pressedHandleAnchorIdx = segs.length - 1;
    renderHandles();
    return true;
  }

  function move(e) {
    if (getTool() !== 'pen') return;
    const pt = worldXY(e);
    // If a pointer is pressed (we're potentially building handles for the
    // most-recent anchor) and the user has dragged > 3 px, write handles in.
    if (state.pressDownPos && state.pressedHandleAnchorIdx != null) {
      const dx = pt.x - state.pressDownPos.x;
      const dy = pt.y - state.pressDownPos.y;
      if (Math.hypot(dx, dy) > 3) {
        const layer = doc.findLayer(state.layerId);
        if (layer) {
          const segs = dToSegments(layer.vector.paths[state.pathIdx].d);
          const i = state.pressedHandleAnchorIdx;
          if (segs[i]) {
            segs[i].ho = { x: dx, y: dy };
            segs[i].hi = { x: -dx, y: -dy };
            doc.setVectorPath(layer.id, state.pathIdx, { d: segmentsToD(segs, false) });
            renderHandles();
          }
        }
      }
      if (state.rubberLine) state.rubberLine.points([]);
      if (state.rubberLayer) state.rubberLayer.batchDraw();
      return;
    }
    // Otherwise update the rubber band.
    if (!state.drawing || !state.rubberLine) return;
    const layer = doc.findLayer(state.layerId);
    if (!layer) return;
    const segs = dToSegments(layer.vector.paths[state.pathIdx].d);
    if (!segs.length) return;
    const last = segs[segs.length - 1];
    state.rubberLine.points([last.x, last.y, pt.x, pt.y]);
    state.rubberLayer.batchDraw();
  }

  function up() {
    state.pressDownPos = null;
    state.pressedHandleAnchorIdx = null;
  }

  function finishClose() {
    if (!state.drawing) return;
    const layer = doc.findLayer(state.layerId);
    if (!layer) { reset(); return; }
    const segs = dToSegments(layer.vector.paths[state.pathIdx].d);
    doc.setVectorPath(layer.id, state.pathIdx, { d: segmentsToD(segs, true), closed: true });
    reset();
  }

  function finishOpen() {
    // Path stays open — no need to mutate, just drop our state.
    reset();
  }

  function cancel() {
    if (!state.drawing) { reset(); return; }
    const layer = doc.findLayer(state.layerId);
    if (layer) {
      const rec = layer.vector.paths[state.pathIdx];
      const segs = rec ? dToSegments(rec.d) : [];
      // < 2 segments → drop the empty path (and the layer if it's the only one and was fresh).
      if (segs.length < 2) {
        if (layer.vector.paths.length === 1) {
          doc.removeLayer(layer.id);
        } else {
          const next = layer.vector.paths.slice();
          next.splice(state.pathIdx, 1);
          doc.setVectorPaths(layer.id, next);
        }
      }
    }
    reset();
  }

  function reset() {
    state.drawing = false;
    state.layerId = null;
    state.pathIdx = null;
    state.pressDownPos = null;
    state.pressedHandleAnchorIdx = null;
    clearRubber();
  }

  // Tool-switch + Esc / Enter from window.
  onToolChange((newTool) => {
    if (newTool !== 'pen' && state.drawing) finishOpen();
  });
  window.addEventListener('keydown', (e) => {
    if (getTool() !== 'pen' || !state.drawing) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter') { e.preventDefault(); finishClose(); }
  });

  return { start, move, up, cancel, finishOpen, finishClose, isDrawing: () => state.drawing };
}
