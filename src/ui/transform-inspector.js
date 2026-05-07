// transform-inspector — editable X / Y / W / H / rotation HUD for the
// active layer, mounted in the footer's right cluster (next to the
// ruler / grid / snap toggles).
//
// Phase 21 task. Was a read-only first-cut; this rewrite:
//   - Makes every value an editable <input type="number">. Enter or
//     blur commits; Escape reverts.
//   - Reads W / H from the live Konva group's getClientRect() rather
//     than naturalSize × scaleX — authoritative when Konva scales via
//     scale OR width/height, vector / text rasterise pad, and FX layer
//     bbox tricks. Falls back to the layer-model math when no Konva
//     node is reachable yet (race during creation).
//   - Subscribes to layer:active / layer:transform / layer:added /
//     layer:removed / doc:loaded — same set as before, plus a redraw
//     pulse via window.__slammer.snapRulers' coverage of stage:transform
//     so the W/H stays correct mid-scale (Konva fires 'transform'
//     during the gesture, not just transformend).
//
// Hidden when no non-FX layer is active.

export function initTransformInspector({ document: doc, container, getStage }) {
  if (!container) return;

  container.classList.add('transform-inspector');
  // Compact pill layout — same chrome as the surrounding zoom / ruler /
  // grid / snap buttons. Keys are inline-uppercase like "X", "Y", "W",
  // "H", "∠"; values are <input type="number"> with tabular numerics.
  container.innerHTML = `
    <span class="ti-cell"  title="X position (world coords) — Enter to commit, Esc to revert">
      <span class="ti-key">X</span>
      <input class="ti-val" type="number" data-key="x" step="1" disabled />
    </span>
    <span class="ti-cell"  title="Y position">
      <span class="ti-key">Y</span>
      <input class="ti-val" type="number" data-key="y" step="1" disabled />
    </span>
    <span class="ti-sep" aria-hidden="true"></span>
    <span class="ti-cell"  title="Width — set in world pixels (sets scaleX = W / natural width)">
      <span class="ti-key">W</span>
      <input class="ti-val" type="number" data-key="w" step="1" min="1" disabled />
    </span>
    <span class="ti-cell"  title="Height — set in world pixels (sets scaleY = H / natural height)">
      <span class="ti-key">H</span>
      <input class="ti-val" type="number" data-key="h" step="1" min="1" disabled />
    </span>
    <span class="ti-sep" aria-hidden="true"></span>
    <span class="ti-cell"  title="Rotation in degrees">
      <span class="ti-key">∠</span>
      <input class="ti-val ti-val--rot" type="number" data-key="rot" step="0.1" disabled />
    </span>
  `;
  const inputs = {
    x:   container.querySelector('input[data-key="x"]'),
    y:   container.querySelector('input[data-key="y"]'),
    w:   container.querySelector('input[data-key="w"]'),
    h:   container.querySelector('input[data-key="h"]'),
    rot: container.querySelector('input[data-key="rot"]'),
  };

  // ───────── helpers ──────────────────────────────────────────────────
  function fmtNum(v) {
    if (!Number.isFinite(v)) return '';
    return Math.round(v).toString();
  }
  function fmtDeg(v) {
    if (!Number.isFinite(v)) return '0';
    let d = v % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    // 1 decimal — matches the live rotater readout pill.
    return d.toFixed(1);
  }
  function getKonvaGroup(layerId) {
    const stage = getStage?.();
    if (!stage || !layerId) return null;
    return stage.findOne(`#${CSS.escape(layerId)}`) || null;
  }
  // Authoritative bbox: ask Konva. Returns world-space rect (the
  // contentLayer has no transform, so relativeTo:contentLayer ≡ world).
  // Falls back to model math when the Konva node isn't mounted yet.
  function readBbox(layer) {
    const grp = getKonvaGroup(layer.id);
    const t = layer.transform || {};
    if (!grp) {
      // Fallback path — used during the brief window between layer:added
      // and createLayerNodes finishing. naturalSize × scale matches what
      // the visible bbox WILL be once mounted.
      const ns = layer.naturalSize || { w: 0, h: 0 };
      const sx = (typeof t.scaleX === 'number') ? t.scaleX : 1;
      const sy = (typeof t.scaleY === 'number') ? t.scaleY : 1;
      return { x: t.x || 0, y: t.y || 0, w: ns.w * Math.abs(sx), h: ns.h * Math.abs(sy) };
    }
    // skipTransform:false → includes group's x/y/scale/rotation. With
    // rotation, the rect is the AABB which over-estimates by up to √2×.
    // For un-rotated layers (the common case) it's exact.
    const r = grp.getClientRect({ skipTransform: false });
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }

  // ───────── commit handlers ──────────────────────────────────────────
  // X / Y are direct transform writes. W / H translate to scaleX / Y =
  // newSize / naturalSize. Rotation is a direct transform write. All go
  // through doc.setLayerTransform → emits layer:transform → history
  // commits via the existing PROP_EVENTS pipeline.
  function commit(key, raw) {
    const layer = doc.activeLayer;
    if (!layer || layer.locked) return false;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return false;
    const t = layer.transform || {};
    if (key === 'x') {
      doc.setLayerTransform(layer.id, { x: v });
    } else if (key === 'y') {
      doc.setLayerTransform(layer.id, { y: v });
    } else if (key === 'rot') {
      doc.setLayerTransform(layer.id, { rotation: v });
    } else if (key === 'w' || key === 'h') {
      const ns = layer.naturalSize;
      if (!ns || ns.w <= 0 || ns.h <= 0) return false;
      const denom = key === 'w' ? ns.w : ns.h;
      const nextScale = v / denom;
      // For rotated layers, getClientRect's W/H is the AABB. We don't
      // try to invert that — the user typed a NUMBER they want to see;
      // we set scale to make natural × scale match, accepting that a
      // 45°-rotated layer's AABB differs from typed value by √2×. That's
      // tomorrow's problem.
      doc.setLayerTransform(layer.id, key === 'w' ? { scaleX: nextScale } : { scaleY: nextScale });
    }
    return true;
  }
  function attachInput(key, input) {
    let inFlight = null;     // raw text mid-edit so sync() can leave alone
    input.addEventListener('focus', () => {
      inFlight = input.value;
      input.select();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); inFlight = null; sync(); input.blur(); }
    });
    input.addEventListener('blur', () => {
      const raw = input.value;
      const wasMid = inFlight !== null;
      inFlight = null;
      if (!wasMid) return;        // never focused → nothing to commit
      const ok = commit(key, raw);
      if (!ok) sync();           // rejected → restore
      // Successful commit → setLayerTransform fires layer:transform →
      // sync() runs from the subscription. No need to call here.
    });
    // Detect "is the input currently focused" so sync() can skip
    // overwriting the user's typing.
    input._inFlight = () => input === window.document.activeElement;
  }
  for (const [k, el] of Object.entries(inputs)) attachInput(k, el);

  // ───────── render ───────────────────────────────────────────────────
  function sync() {
    const layer = doc.activeLayer;
    const visible = !!(layer && layer.type !== 'fx');
    container.hidden = !visible;
    if (!visible) return;
    const t = layer.transform || {};
    const r = readBbox(layer);
    // Don't trample the input the user is currently editing.
    if (!inputs.x._inFlight())   inputs.x.value   = fmtNum(t.x);
    if (!inputs.y._inFlight())   inputs.y.value   = fmtNum(t.y);
    if (!inputs.w._inFlight())   inputs.w.value   = fmtNum(r.w);
    if (!inputs.h._inFlight())   inputs.h.value   = fmtNum(r.h);
    if (!inputs.rot._inFlight()) inputs.rot.value = fmtDeg(t.rotation);
    // Disable when locked; W/H disabled when there's no naturalSize to
    // divide by (groups, mid-creation states).
    const ns = layer.naturalSize;
    const hasSize = !!(ns && ns.w > 0 && ns.h > 0);
    inputs.x.disabled = !!layer.locked;
    inputs.y.disabled = !!layer.locked;
    inputs.rot.disabled = !!layer.locked;
    inputs.w.disabled = !!layer.locked || !hasSize;
    inputs.h.disabled = !!layer.locked || !hasSize;
  }

  doc.subscribe((e) => {
    switch (e.type) {
      case 'layer:active':
      case 'layer:added':
      case 'layer:removed':
      case 'layer:propChanged':       // catches layer.locked changes
      case 'layer:sourceChanged':     // image-layer naturalSize update
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

  // Konva fires 'transform' on the contentLayer DURING the drag/scale,
  // not just on transformend. Hook it so the HUD updates live while the
  // user is dragging a transformer corner. Falls back to model-only
  // updates when getStage isn't available.
  // Konva fires 'transform' on the contentLayer DURING the drag/scale,
  // not just on transformend. Hook the stage so the HUD updates live
  // while the user is dragging a transformer corner — without this,
  // W/H stayed at the pre-drag value until release.
  const stage = getStage?.();
  if (stage) {
    stage.on('dragmove.tx-inspector transform.tx-inspector', () => {
      if (doc.activeLayer && doc.activeLayer.type !== 'fx') sync();
    });
  }
  sync();

  return { sync, destroy() { container.classList.remove('transform-inspector'); container.innerHTML = ''; } };
}
