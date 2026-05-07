// canvas-grid.js — subtle two-tier grid rendered as a layer-level overlay.
// Exports initCanvasGrid({ stage, getSettings, onSettingsChange }) → { destroy, onTransform }
//
// Implementation note: we deliberately do NOT use a Konva.Shape with sceneFunc.
// Konva caches a Shape's bounding rect from the first draw and uses it to
// clip subsequent renders — even when sceneFunc draws outside that rect.
// Symptom (tracked through two failed fixes): grid renders only inside a
// fixed square the size of the viewport at the moment the layer was first
// added. Setting `width` / `height` properties or providing a stage-sized
// `hitFunc` does NOT override the bbox cache.
//
// Instead, we hook the layer's `draw` event and paint the grid directly onto
// the layer's 2d context after Konva clears for redraw. Since the layer has
// no children, our paint becomes the layer's final canvas content. No bbox,
// no clip, no caching surprise.

import Konva from 'konva';

/**
 * Convert a CSS hex colour string (#rrggbb or #rgb) to an { r, g, b } object.
 */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Draw the two-tier grid onto a raw 2d canvas context.
 * All grid lines are drawn at integer screen pixels for crispness.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} stageTransform  — { x, y, scaleX } from stage
 * @param {number} stageW          — stage width in screen pixels
 * @param {number} stageH          — stage height in screen pixels
 * @param {object} settings        — current settings snapshot
 */
function drawGrid(ctx, stageTransform, stageW, stageH, settings) {
  const { x: ox, y: oy, scaleX: sc } = stageTransform;
  const baseMinor = Math.max(1, settings.canvasGridMinor || 10);
  const baseMajor = Math.max(baseMinor, settings.canvasGridMajor || 100);
  const opacity = (settings.canvasGridOpacity ?? 25) / 100;
  const color = settings.canvasGridColor || '#ffffff';

  if (opacity <= 0 || sc <= 0) return;

  // Zoom-adaptive tiering — keep minor lines roughly TARGET_SCREEN_PX apart on
  // screen. As the user zooms out, multiply both pitches by 10× per LOD step
  // so the grid never goes denser than ~one line every 6 px nor sparser than
  // ~one line every 60 px. Major lines stay 10× the minor.
  const TARGET_SCREEN_PX = 12;
  const idealMinorWorld = TARGET_SCREEN_PX / sc;
  const tier = Math.max(0, Math.round(Math.log10(idealMinorWorld / baseMinor)));
  const minor = baseMinor * Math.pow(10, tier);
  const major = baseMajor * Math.pow(10, tier);

  const { r, g, b } = hexToRgb(color);

  // Visible world rect
  const worldLeft   = -ox / sc;
  const worldTop    = -oy / sc;
  const worldRight  = (stageW - ox) / sc;
  const worldBottom = (stageH - oy) / sc;

  const minorAlpha = opacity;
  const majorAlpha = Math.min(1, opacity * 2);

  const firstMinorX = Math.floor(worldLeft / minor) * minor;
  const firstMinorY = Math.floor(worldTop  / minor) * minor;

  ctx.save();
  ctx.lineWidth = 1;

  // Vertical lines
  for (let wx = firstMinorX; wx <= worldRight; wx += minor) {
    const isMajor = major > 0 && Math.abs(wx % major) < 0.0001;
    const sx = Math.round(ox + wx * sc) + 0.5;
    ctx.beginPath();
    ctx.globalAlpha = isMajor ? majorAlpha : minorAlpha;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, stageH);
    ctx.stroke();
  }

  // Horizontal lines
  for (let wy = firstMinorY; wy <= worldBottom; wy += minor) {
    const isMajor = major > 0 && Math.abs(wy % major) < 0.0001;
    const sy = Math.round(oy + wy * sc) + 0.5;
    ctx.beginPath();
    ctx.globalAlpha = isMajor ? majorAlpha : minorAlpha;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.moveTo(0, sy);
    ctx.lineTo(stageW, sy);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Initialise the canvas grid.
 *
 * @param {object} opts
 * @param {Konva.Stage}  opts.stage
 * @param {function}     opts.getSettings
 * @param {function}     opts.onSettingsChange   — returns unsubscribe fn
 * @returns {{ destroy: function, onTransform: function }}
 */
export function initCanvasGrid({ stage, getSettings, onSettingsChange }) {
  // Empty layer — no children. We paint into its canvas via the `draw` event.
  const gridLayer = new Konva.Layer({ listening: false, name: 'gridLayer' });

  // Place the grid ABOVE the export-frame dim overlay so the grid stays at
  // its configured opacity across the whole viewport.
  // canvas-view adds layers in order: bgLayer(0), contentLayer(1), overlayLayer(2),
  // frameUiLayer(3). Slot grid at z=3 — between overlay (dim) and frameUiLayer
  // (handles). Konva shifts frameUiLayer up to z=4. Marquee/anchor overlays
  // added later land above grid as expected (interactive UI on top).
  stage.add(gridLayer);
  gridLayer.setZIndex(3);

  // Paint the grid AFTER Konva has cleared the layer canvas for this frame.
  // The `draw` event on a Konva.Layer fires after children have been drawn.
  // Since this layer has no children, the canvas is in a freshly-cleared
  // state when `draw` fires, and our paint is the final visible content.
  gridLayer.on('draw', () => {
    const s = getSettings();
    if (!s.canvasGridShow) return;
    // Konva.Context wraps the native context; the underlying CanvasRenderingContext2D
    // lives on `_context`. Use that for raw 2d API access.
    const konvaCtx = gridLayer.getCanvas().getContext();
    const ctx = konvaCtx._context || konvaCtx;
    drawGrid(
      ctx,
      { x: stage.x(), y: stage.y(), scaleX: stage.scaleX() || 1 },
      stage.width(),
      stage.height(),
      s
    );
  });

  function redraw() { gridLayer.batchDraw(); }

  // ── Subscribe to settings changes + stage resize ──────────────────────────
  const unsubSettings = onSettingsChange(redraw);
  const onResize = () => redraw();
  window.addEventListener('resize', onResize);
  // canvas-view resizes the stage via ResizeObserver on the container (e.g.
  // side-panel resize, fullscreen toggle). Mirror that here so the grid stays
  // sized to the live viewport, not the original-mount viewport.
  let resizeObserver = null;
  const containerEl = stage.container?.();
  if (containerEl && typeof window.ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(redraw);
    resizeObserver.observe(containerEl);
  }

  // ── Initial draw ──────────────────────────────────────────────────────────
  redraw();

  return {
    /** Redraw after pan or zoom. Called by canvas-view. */
    onTransform() { redraw(); },

    destroy() {
      unsubSettings();
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      gridLayer.destroy();
    },
  };
}
