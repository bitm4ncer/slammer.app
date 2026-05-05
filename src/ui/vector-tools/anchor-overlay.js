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

  // While the user drags the layer (Konva selection), fire updates so the
  // overlay tracks live instead of waiting for layer:transform on dragend.
  function attachLiveDrag(layer) {
    const layerGroup = stage.findOne((n) => n.id?.() === layer.id);
    if (!layerGroup) return;
    const onMove = () => syncOverlayTransform(layerGroup);
    layerGroup.on('dragmove.anchorOverlay', onMove);
    layerGroup.on('transform.anchorOverlay', onMove);
    liveDragOff = () => {
      layerGroup.off('dragmove.anchorOverlay');
      layerGroup.off('transform.anchorOverlay');
    };
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

    // Path-local origin in group coords: layer's transform.x/y points at the
    // group's offset point (centre); to draw at path-local coords we shift
    // by (transform - offset) which equals path bbox top-left in world.
    const offX = layer.transform.x - layerGroup.offsetX();
    const offY = layer.transform.y - layerGroup.offsetY();
    const accent = getAccent(layer);

    layer.vector.paths.forEach((rec, pathIdx) => {
      let p;
      try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }

      // Dashed path outline (read-only).
      grp.add(new Konva.Path({
        data: rec.d,
        x: -offX, y: -offY,
        stroke: accent,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        dash: [3, 3],
        listening: false,
      }));

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
          const anchor = new Konva.Rect({
            x: px - 3.5, y: py - 3.5,
            width: 7, height: 7,
            fill: '#fff', stroke: '#0a0a0a',
            strokeWidth: 1, strokeScaleEnabled: false,
            draggable: true,
          });
          anchor.on('mousedown', (e) => { e.cancelBubble = true; });
          anchor.on('dragstart', () => { anchorDragging = true; });
          anchor.on('dragend',   () => { anchorDragging = false; refresh(); });
          anchor.on('dragmove', () => {
            const newPx = anchor.x() + 3.5;
            const newPy = anchor.y() + 3.5;
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
  }

  function getAccent(layer) {
    return layer.accentColor
      || getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim()
      || '#8aff8c';
  }

  doc.subscribe((e) => {
    if (
      e.type === 'layer:active' ||
      e.type === 'layer:added' ||
      e.type === 'layer:removed' ||
      e.type === 'layer:vectorChanged' ||
      e.type === 'layer:transform' ||
      e.type === 'doc:loaded'
    ) refresh();
  });
  onToolChange(refresh);

  return { refresh };
}
