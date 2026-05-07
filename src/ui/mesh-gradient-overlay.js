// mesh-gradient-overlay.js — Konva-based on-canvas overlay for the Mesh
// Gradient premium plugin. Renders one draggable colour handle per mesh
// control point. Delegates colour changes via an onPointsChange callback.
//
// Usage (called by the plugin's renderUI when "Edit mesh on canvas" is ON):
//
//   import { mountMeshOverlay, unmountMeshOverlay } from
//     '../../ui/mesh-gradient-overlay.js';
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
// Architecture mirrors anchor-overlay.js: one Konva.Layer added to the stage,
// destroyChildren() + batchDraw() on each refresh.  We store stage-space
// positions as fractions (0..1) so coords survive resize.

import Konva from 'konva';

const HANDLE_RADIUS = 10;
const HANDLE_STROKE_WIDTH = 2;
const LINE_COLOR = 'rgba(255,255,255,0.35)';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mount a mesh-gradient overlay onto the given Konva stage.
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

  // ── Build / rebuild the whole overlay ────────────────────────────────────

  function refresh() {
    if (_dragging) return;
    overlay.destroyChildren();
    drawHandles();
    overlay.batchDraw();
  }

  function drawHandles() {
    const W = stage.width();
    const H = stage.height();
    const { points, gridW = 3, gridH = 3 } = _params;
    if (!points || points.length === 0) return;

    // Draw grid connector lines first so handles paint on top.
    drawGridLines(points, gridW, gridH, W, H);

    points.forEach((pt, idx) => {
      buildHandle(pt, idx, W, H);
    });
  }

  function drawGridLines(points, gridW, gridH, W, H) {
    // Horizontal lines (row by row)
    for (let r = 0; r < gridH; r++) {
      for (let c = 0; c < gridW - 1; c++) {
        const ptA = points[r * gridW + c];
        const ptB = points[r * gridW + c + 1];
        if (!ptA || !ptB) continue;
        overlay.add(new Konva.Line({
          points: [ptA.x * W, ptA.y * H, ptB.x * W, ptB.y * H],
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
        overlay.add(new Konva.Line({
          points: [ptA.x * W, ptA.y * H, ptB.x * W, ptB.y * H],
          stroke: LINE_COLOR,
          strokeWidth: 1,
          strokeScaleEnabled: false,
          listening: false,
          dash: [4, 4],
        }));
      }
    }
  }

  function buildHandle(pt, idx, W, H) {
    const cx = pt.x * W;
    const cy = pt.y * H;

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

    // Drag: update fractional position and fire callback.
    circle.on('dragmove', () => {
      const newX = Math.max(0, Math.min(1, circle.x() / W));
      const newY = Math.max(0, Math.min(1, circle.y() / H));
      _params.points[idx] = { ..._params.points[idx], x: newX, y: newY };

      // Update connector lines live: cheaper to just refresh the grid
      // lines portion; we skip handle rebuild while dragging.
      overlay.find('Line').forEach((l) => l.destroy());
      drawGridLines(_params.points, _params.gridW || 3, _params.gridH || 3, W, H);
      overlay.batchDraw();
    });

    circle.on('dragend', () => {
      _dragging = false;
      containerEl.style.cursor = '';
      onPointsChange(_params.points.map((p) => ({ ...p })));
      refresh();
    });

    // Click — open a tiny colour picker anchored to the handle.
    circle.on('click tap', (e) => {
      e.cancelBubble = true;
      openColorPicker(circle, idx, pt.color || '#ffffff', W, H);
    });

    // Right-click — reset to default position for this grid index.
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
    });

    overlay.add(circle);
  }

  // ── Colour picker (lightweight native <input type=color>) ─────────────────

  function openColorPicker(konvaCircle, idx, currentColor, W, H) {
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
    });

    inp.addEventListener('blur', () => {
      // Slight delay so 'change' fires first on most browsers.
      setTimeout(() => inp.remove(), 200);
    });

    inp.click();
  }

  // ── Stage resize — refresh positions ─────────────────────────────────────

  function onStageResize() { refresh(); }
  stage.on('widthChange.meshOverlay heightChange.meshOverlay', onStageResize);

  // Initial draw
  refresh();

  // ── Public handle ─────────────────────────────────────────────────────────

  return {
    /** Tear down the overlay — call when toggle goes OFF or plugin unmounts. */
    destroy() {
      stage.off('widthChange.meshOverlay heightChange.meshOverlay');
      overlay.destroy();
    },
    /** Push fresh params into the overlay when the plugin card re-renders. */
    updateParams(newParams) {
      _params = { ...newParams, points: (newParams.points || []).map((p) => ({ ...p })) };
      refresh();
    },
  };
}
