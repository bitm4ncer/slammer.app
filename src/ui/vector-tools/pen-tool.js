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
//
// Live curve preview — segment data lives in state.segs (path-local Paper
// segs). Handle drags update state.segs in memory + redraw the Konva
// rubber overlay (path + handles + tangent lines). Doc-model writes only
// happen on mousedown (commit anchor), mouseup (commit handles if changed),
// and close/cancel — eliminating the per-frame re-rasterise storm.

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

function accentColor() {
  return getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';
}

export function attachPenTool({ stage, document: doc }) {
  const state = {
    drawing: false,
    layerId: null,
    pathIdx: null,
    segs: [],                    // local source-of-truth: [{x, y, hi, ho}, ...]
    rubberLayer: null,
    rubberLine: null,            // dashed cursor → last anchor
    pathPreview: null,           // Konva.Path of the current curve
    handleGroup: null,           // anchor squares + handle dots/lines
    pressDownPos: null,
    pressedHandleAnchorIdx: null,
    handleDirty: false,          // true while user is dragging out handles
  };

  function worldXY() {
    const stagePos = stage.getPointerPosition();
    if (!stagePos) return { x: 0, y: 0 };
    const sc = stage.scaleX() || 1;
    return { x: (stagePos.x - stage.x()) / sc, y: (stagePos.y - stage.y()) / sc };
  }

  function ensureRubber() {
    if (state.rubberLayer) return;
    state.rubberLayer = new Konva.Layer({ listening: false });
    stage.add(state.rubberLayer);
    state.pathPreview = new Konva.Path({
      data: '',
      stroke: accentColor(),
      strokeWidth: 1.5,
      strokeScaleEnabled: false,
      listening: false,
    });
    state.rubberLayer.add(state.pathPreview);
    state.rubberLine = new Konva.Line({
      points: [],
      stroke: accentColor(),
      strokeWidth: 1,
      strokeScaleEnabled: false,
      dash: [4, 4],
      listening: false,
    });
    state.rubberLayer.add(state.rubberLine);
    state.handleGroup = new Konva.Group({ listening: false });
    state.rubberLayer.add(state.handleGroup);
    syncRubberTransform();
  }

  function clearRubber() {
    if (!state.rubberLayer) return;
    state.rubberLayer.destroy();
    state.rubberLayer = null;
    state.rubberLine = null;
    state.pathPreview = null;
    state.handleGroup = null;
  }

  function syncRubberTransform() {
    if (!state.rubberLayer) return;
    state.rubberLayer.position({ x: stage.x(), y: stage.y() });
    state.rubberLayer.scale({ x: stage.scaleX(), y: stage.scaleY() });
  }

  // Build (or rebuild) the in-progress curve preview from state.segs. Called
  // on every change (anchor add, handle drag, close). Cheap — just a string
  // concat.
  function updatePathPreview() {
    if (!state.pathPreview) return;
    state.pathPreview.data(segsToDLite(state.segs, false));
    state.rubberLayer.batchDraw();
  }

  // Patch (or build) the handle/anchor visuals. Re-uses existing Konva nodes
  // when possible — only destroys+rebuilds when the segment count changed.
  function renderHandles() {
    if (!state.handleGroup) return;
    const grp = state.handleGroup;
    const segs = state.segs;
    const accent = accentColor();
    // Ensure each seg has a per-anchor sub-group of nodes. Keyed by index.
    if (grp.children.length !== segs.length) {
      grp.destroyChildren();
      for (let i = 0; i < segs.length; i++) grp.add(buildAnchorNodes(accent, i === 0));
    }
    for (let i = 0; i < segs.length; i++) {
      const sub = grp.children[i];
      patchAnchorNodes(sub, segs[i], accent);
    }
    state.rubberLayer.batchDraw();
  }

  function buildAnchorNodes(accent, isFirst) {
    const sub = new Konva.Group({ listening: false });
    sub.add(new Konva.Line({ name: 'hi-line', points: [], stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, opacity: 0.55, listening: false }));
    sub.add(new Konva.Line({ name: 'ho-line', points: [], stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, opacity: 0.55, listening: false }));
    sub.add(new Konva.Circle({ name: 'hi-dot', x: 0, y: 0, radius: 3.5, fill: '#fff', stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, visible: false, listening: false }));
    sub.add(new Konva.Circle({ name: 'ho-dot', x: 0, y: 0, radius: 3.5, fill: '#fff', stroke: accent, strokeWidth: 1, strokeScaleEnabled: false, visible: false, listening: false }));
    const half = isFirst ? 4.5 : 3.5;
    sub.add(new Konva.Rect({
      name: 'anchor', x: 0, y: 0, width: half * 2, height: half * 2,
      fill: isFirst ? accent : '#fff', stroke: '#0a0a0a',
      strokeWidth: 1, strokeScaleEnabled: false, listening: false,
    }));
    sub._isFirst = isFirst;
    return sub;
  }

  function patchAnchorNodes(sub, s, accent) {
    const half = sub._isFirst ? 4.5 : 3.5;
    const hiLine = sub.findOne('.hi-line');
    const hoLine = sub.findOne('.ho-line');
    const hiDot  = sub.findOne('.hi-dot');
    const hoDot  = sub.findOne('.ho-dot');
    const anchor = sub.findOne('.anchor');

    if (s.hi && (s.hi.x || s.hi.y)) {
      hiLine.points([s.x, s.y, s.x + s.hi.x, s.y + s.hi.y]);
      hiLine.visible(true);
      hiDot.position({ x: s.x + s.hi.x, y: s.y + s.hi.y });
      hiDot.visible(true);
    } else {
      hiLine.visible(false); hiDot.visible(false);
    }
    if (s.ho && (s.ho.x || s.ho.y)) {
      hoLine.points([s.x, s.y, s.x + s.ho.x, s.y + s.ho.y]);
      hoLine.visible(true);
      hoDot.position({ x: s.x + s.ho.x, y: s.y + s.ho.y });
      hoDot.visible(true);
    } else {
      hoLine.visible(false); hoDot.visible(false);
    }
    anchor.position({ x: s.x - half, y: s.y - half });
    void accent; // already baked in at build time
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

  // Build the d-string from local segs. Uses Paper for exact bezier coverage.
  function segsToD(segs, closed) {
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

  // Lightweight d-string for the live preview (no Paper round-trip). The
  // visual is a Konva.Path which understands SVG bezier syntax fine.
  function segsToDLite(segs, closed) {
    if (!segs.length) return '';
    let out = `M ${segs[0].x} ${segs[0].y}`;
    let prev = segs[0];
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      const hasH = (prev.ho && (prev.ho.x || prev.ho.y)) || (s.hi && (s.hi.x || s.hi.y));
      if (hasH) {
        const c1x = prev.x + (prev.ho?.x || 0);
        const c1y = prev.y + (prev.ho?.y || 0);
        const c2x = s.x + (s.hi?.x || 0);
        const c2y = s.y + (s.hi?.y || 0);
        out += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${s.x} ${s.y}`;
      } else {
        out += ` L ${s.x} ${s.y}`;
      }
      prev = s;
    }
    if (closed && segs.length > 1) {
      const first = segs[0];
      const hasH = (prev.ho && (prev.ho.x || prev.ho.y)) || (first.hi && (first.hi.x || first.hi.y));
      if (hasH) {
        const c1x = prev.x + (prev.ho?.x || 0);
        const c1y = prev.y + (prev.ho?.y || 0);
        const c2x = first.x + (first.hi?.x || 0);
        const c2y = first.y + (first.hi?.y || 0);
        out += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${first.x} ${first.y}`;
      }
      out += ' Z';
    }
    return out;
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
  // world space. Set on first anchor; never recomputed after that.
  function setInitialTransform(layerId) {
    const layer = doc.findLayer(layerId);
    if (!layer) return;
    const b = computePathBounds(layer.vector.paths);
    if (b.width <= 0 && b.height <= 0) {
      // Single-point — anchor at the path's first point.
      if (state.segs.length) {
        doc.setLayerTransform(layerId, { x: state.segs[0].x, y: state.segs[0].y });
      }
      return;
    }
    doc.setLayerTransform(layerId, { x: b.x, y: b.y });
  }

  function commitToDoc() {
    const layer = doc.findLayer(state.layerId);
    if (!layer) return;
    const d = segsToD(state.segs, false);
    doc.setVectorPath(state.layerId, state.pathIdx, { d });
  }

  // Distance in screen pixels (for hit-zone tests like "click first anchor").
  function screenDist(a, b) {
    const sc = stage.scaleX() || 1;
    return Math.hypot((a.x - b.x) * sc, (a.y - b.y) * sc);
  }

  // ---------- Pointer handlers ----------

  function start() {
    if (getTool() !== 'pen') return false;
    const pt = worldXY();
    if (!state.drawing) {
      // First anchor — set up the layer + path.
      const { layer, pathIdx } = routeOrCreateLayer();
      state.drawing = true;
      state.layerId = layer.id;
      state.pathIdx = pathIdx;
      // Hydrate any existing path data (extending an open subpath).
      state.segs = dToSegments(layer.vector.paths[pathIdx].d);
      state.segs.push({ x: pt.x, y: pt.y, hi: null, ho: null });
      ensureRubber();
      renderHandles();
      updatePathPreview();
      commitToDoc();
      setInitialTransform(layer.id);
      state.pressDownPos = pt;
      state.pressedHandleAnchorIdx = state.segs.length - 1;
      state.handleDirty = false;
      return true;
    }
    // Subsequent anchor.
    // Close detection — click within 8 px of the first anchor.
    if (state.segs.length >= 2) {
      const first = state.segs[0];
      if (screenDist(first, pt) <= 8) {
        finishClose();
        return true;
      }
    }
    state.segs.push({ x: pt.x, y: pt.y, hi: null, ho: null });
    renderHandles();
    updatePathPreview();
    commitToDoc();
    state.pressDownPos = pt;
    state.pressedHandleAnchorIdx = state.segs.length - 1;
    state.handleDirty = false;
    return true;
  }

  function move() {
    if (getTool() !== 'pen') return;
    const pt = worldXY();
    // If a pointer is pressed (potentially building handles for the most-
    // recent anchor) and the user has dragged > 3 px, set handles in our
    // local segs + redraw the Konva preview. NO doc commit until mouseup.
    if (state.pressDownPos && state.pressedHandleAnchorIdx != null) {
      const dx = pt.x - state.pressDownPos.x;
      const dy = pt.y - state.pressDownPos.y;
      if (Math.hypot(dx, dy) > 3) {
        const i = state.pressedHandleAnchorIdx;
        if (state.segs[i]) {
          state.segs[i].ho = { x: dx, y: dy };
          state.segs[i].hi = { x: -dx, y: -dy };
          state.handleDirty = true;
          renderHandles();
          updatePathPreview();
        }
      }
      if (state.rubberLine) state.rubberLine.points([]);
      if (state.rubberLayer) state.rubberLayer.batchDraw();
      return;
    }
    // Otherwise update the rubber band.
    if (!state.drawing || !state.rubberLine) return;
    if (!state.segs.length) return;
    const last = state.segs[state.segs.length - 1];
    state.rubberLine.points([last.x, last.y, pt.x, pt.y]);
    state.rubberLayer.batchDraw();
  }

  function up() {
    if (state.handleDirty) commitToDoc();
    state.pressDownPos = null;
    state.pressedHandleAnchorIdx = null;
    state.handleDirty = false;
  }

  function finishClose() {
    if (!state.drawing) return;
    const layer = doc.findLayer(state.layerId);
    if (!layer) { reset(); return; }
    const d = segsToD(state.segs, true);
    doc.setVectorPath(state.layerId, state.pathIdx, { d, closed: true });
    reset();
  }

  function finishOpen() {
    // Path stays open — commit final segs + drop our state.
    if (state.drawing && state.layerId != null && state.handleDirty) commitToDoc();
    reset();
  }

  function cancel() {
    if (!state.drawing) { reset(); return; }
    const layer = doc.findLayer(state.layerId);
    if (layer) {
      // < 2 segments → drop the empty path (and the layer if it's the only one).
      if (state.segs.length < 2) {
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
    state.segs = [];
    state.pressDownPos = null;
    state.pressedHandleAnchorIdx = null;
    state.handleDirty = false;
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

  // Keep rubber overlay aligned with stage zoom/pan.
  stage.on('xChange.penTool yChange.penTool scaleXChange.penTool scaleYChange.penTool', syncRubberTransform);

  return { start, move, up, cancel, finishOpen, finishClose, isDrawing: () => state.drawing };
}
