// mesh-gradient-overlay.js — Konva-based on-canvas overlay for the Mesh
// Gradient premium plugin. Renders one draggable colour handle per mesh
// control point. Delegates colour changes via an onPointsChange callback.
//
// Usage (called by the plugin's renderUI when "Edit mesh on canvas" is ON):
//
//   import { mountMeshOverlay } from '../../ui/mesh-gradient-overlay.js';
//
//   const handle = mountMeshOverlay({
//     stage,          // Konva.Stage
//     layerId,        // string — which layer this mesh belongs to
//     params,         // current plugin params (points[], gridW, gridH)
//     onPointsChange, // (points[]) => void — fires on drag / colour change
//   });
//
//   // When the toggle goes OFF, or the plugin card is torn down:
//   handle.destroy();
//
// Architecture mirrors anchor-overlay.js: one Konva.Layer added to the stage.
// An inner Konva.Group ('mesh-grp') receives the same position/scale/rotation
// as the layer's Konva.Group so handles are anchored to the layer, not the
// stage viewport.  Points are stored as fractions (0..1) of the layer's
// natural pixel size, and converted to layer-local pixels for Konva coords.

import Konva from 'konva';

const HANDLE_RADIUS = 10;
const HANDLE_STROKE_WIDTH = 2;
const LINE_COLOR = 'rgba(255,255,255,0.35)';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mount a mesh-gradient overlay onto the given Konva stage, anchored to the
 * specified layer's Konva group transform.
 *
 * @param {object} opts
 * @param {import('konva')}    opts.stage           - Konva.Stage instance.
 * @param {string}             opts.layerId         - Layer the plugin lives on.
 * @param {object}             opts.params          - Current plugin params.
 * @param {function}           opts.onPointsChange  - Called with new points[].
 * @returns {{ destroy: function, updateParams: function }}
 */
export function mountMeshOverlay({ stage, layerId, params, onPointsChange }) {
  if (!stage) {
    console.warn('[mesh-gradient-overlay] No stage — overlay skipped');
    return { destroy: () => {}, updateParams: () => {} };
  }

  // One Konva.Layer sits above the content layer.
  const overlay = new Konva.Layer({ listening: true });
  stage.add(overlay);

  // Local mutable copy of the points array.
  let _params = { ...params, points: (params.points || []).map((p) => ({ ...p })) };
  let _dragging = false;
  let _liveDragOff = null;

  // ── Layer group helpers ───────────────────────────────────────────────────

  /** Find the Konva.Group that owns this layer's pixels. */
  function getLayerGroup() {
    return stage.findOne((n) => n.id?.() === layerId) || null;
  }

  /**
   * Return the natural pixel size of the layer (the coordinate space the
   * fractional points refer to).  Falls back to stage dimensions so the
   * overlay still renders even without the layer.
   */
  function getNaturalSize() {
    const slammer = window.__slammer;
    const layer = slammer?.doc?.findLayer?.(layerId);
    if (layer?.naturalSize) return layer.naturalSize;
    // Fallback: use the layer image node's actual pixel size.
    const grp = getLayerGroup();
    if (grp) {
      const img = grp.findOne('Image');
      if (img) return { w: img.width(), h: img.height() };
    }
    return { w: stage.width(), h: stage.height() };
  }

  // ── Build / rebuild the whole overlay ────────────────────────────────────

  function refresh() {
    if (_dragging) return;
    overlay.destroyChildren();
    drawHandles();
    overlay.batchDraw();
  }

  function drawHandles() {
    const { points, gridW = 3, gridH = 3 } = _params;
    if (!points || points.length === 0) return;

    const layerGroup = getLayerGroup();
    const { w: NW, h: NH } = getNaturalSize();

    // Inner group mirrors the layer's Konva transform so handles follow the
    // layer when it is moved, scaled, or rotated.
    const grp = new Konva.Group({ name: 'mesh-grp' });
    if (layerGroup) {
      grp.position({ x: layerGroup.x(), y: layerGroup.y() });
      grp.scale({ x: layerGroup.scaleX(), y: layerGroup.scaleY() });
      grp.rotation(layerGroup.rotation());
      grp.offsetX(layerGroup.offsetX());
      grp.offsetY(layerGroup.offsetY());
    }
    overlay.add(grp);

    // Draw grid connector lines first so handles paint on top.
    drawGridLines(grp, points, gridW, gridH, NW, NH);

    points.forEach((pt, idx) => {
      buildHandle(grp, pt, idx, NW, NH);
    });
  }

  /** Sync the inner group's transform whenever the layer group moves. */
  function syncGroupTransform() {
    const grp = overlay.findOne('.mesh-grp');
    const layerGroup = getLayerGroup();
    if (!grp || !layerGroup) return;
    grp.position({ x: layerGroup.x(), y: layerGroup.y() });
    grp.scale({ x: layerGroup.scaleX(), y: layerGroup.scaleY() });
    grp.rotation(layerGroup.rotation());
    grp.offsetX(layerGroup.offsetX());
    grp.offsetY(layerGroup.offsetY());
    overlay.batchDraw();
  }

  /** Attach listeners to the layer group so handles move with it. */
  function attachLayerGroupListeners() {
    detachLayerGroupListeners();
    const layerGroup = getLayerGroup();
    if (!layerGroup) return;
    const events = ['dragmove', 'xChange', 'yChange', 'scaleXChange', 'scaleYChange', 'rotationChange', 'transform'];
    events.forEach((evt) => layerGroup.on(`${evt}.meshOverlay`, syncGroupTransform));
    _liveDragOff = () => events.forEach((evt) => layerGroup.off(`${evt}.meshOverlay`));
  }

  function detachLayerGroupListeners() {
    if (_liveDragOff) { _liveDragOff(); _liveDragOff = null; }
  }

  function drawGridLines(grp, points, gridW, gridH, NW, NH) {
    // Horizontal lines (row by row)
    for (let r = 0; r < gridH; r++) {
      for (let c = 0; c < gridW - 1; c++) {
        const ptA = points[r * gridW + c];
        const ptB = points[r * gridW + c + 1];
        if (!ptA || !ptB) continue;
        grp.add(new Konva.Line({
          points: [ptA.x * NW, ptA.y * NH, ptB.x * NW, ptB.y * NH],
          stroke: LINE_COLOR,
          strokeWidth: 1,
          strokeScaleEnabled: false,
          listening: false,
          dash: [4, 4],
        }));
      }
    }
    // Vertical lines (col by col)
    for (let c = 0; c < gridW; c++) {
      for (let r = 0; r < gridH - 1; r++) {
        const ptA = points[r * gridW + c];
        const ptB = points[(r + 1) * gridW + c];
        if (!ptA || !ptB) continue;
        grp.add(new Konva.Line({
          points: [ptA.x * NW, ptA.y * NH, ptB.x * NW, ptB.y * NH],
          stroke: LINE_COLOR,
          strokeWidth: 1,
          strokeScaleEnabled: false,
          listening: false,
          dash: [4, 4],
        }));
      }
    }
  }

  function buildHandle(grp, pt, idx, NW, NH) {
    // Layer-local pixel coords.
    const cx = pt.x * NW;
    const cy = pt.y * NH;

    const circle = new Konva.Circle({
      x: cx,
      y: cy,
      radius: HANDLE_RADIUS,
      fill: pt.color || '#ffffff',
      stroke: '#ffffff',
      strokeWidth: HANDLE_STROKE_WIDTH,
      strokeScaleEnabled: false,
      draggable: true,
      shadowColor: 'rgba(0,0,0,0.4)',
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 1,
      shadowEnabled: true,
      hitFunc(ctx, shape) {
        const r = HANDLE_RADIUS + 6;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2, false);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
    });

    // Cursor hints
    const containerEl = stage.container();
    circle.on('mouseenter', () => {
      if (!_dragging) containerEl.style.cursor = 'grab';
    });
    circle.on('mouseleave', () => {
      if (!_dragging) containerEl.style.cursor = '';
    });
    circle.on('dragstart', () => {
      _dragging = true;
      containerEl.style.cursor = 'grabbing';
    });

    // Drag: convert layer-local pixel position back to fraction.
    circle.on('dragmove', () => {
      const newX = Math.max(0, Math.min(1, circle.x() / NW));
      const newY = Math.max(0, Math.min(1, circle.y() / NH));
      _params.points[idx] = { ..._params.points[idx], x: newX, y: newY };

      // Update connector lines live while dragging.
      grp.find('Line').forEach((l) => l.destroy());
      drawGridLines(grp, _params.points, _params.gridW || 3, _params.gridH || 3, NW, NH);
      // Move grid lines behind circles.
      grp.find('Line').forEach((l) => l.moveToBottom());
      overlay.batchDraw();
    });

    circle.on('dragend', () => {
      _dragging = false;
      containerEl.style.cursor = '';
      onPointsChange(_params.points.map((p) => ({ ...p })));
      refresh();
      // Re-attach listeners in case refresh rebuilt the group.
      attachLayerGroupListeners();
    });

    // Click — open a tiny colour picker anchored to the handle.
    circle.on('click tap', (e) => {
      e.cancelBubble = true;
      openColorPicker(circle, idx, pt.color || '#ffffff');
    });

    // Right-click — reset to default grid position for this index.
    circle.on('contextmenu', (e) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      const { gridW = 3, gridH = 3 } = _params;
      const row = Math.floor(idx / gridW);
      const col = idx % gridW;
      const defaultX = gridW > 1 ? col / (gridW - 1) : 0.5;
      const defaultY = gridH > 1 ? row / (gridH - 1) : 0.5;
      _params.points[idx] = {
        ..._params.points[idx],
        x: defaultX,
        y: defaultY,
      };
      onPointsChange(_params.points.map((p) => ({ ...p })));
      refresh();
      attachLayerGroupListeners();
    });

    grp.add(circle);
  }

  // ── Colour picker (lightweight native <input type=color>) ─────────────────

  function openColorPicker(konvaCircle, idx, currentColor) {
    // Remove any existing picker.
    const existing = document.getElementById('__meshGradientColorPicker');
    if (existing) existing.remove();

    const inp = document.createElement('input');
    inp.type = 'color';
    inp.id = '__meshGradientColorPicker';
    inp.value = currentColor;
    inp.style.cssText = 'position:fixed;opacity:0;width:0;height:0;pointer-events:none;';
    document.body.appendChild(inp);

    inp.addEventListener('input', (e) => {
      const color = e.target.value;
      _params.points[idx] = { ..._params.points[idx], color };
      // Update circle fill live.
      konvaCircle.fill(color);
      overlay.batchDraw();
    });

    inp.addEventListener('change', (e) => {
      const color = e.target.value;
      _params.points[idx] = { ..._params.points[idx], color };
      onPointsChange(_params.points.map((p) => ({ ...p })));
      inp.remove();
      refresh();
      attachLayerGroupListeners();
    });

    inp.addEventListener('blur', () => {
      // Slight delay so 'change' fires first on most browsers.
      setTimeout(() => inp.remove(), 200);
    });

    inp.click();
  }

  // ── Stage resize — refresh positions ─────────────────────────────────────

  function onStageResize() { refresh(); attachLayerGroupListeners(); }
  stage.on('widthChange.meshOverlay heightChange.meshOverlay', onStageResize);

  // ── Active layer change — hide overlay when layer changes ─────────────────

  function onDocEvent(e) {
    if (e.type === 'layer:active' || e.type === 'layer:removed') {
      // Only keep the overlay visible when our layer is still active.
      const slammer = window.__slammer;
      const activeId = slammer?.doc?.activeLayerId;
      if (activeId !== layerId) {
        overlay.visible(false);
        overlay.batchDraw();
        detachLayerGroupListeners();
      } else {
        overlay.visible(true);
        refresh();
        attachLayerGroupListeners();
      }
    } else if (e.type === 'layer:transform') {
      syncGroupTransform();
    }
  }

  let _unsubDoc = null;
  const slammer = window.__slammer;
  if (slammer?.doc?.subscribe) {
    _unsubDoc = slammer.doc.subscribe(onDocEvent);
  }

  // Initial draw + attach layer group listeners.
  refresh();
  attachLayerGroupListeners();

  // ── Public handle ─────────────────────────────────────────────────────────

  return {
    /** Tear down the overlay — call when toggle goes OFF or plugin unmounts. */
    destroy() {
      stage.off('widthChange.meshOverlay heightChange.meshOverlay');
      detachLayerGroupListeners();
      if (_unsubDoc) { _unsubDoc(); _unsubDoc = null; }
      overlay.destroy();
    },
    /** Push fresh params into the overlay when the plugin card re-renders. */
    updateParams(newParams) {
      _params = { ...newParams, points: (newParams.points || []).map((p) => ({ ...p })) };
      refresh();
      attachLayerGroupListeners();
    },
  };
}
