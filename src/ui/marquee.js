// Marquee selection — drag a rectangle on empty canvas to select
// multiple layers at once. Two modes via settings (`marqueeMode`):
//   • 'touch'   (default) — any overlap with the layer's bbox selects it.
//   • 'contain' — the layer's full bbox must lie inside the marquee.
//
// Honors:
//   • Locked + hidden layers are excluded.
//   • Shift+drag extends the existing selection rather than replacing.
//   • Cancelled by spacebar (panning takes over) or Esc.
//   • Group layers select as a single unit; no children are added when
//     a group qualifies — the user toggles its expand to step inside.

import Konva from 'konva';
import { setSelection, getSelection } from './selection-state.js';
import { getSettings } from './settings-popup.js';

export function attachMarquee({ stage, document: doc }) {
  const overlay = new Konva.Layer({ listening: false });
  stage.add(overlay);
  let rect = null;
  let startWorld = null;
  let active = false;
  let extendMode = false;
  let initialSelection = null;

  function ensureRect() {
    if (rect) return;
    const root = getComputedStyle(window.document.documentElement);
    const accent = root.getPropertyValue('--primary').trim() || '#8aff8c';
    // applyAccent in settings-popup.js publishes --primary-rgb as
    // "r, g, b"; we use it for the low-alpha fill so the marquee
    // tracks the user's chosen accent colour live.
    const rgb = root.getPropertyValue('--primary-rgb').trim() || '138, 255, 140';
    rect = new Konva.Rect({
      x: 0, y: 0, width: 0, height: 0,
      fill: `rgba(${rgb}, 0.10)`,
      stroke: accent,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      dash: [4, 3],
      listening: false,
    });
    overlay.add(rect);
  }

  function destroyRect() {
    if (rect) { rect.destroy(); rect = null; }
    overlay.batchDraw();
  }

  // Convert a stage pointer pos to world coords (matches the canvas-view
  // helpers — we don't import them to avoid the circular dependency).
  function worldFromPointer() {
    const p = stage.getPointerPosition();
    if (!p) return null;
    const sc = stage.scaleX() || 1;
    return { x: (p.x - stage.x()) / sc, y: (p.y - stage.y()) / sc };
  }

  function rectFrom(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
    };
  }

  function intersects(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }
  function contains(outer, inner) {
    return inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.w <= outer.x + outer.w
        && inner.y + inner.h <= outer.y + outer.h;
  }

  function start(e) {
    extendMode = !!e.evt.shiftKey;
    if (!extendMode && !e.evt.metaKey && !e.evt.ctrlKey) initialSelection = null;
    else initialSelection = getSelection();
    startWorld = worldFromPointer();
    if (!startWorld) return false;
    active = true;
    ensureRect();
    rect.position({ x: startWorld.x, y: startWorld.y });
    rect.size({ width: 0, height: 0 });
    overlay.batchDraw();
    return true;
  }

  function move() {
    if (!active || !startWorld) return;
    const cur = worldFromPointer();
    if (!cur) return;
    const r = rectFrom(startWorld, cur);
    rect.position({ x: r.x, y: r.y });
    rect.size({ width: r.w, height: r.h });
    overlay.batchDraw();
  }

  function end() {
    if (!active || !startWorld) { destroyRect(); active = false; return; }
    const cur = worldFromPointer();
    active = false;
    if (!cur) { destroyRect(); return; }
    const m = rectFrom(startWorld, cur);
    // Treat a tiny click-and-release as a no-op (don't clobber selection).
    if (m.w < 2 && m.h < 2) { destroyRect(); return; }
    const mode = (getSettings().marqueeMode || 'touch') === 'contain' ? 'contain' : 'touch';
    const matched = [];
    // Walk every TOP-LEVEL layer (groups counted as one unit). For
    // group children rendered inside the group's Konva.Group, the
    // group's getClientRect already encompasses them, so testing the
    // group is sufficient.
    for (const layer of doc.layers) {
      if (layer.parentGroupId) continue;     // skip group children
      if (layer.locked || !layer.visible) continue;
      if (layer.type === 'fx') continue;     // pseudo-layers
      // Per-layer-type bbox strategy:
      //   • image  → transform + naturalSize × scale (model-driven, exact)
      //   • vector → transform + naturalSize × scale (naturalSize = path bbox)
      //   • text   → Konva's getClientRect (honours the getSelfRect
      //              override that returns the tight content rect, since
      //              naturalSize is the padded canvas — too large)
      //   • group  → Konva's getClientRect on the union
      //   • rotated layers (any type) → Konva's getClientRect (axis-aligned
      //              bounding box of the rotated content)
      let wb = null;
      const tx = layer.transform?.x ?? 0;
      const ty = layer.transform?.y ?? 0;
      const sx = Math.abs(layer.transform?.scaleX ?? 1);
      const sy = Math.abs(layer.transform?.scaleY ?? 1);
      const rot = layer.transform?.rotation || 0;
      const useModelBbox =
        rot === 0
        && (layer.type === 'image' || layer.type === 'vector')
        && layer.naturalSize
        && layer.naturalSize.w > 0;
      if (useModelBbox) {
        wb = {
          x: tx,
          y: ty,
          w: layer.naturalSize.w * sx,
          h: layer.naturalSize.h * sy,
        };
      } else {
        const stageNode = stage.findOne((n) => n.id?.() === layer.id);
        if (!stageNode) continue;
        const contentLayer = stageNode.getLayer();
        const r = stageNode.getClientRect({ relativeTo: contentLayer });
        if (!r || !(r.width > 0) || !(r.height > 0)) continue;
        wb = { x: r.x, y: r.y, w: r.width, h: r.height };
      }
      const hit = mode === 'contain' ? contains(m, wb) : intersects(m, wb);
      if (hit) matched.push(layer.id);
    }
    let next;
    if (initialSelection) {
      next = new Set(initialSelection);
      for (const id of matched) next.add(id);
    } else {
      next = new Set(matched);
    }
    setSelection(next, matched[matched.length - 1] || null);
    destroyRect();
  }

  function cancel() {
    active = false;
    startWorld = null;
    initialSelection = null;
    destroyRect();
  }

  return { start, move, end, cancel, isActive: () => active };
}
