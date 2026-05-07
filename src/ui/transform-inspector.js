// transform-inspector — read-only X / Y / W / H / rotation readout for the
// active layer, mounted in the footer's empty center area.
//
// First cut of Phase 21's "Transform inspector" task. Editable inputs +
// lock-aspect + reset are intentionally deferred to a follow-up — the
// readout alone closes the gap "user can't see exact coords without
// opening DevTools" which was the pain point.
//
// Wires only into events the document already emits:
//   layer:active        → active selection changed
//   layer:transform     → setLayerTransform fired
//   layer:added         → new layer (recompute if it's now active)
//   layer:removed       → active layer might have vanished
//   doc:loaded          → project replaced
// Hidden when no non-FX layer is active.

export function initTransformInspector({ document: doc, container }) {
  if (!container) return;

  container.classList.add('transform-inspector');
  container.innerHTML = `
    <span class="ti-cell ti-cell--xy" title="Layer position (world coords)">
      <span class="ti-key">X</span><span class="ti-val" data-key="x">—</span>
      <span class="ti-key">Y</span><span class="ti-val" data-key="y">—</span>
    </span>
    <span class="ti-sep" aria-hidden="true"></span>
    <span class="ti-cell ti-cell--wh" title="Layer size (natural × scale)">
      <span class="ti-key">W</span><span class="ti-val" data-key="w">—</span>
      <span class="ti-key">H</span><span class="ti-val" data-key="h">—</span>
    </span>
    <span class="ti-sep" aria-hidden="true"></span>
    <span class="ti-cell ti-cell--rot" title="Rotation">
      <span class="ti-key">∠</span><span class="ti-val" data-key="rot">—</span>
    </span>
  `;
  const cells = {
    x:   container.querySelector('[data-key="x"]'),
    y:   container.querySelector('[data-key="y"]'),
    w:   container.querySelector('[data-key="w"]'),
    h:   container.querySelector('[data-key="h"]'),
    rot: container.querySelector('[data-key="rot"]'),
  };

  function fmtNum(v) {
    if (!Number.isFinite(v)) return '—';
    // World pixels — integer is plenty of precision for a HUD.
    return Math.round(v).toString();
  }
  function fmtDeg(v) {
    if (!Number.isFinite(v)) return '—';
    // Wrap to (-180, 180] for readability — Konva can return arbitrary
    // negative or > 360 values after a few rotations.
    let d = v % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return `${d.toFixed(1)}°`;
  }

  function sync() {
    const layer = doc.activeLayer;
    const visible = !!(layer && layer.type !== 'fx');
    container.hidden = !visible;
    if (!visible) return;
    const t = layer.transform || {};
    const ns = layer.naturalSize || { w: 0, h: 0 };
    const sx = (typeof t.scaleX === 'number') ? t.scaleX : 1;
    const sy = (typeof t.scaleY === 'number') ? t.scaleY : 1;
    cells.x.textContent   = fmtNum(t.x);
    cells.y.textContent   = fmtNum(t.y);
    cells.w.textContent   = fmtNum(ns.w * Math.abs(sx));
    cells.h.textContent   = fmtNum(ns.h * Math.abs(sy));
    cells.rot.textContent = fmtDeg(t.rotation);
  }

  doc.subscribe((e) => {
    switch (e.type) {
      case 'layer:active':
      case 'layer:added':
      case 'layer:removed':
      case 'doc:loaded':
        sync();
        break;
      case 'layer:transform':
        // Only update if it's the active layer — saves a layout pass for
        // multi-drag where every layer fires its own transform event.
        if (e.id === doc.activeLayerId) sync();
        break;
      default:
        // ignore
    }
  });
  sync();

  return { sync, destroy() { container.classList.remove('transform-inspector'); container.innerHTML = ''; } };
}
