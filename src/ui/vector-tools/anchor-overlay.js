// anchor-overlay — when the active tool is "directSelect" and the active
// layer is a vector layer, render Konva markers on top of the canvas
// showing every anchor + bezier handle on every path.
//
// Phase 13a: read-only visualisation (anchors + tangents). Drag-to-edit
// + alt-click smooth/corner toggle land in 13b. The renderer also draws
// a thin dashed outline of every path in the layer for clarity.

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

export function initAnchorOverlay({ stage, contentLayer, document: doc }) {
  // Dedicated Konva.Layer that floats above content but below the
  // transformer. We toggle its visibility based on tool + layer type.
  const overlay = new Konva.Layer({ listening: false });
  stage.add(overlay);

  function refresh() {
    overlay.destroyChildren();
    if (getTool() !== 'directSelect') { overlay.batchDraw(); return; }
    const layer = doc.activeLayer;
    if (!layer || layer.type !== 'vector') { overlay.batchDraw(); return; }
    drawAnchors(layer);
  }

  function drawAnchors(layer) {
    ensurePaper();
    // Group with the same transform as the layer's stage group so anchor
    // coords (in path-local) map to the right world position.
    const layerGroup = stage.findOne((n) => n.id?.() === layer.id);
    if (!layerGroup) return;
    const grp = new Konva.Group({
      x: layerGroup.x(),
      y: layerGroup.y(),
      scaleX: layerGroup.scaleX(),
      scaleY: layerGroup.scaleY(),
      rotation: layerGroup.rotation(),
      listening: false,
    });
    overlay.add(grp);

    // Path-local coordinate offset: shapes store coords starting at
    // (transform.x, transform.y) in WORLD space. For overlay we want them
    // at (0, 0) in the group (which is at transform.x in world). So
    // subtract layer.transform.x/y from each point.
    const offX = layer.transform.x;
    const offY = layer.transform.y;

    const accent = getAccent(layer);

    for (const rec of layer.vector.paths) {
      let p;
      try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { continue; }
      // Thin dashed outline of the path — helps the user see what's selected.
      const outline = new Konva.Path({
        data: rec.d,
        x: -offX, y: -offY,
        stroke: accent,
        strokeWidth: 1,
        strokeScaleEnabled: false,
        dash: [3, 3],
        listening: false,
      });
      grp.add(outline);

      const subpaths = p.children && p.children.length ? p.children : [p];
      for (const sub of subpaths) {
        if (!sub.segments) continue;
        for (const seg of sub.segments) {
          const px = seg.point.x - offX;
          const py = seg.point.y - offY;
          // Bezier tangent lines + handle dots.
          if (seg.handleIn && (seg.handleIn.x || seg.handleIn.y)) {
            grp.add(new Konva.Line({
              points: [px, py, px + seg.handleIn.x, py + seg.handleIn.y],
              stroke: accent, strokeWidth: 1, strokeScaleEnabled: false,
              opacity: 0.55, listening: false,
            }));
            grp.add(new Konva.Circle({
              x: px + seg.handleIn.x, y: py + seg.handleIn.y,
              radius: 3, fill: '#fff', stroke: accent,
              strokeWidth: 1, strokeScaleEnabled: false, listening: false,
            }));
          }
          if (seg.handleOut && (seg.handleOut.x || seg.handleOut.y)) {
            grp.add(new Konva.Line({
              points: [px, py, px + seg.handleOut.x, py + seg.handleOut.y],
              stroke: accent, strokeWidth: 1, strokeScaleEnabled: false,
              opacity: 0.55, listening: false,
            }));
            grp.add(new Konva.Circle({
              x: px + seg.handleOut.x, y: py + seg.handleOut.y,
              radius: 3, fill: '#fff', stroke: accent,
              strokeWidth: 1, strokeScaleEnabled: false, listening: false,
            }));
          }
          // Anchor square (slightly larger so it pops over the dot handles).
          grp.add(new Konva.Rect({
            x: px - 3.5, y: py - 3.5,
            width: 7, height: 7,
            fill: '#fff', stroke: '#0a0a0a',
            strokeWidth: 1, strokeScaleEnabled: false,
            listening: false,
          }));
        }
      }
      p.remove();
    }
    overlay.batchDraw();
  }

  function getAccent(layer) {
    return layer.accentColor
      || getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim()
      || '#8aff8c';
  }

  // Re-draw when the tool, the active layer, or the layer's content changes.
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
