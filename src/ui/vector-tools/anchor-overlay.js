// anchor-overlay — Direct Selection visual + interaction layer.
//
// When the active tool is "directSelect" and the active layer is a vector
// layer:
//   • Each path is outlined in dashed accent.
//   • Each segment.point shows as a draggable white square anchor.
//   • Each non-zero handleIn / handleOut shows as a draggable round dot
//     connected to its anchor by a tangent line.
//
// Dragging an anchor or handle mutates the path's d-string via
// doc.setVectorPath, which triggers re-rasterise + overlay refresh.
// This is the read+edit pass; pen-tool insertion comes in 13b.

import Konva from 'konva';
import paper from 'paper';
import { getTool, onToolChange } from './active-tool.js';
import { computePathBounds } from '../../core/vector-renderer.js';

let _paperReady = false;
function ensurePaper() {
  if (_paperReady) return;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  paper.setup(c);
  _paperReady = true;
}
function activatePaper() {
  // Same trick as vector-renderer: re-activate after svg-import / others
  // could have stolen the active project.
  if (!_paperReady) { ensurePaper(); return; }
  if (paper.project) paper.project.activate();
}

export function initAnchorOverlay({ stage, document: doc }) {
  const overlay = new Konva.Layer();
  stage.add(overlay);
  let liveDragOff = null;
  // While the user is dragging an anchor or bezier handle, skip the
  // overlay rebuild that would normally fire on layer:vectorChanged —
  // otherwise we destroy the very Konva node Konva is dragging, killing
  // the gesture after one tick (the symptom: handles only move 1 px).
  let anchorDragging = false;
  // Currently-selected anchor (for Backspace / visual highlight).
  // { layerId, pathIdx, segIdx } or null.
  let selected = null;

  function refresh() {
    if (anchorDragging) return;
    overlay.destroyChildren();
    detachLiveDrag();
    if (getTool() !== 'directSelect') { overlay.batchDraw(); return; }
    const layer = doc.activeLayer;
    if (!layer || layer.type !== 'vector') { overlay.batchDraw(); return; }
    drawAnchors(layer);
    attachLiveDrag(layer);
  }

  // While the user drags / scales / rotates the layer's Konva.Group, the
  // anchor overlay needs to track live (Konva fires dragmove + transform
  // continuously; layer:transform in the doc model only fires on dragend).
  function attachLiveDrag(layer) {
    const layerGroup = stage.findOne((n) => n.id?.() === layer.id);
    if (!layerGroup) return;
    const onMove = () => syncOverlayTransform(layerGroup);
    layerGroup.on('dragmove.anchorOverlay', onMove);
    layerGroup.on('xChange.anchorOverlay', onMove);
    layerGroup.on('yChange.anchorOverlay', onMove);
    layerGroup.on('scaleXChange.anchorOverlay', onMove);
    layerGroup.on('scaleYChange.anchorOverlay', onMove);
    layerGroup.on('rotationChange.anchorOverlay', onMove);
    layerGroup.on('transform.anchorOverlay', onMove);
    liveDragOff = () => {
      ['dragmove', 'xChange', 'yChange', 'scaleXChange', 'scaleYChange', 'rotationChange', 'transform']
        .forEach((evt) => layerGroup.off(`${evt}.anchorOverlay`));
    };
    // Sync once immediately in case the layer was already in a transformed
    // state (e.g. user moved it in Selection mode then switched to A).
    syncOverlayTransform(layerGroup);
  }
  function detachLiveDrag() { if (liveDragOff) { liveDragOff(); liveDragOff = null; } }

  function syncOverlayTransform(layerGroup) {
    const grp = overlay.findOne('.anchor-grp');
    if (!grp) return;
    grp.position({ x: layerGroup.x(), y: layerGroup.y() });
    grp.scale({ x: layerGroup.scaleX(), y: layerGroup.scaleY() });
    grp.rotation(layerGroup.rotation());
    grp.offset({ x: layerGroup.offsetX(), y: layerGroup.offsetY() });
    overlay.batchDraw();
  }

  function drawAnchors(layer) {
    activatePaper();
    const layerGroup = stage.findOne((n) => n.id?.() === layer.id);
    if (!layerGroup) return;
    const grp = new Konva.Group({
      name: 'anchor-grp',
      x: layerGroup.x(),
      y: layerGroup.y(),
      scaleX: layerGroup.scaleX(),
      scaleY: layerGroup.scaleY(),
      rotation: layerGroup.rotation(),
      offsetX: layerGroup.offsetX(),
      offsetY: layerGroup.offsetY(),
    });
    overlay.add(grp);

    // Top-left origin: layerGroup has offset = 0. Path coords are stored
    // in WORLD space; the layer group sits at world (transform.x, transform.y).
    // To place an anchor at path-coord (px, py) we shift it by -transform
    // into the group's local coord system.
    const offX = layer.transform.x;
    const offY = layer.transform.y;
    const accent = getAccent(layer);

    layer.vector.paths.forEach((rec, pathIdx) => {
      let p;
      try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }

      // Dashed path outline. listening:true so a double-click on the edge
      // inserts a new anchor (Paper getNearestLocation). Tagged with the
      // path index so commitAnchorEdit can patch its `data` attribute
      // live during a drag without rebuilding the whole overlay.
      const outline = new Konva.Path({
        name: `path-outline-${pathIdx}`,
        data: rec.d,
        x: -offX, y: -offY,
        stroke: accent,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        dash: [3, 3],
        // Boost hit-test width so the user doesn't need pixel-perfect aim.
        hitStrokeWidth: 10,
        listening: true,
      });
      outline.on('dblclick dbltap', (e) => {
        e.cancelBubble = true;
        // Convert pointer to path-local coords (undo overlay group offset).
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const sc = stage.scaleX() || 1;
        const worldX = (pos.x - stage.x()) / sc;
        const worldY = (pos.y - stage.y()) / sc;
        // Path-local = world + offX (since outline is drawn at -offX).
        insertAnchorAtPoint(layer, pathIdx, 0, { x: worldX + offX, y: worldY + offY });
      });
      grp.add(outline);

      const subpaths = p.children && p.children.length ? p.children : [p];
      let segCounter = 0;
      for (let si = 0; si < subpaths.length; si++) {
        const sub = subpaths[si];
        if (!sub.segments) continue;
        for (let segIdx = 0; segIdx < sub.segments.length; segIdx++) {
          const seg = sub.segments[segIdx];
          const px = seg.point.x - offX;
          const py = seg.point.y - offY;
          const refIndex = segCounter++;

          // Tangent handles (in / out).
          addHandle({
            grp, accent, layer, pathIdx, side: 'in',
            subPathIdx: si, segIdx, refIndex,
            anchorX: px, anchorY: py,
            offset: seg.handleIn,
          });
          addHandle({
            grp, accent, layer, pathIdx, side: 'out',
            subPathIdx: si, segIdx, refIndex,
            anchorX: px, anchorY: py,
            offset: seg.handleOut,
          });

          // Anchor square (draggable).
          // Selected anchor → larger + accent-filled, otherwise white-filled.
          const isSelected = selected
            && selected.layerId === layer.id
            && selected.pathIdx === pathIdx
            && selected.segIdx === segIdx;
          const half = isSelected ? 4.5 : 3.5;
          const anchor = new Konva.Rect({
            x: px - half, y: py - half,
            width: half * 2, height: half * 2,
            fill: isSelected ? accent : '#fff',
            stroke: '#0a0a0a',
            strokeWidth: 1, strokeScaleEnabled: false,
            draggable: true,
          });
          anchor.on('mousedown', (e) => { e.cancelBubble = true; });
          // Plain click → select + tell the Vector panel to switch its
          // active sub-path. Alt-click → toggle smooth/corner.
          anchor.on('click', (e) => {
            e.cancelBubble = true;
            if (e.evt.altKey) toggleSmoothCorner(layer, pathIdx, si, segIdx);
            else {
              selected = { layerId: layer.id, pathIdx, segIdx };
              doc._emitVectorActivePath?.(layer.id, pathIdx);
              refresh();
            }
          });
          anchor.on('dragstart', () => {
            anchorDragging = true;
            selected = { layerId: layer.id, pathIdx, segIdx };
          });
          anchor.on('dragend', () => { anchorDragging = false; refresh(); });
          anchor.on('dragmove', () => {
            const newPx = anchor.x() + half;
            const newPy = anchor.y() + half;
            const targetX = newPx + offX;
            const targetY = newPy + offY;
            commitAnchorEdit(layer, pathIdx, si, segIdx, { point: { x: targetX, y: targetY } });
          });
          grp.add(anchor);
        }
      }
      p.remove();
    });
    overlay.batchDraw();
  }

  function addHandle({ grp, accent, layer, pathIdx, side, subPathIdx, segIdx, anchorX, anchorY, offset }) {
    if (!offset || (!offset.x && !offset.y)) return;
    const hx = anchorX + offset.x;
    const hy = anchorY + offset.y;
    grp.add(new Konva.Line({
      points: [anchorX, anchorY, hx, hy],
      stroke: accent, strokeWidth: 1, strokeScaleEnabled: false,
      opacity: 0.55, listening: false,
    }));
    const dot = new Konva.Circle({
      x: hx, y: hy,
      radius: 4, fill: '#fff', stroke: accent,
      strokeWidth: 1, strokeScaleEnabled: false,
      draggable: true,
    });
    dot.on('mousedown', (e) => { e.cancelBubble = true; });
    // Alt-click handle dot → break the symmetric pair so subsequent drags
    // only move the touched side. We mark the segment with an
    // _asymmetric flag so commitAnchorEdit doesn't auto-mirror.
    dot.on('click', (e) => {
      if (!e.evt.altKey) return;
      e.cancelBubble = true;
      breakHandlePair(layer, pathIdx, subPathIdx, segIdx);
    });
    dot.on('dragstart', () => { anchorDragging = true; });
    dot.on('dragend',   () => { anchorDragging = false; refresh(); });
    dot.on('dragmove', () => {
      const dx = dot.x() - anchorX;
      const dy = dot.y() - anchorY;
      const patch = side === 'in' ? { handleIn: { x: dx, y: dy } } : { handleOut: { x: dx, y: dy } };
      commitAnchorEdit(layer, pathIdx, subPathIdx, segIdx, patch);
    });
    grp.add(dot);
  }

  function toggleSmoothCorner(layer, pathIdx, subPathIdx, segIdx) {
    activatePaper();
    const rec = layer.vector.paths[pathIdx];
    if (!rec) return;
    let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }
    const subs = p.children && p.children.length ? p.children : [p];
    const sub = subs[subPathIdx];
    const seg = sub?.segments?.[segIdx];
    if (!seg) { p.remove(); return; }
    const isCorner = (!seg.handleIn || (!seg.handleIn.x && !seg.handleIn.y))
                  && (!seg.handleOut || (!seg.handleOut.x && !seg.handleOut.y));
    if (isCorner) {
      // Make smooth — derive a sensible handle vector from neighbour points.
      const segs = sub.segments;
      const prev = segs[(segIdx - 1 + segs.length) % segs.length];
      const next = segs[(segIdx + 1) % segs.length];
      const tx = (next.point.x - prev.point.x) / 4;
      const ty = (next.point.y - prev.point.y) / 4;
      seg.handleIn = new paper.Point(-tx, -ty);
      seg.handleOut = new paper.Point(tx, ty);
    } else {
      seg.handleIn = new paper.Point(0, 0);
      seg.handleOut = new paper.Point(0, 0);
    }
    const newD = p.pathData;
    p.remove();
    doc.setVectorPath(layer.id, pathIdx, { d: newD });
    refresh();
  }

  function breakHandlePair(layer, pathIdx, subPathIdx, segIdx) {
    // We don't actually need a flag — Paper segments naturally support
    // asymmetric handles. The symmetry came from our commitAnchorEdit
    // patch. To "break" the pair we just leave them alone (the next drag
    // already moves only the touched side via handleIn / handleOut keys).
    // For visual feedback we briefly highlight via refresh.
    refresh();
  }

  function deleteSelectedAnchor() {
    if (!selected) return;
    const layer = doc.findLayer(selected.layerId);
    if (!layer) return;
    const rec = layer.vector.paths[selected.pathIdx];
    if (!rec) return;
    activatePaper();
    let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }
    const subs = p.children && p.children.length ? p.children : [p];
    // We track segIdx as a flat index across subpaths; figure out which sub.
    let walk = 0, sub = null, localIdx = -1;
    for (const s of subs) {
      const n = s.segments.length;
      if (selected.segIdx < walk + n) { sub = s; localIdx = selected.segIdx - walk; break; }
      walk += n;
    }
    if (!sub || localIdx < 0) { p.remove(); return; }
    if (sub.segments.length <= 2) {
      // Removing would leave 0 or 1 anchor — drop the whole sub-path.
      sub.remove();
    } else {
      sub.removeSegment(localIdx);
    }
    const newD = p.pathData;
    p.remove();
    if (!newD) {
      // Path empty — drop it. If the layer becomes empty too, drop the layer.
      if (layer.vector.paths.length === 1) {
        doc.removeLayer(layer.id);
      } else {
        const next = layer.vector.paths.slice();
        next.splice(selected.pathIdx, 1);
        doc.setVectorPaths(layer.id, next);
      }
    } else {
      doc.setVectorPath(layer.id, selected.pathIdx, { d: newD });
    }
    selected = null;
    refresh();
  }

  function insertAnchorAtPoint(layer, pathIdx, subPathIdx, point) {
    activatePaper();
    const rec = layer.vector.paths[pathIdx];
    if (!rec) return;
    let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }
    const subs = p.children && p.children.length ? p.children : [p];
    const sub = subs[subPathIdx];
    if (!sub) { p.remove(); return; }
    // Find the location on the sub-path nearest the click point.
    const loc = sub.getNearestLocation(new paper.Point(point.x, point.y));
    if (!loc) { p.remove(); return; }
    sub.divideAt(loc);
    const newD = p.pathData;
    p.remove();
    doc.setVectorPath(layer.id, pathIdx, { d: newD });
    refresh();
  }

  function commitAnchorEdit(layer, pathIdx, subPathIdx, segIdx, patch) {
    activatePaper();
    const rec = layer.vector.paths[pathIdx];
    if (!rec) return;
    let p;
    try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }
    const subpaths = p.children && p.children.length ? p.children : [p];
    const sub = subpaths[subPathIdx];
    if (!sub || !sub.segments[segIdx]) { p.remove(); return; }
    const seg = sub.segments[segIdx];
    if (patch.point)     { seg.point.x = patch.point.x; seg.point.y = patch.point.y; }
    if (patch.handleIn)  { seg.handleIn = new paper.Point(patch.handleIn.x, patch.handleIn.y); }
    if (patch.handleOut) { seg.handleOut = new paper.Point(patch.handleOut.x, patch.handleOut.y); }
    const newD = p.pathData;
    p.remove();
    // Anchor edits are non-destructive w.r.t. the shape record — we leave
    // shape (kind/sides/cx/cy/r/cornerRadius) intact so the panel sliders
    // still work. Changing a slider regenerates d and overwrites manual
    // edits, which mirrors the mental model in Affinity / Illustrator.
    doc.setVectorPath(layer.id, pathIdx, { d: newD });
    // Top-left origin: layer.transform stays fixed at the layer's anchor
    // point (set ONCE at creation by the shape/pen/pencil drawer). The
    // renderer's image.position compensates for path-bounds shifts so
    // non-moved anchors stay visually put without us touching transform.
    // refresh() is short-circuited during anchorDragging — keep the
    // dashed outline's `data` attribute in sync ourselves.
    const outline = overlay.findOne(`.path-outline-${pathIdx}`);
    if (outline) outline.data(newD);
    overlay.batchDraw();
  }

  function getAccent(layer) {
    return layer.accentColor
      || getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim()
      || '#8aff8c';
  }

  doc.subscribe((e) => {
    if (e.type === 'layer:active' || e.type === 'layer:removed' || e.type === 'doc:loaded') {
      selected = null;
    }
    if (
      e.type === 'layer:active' ||
      e.type === 'layer:added' ||
      e.type === 'layer:removed' ||
      e.type === 'layer:vectorChanged' ||
      e.type === 'layer:transform' ||
      e.type === 'doc:loaded'
    ) refresh();
  });
  onToolChange(() => { selected = null; refresh(); });

  // Backspace / Delete deletes the currently-selected anchor (Direct Select).
  // Be conservative — only fire when the user isn't typing in an input
  // and we have an anchor selected.
  window.addEventListener('keydown', (e) => {
    if (getTool() !== 'directSelect' || !selected) return;
    const ae = window.document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteSelectedAnchor();
    }
  });

  // Click on empty stage area in directSelect → deselect anchor.
  stage.on('click.anchorOverlayEmpty', (e) => {
    if (getTool() !== 'directSelect') return;
    if (e.target === stage) {
      if (selected) { selected = null; refresh(); }
    }
  });

  return { refresh };
}
