// canvas-grid.js — subtle two-tier grid rendered below all content layers.
// Exports initCanvasGrid({ stage, getSettings, onSettingsChange }) → { destroy, onTransform }

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
 * Draw the two-tier grid onto the Konva context (or raw 2d context).
 * All grid lines are drawn at integer screen pixels for crispness.
 *
 * @param {object} ctx                    — Konva.Context (or raw 2d context)
 * @param {object} stageTransform         — { x, y, scaleX } from stage
 * @param {number} stageW                 — stage width in screen pixels
 * @param {number} stageH                 — stage height in screen pixels
 * @param {object} settings               — current settings snapshot
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

  // Minor lines — standard opacity
  const minorAlpha = opacity;
  // Major lines — 2× alpha, minimum 1, capped at 1
  const majorAlpha = Math.min(1, opacity * 2);

  // First grid line at or just before the visible left/top edge
  const firstMinorX = Math.floor(worldLeft / minor) * minor;
  const firstMinorY = Math.floor(worldTop  / minor) * minor;

  ctx.save();
  ctx.lineWidth = 1;

  // Draw vertical lines
  for (let wx = firstMinorX; wx <= worldRight; wx += minor) {
    const isMajor = major > 0 && Math.abs(wx % major) < 0.0001;
    // Snap to integer screen pixels
    const sx = Math.round(ox + wx * sc) + 0.5;
    ctx.beginPath();
    ctx.globalAlpha = isMajor ? majorAlpha : minorAlpha;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, stageH);
    ctx.stroke();
  }

  // Draw horizontal lines
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
  // ── Create a dedicated Konva.Layer for the grid ──────────────────────────
  // Inserted at index 1 (above bgLayer at 0, below contentLayer at 1 before
  // insertion). canvas-view.js calls insertAt or just adds layers in order;
  // here we inject after mount via insertAt so we don't need to change
  // canvas-view's API.
  const gridLayer = new Konva.Layer({ listening: false, name: 'gridLayer' });

  // The grid is drawn with a single Konva.Shape using sceneFunc for raw canvas
  // access — far faster than spawning thousands of Konva.Line nodes.
  const gridShape = new Konva.Shape({
    listening: false,
    perfectDrawEnabled: false,
    x: 0,
    y: 0,
    width: stage.width(),
    height: stage.height(),
    sceneFunc(ctx) {
      const s = getSettings();
      if (!s.canvasGridShow) return;
      // Refresh bounds in case the stage resized — Konva clips a Shape's
      // dirty rect to the bounding rect Konva computes from sceneFunc on
      // first draw. Without explicit width/height the grid would only
      // appear wherever the FIRST draw's bbox happened to land.
      this.width(stage.width());
      this.height(stage.height());
      const tr = {
        x: stage.x(),
        y: stage.y(),
        scaleX: stage.scaleX() || 1,
      };
      drawGrid(ctx, tr, stage.width(), stage.height(), s);
    },
    // Explicit hitFunc ensures Konva's bounding-rect cache is always the
    // stage rectangle — no chance of clipping the visual draw to a stale
    // bbox computed from earlier line strokes.
    hitFunc(ctx) {
      ctx.beginPath();
      ctx.rect(0, 0, stage.width(), stage.height());
      ctx.closePath();
    },
  });

  gridLayer.add(gridShape);

  // Add the layer to the stage then position it at index 1 (above bgLayer at 0,
  // below contentLayer). canvas-view adds layers in order: bgLayer(0),
  // contentLayer(1), overlayLayer(2), frameUiLayer(3). Adding gridLayer here
  // then moving it to zIndex 1 shifts contentLayer et al. up by one.
  stage.add(gridLayer);
  gridLayer.setZIndex(1);

  function redraw() {
    gridShape.width(stage.width());
    gridShape.height(stage.height());
    gridLayer.batchDraw();
  }

  // ── Subscribe to settings changes + stage resize ──────────────────────────
  const unsubSettings = onSettingsChange(redraw);
  const onResize = () => redraw();
  window.addEventListener('resize', onResize);

  // ── Initial draw ──────────────────────────────────────────────────────────
  redraw();

  return {
    /**
     * Redraw the grid after pan or zoom. Called by canvas-view.
     */
    onTransform() {
      redraw();
    },

    destroy() {
      unsubSettings();
      window.removeEventListener('resize', onResize);
      gridLayer.destroy();
    },
  };
}
