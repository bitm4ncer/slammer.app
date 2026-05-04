// Renderer — bridges Document to Konva and runs the per-layer effect pipeline.

import Konva from 'konva';
import { getPlugin } from '../plugins/registry.js';

export function createRenderer({ stage, contentLayer, document, getStage }) {
  // Per-layer state: { group, image, srcCanvas, dstCanvas, sourceImageData, steps, dirtyFromIndex, naturalSize }
  const layerState = new Map();
  let transformer = null;
  let pendingRedraw = null;

  // Per-frame paint queue. Multiple param tweaks within one frame collapse to a single paint.
  const paintQueue = new Set();
  let paintScheduled = false;
  function schedulePaint(layerId) {
    paintQueue.add(layerId);
    if (paintScheduled) return;
    paintScheduled = true;
    requestAnimationFrame(runPaintQueue);
  }
  function runPaintQueue() {
    paintScheduled = false;
    const ids = Array.from(paintQueue);
    paintQueue.clear();
    for (const id of ids) {
      const layer = document.findLayer(id);
      const st = layerState.get(id);
      if (layer && st) paintLayerSync(layer, st);
    }
  }

  function ensureTransformer() {
    if (transformer) return transformer;
    transformer = new Konva.Transformer({
      rotateEnabled: true,
      anchorStroke: '#8aff8c',
      anchorFill: '#1e1e1e',
      anchorSize: 9,
      borderStroke: '#8aff8c',
      borderDash: [4, 4],
      keepRatio: false,
      flipEnabled: false,
    });
    contentLayer.add(transformer);
    return transformer;
  }

  function attachTransformer(node) {
    ensureTransformer();
    transformer.nodes(node ? [node] : []);
    // Tint handles using live --ctx-accent (which already respects the
    // "custom layer colours" setting set in main.js).
    if (node) {
      const rootStyle = getComputedStyle(window.document.documentElement);
      const accent = rootStyle.getPropertyValue('--ctx-accent').trim()
        || rootStyle.getPropertyValue('--primary').trim()
        || '#8aff8c';
      transformer.anchorStroke(accent);
      transformer.borderStroke(accent);
    }
    transformer.moveToTop();
    contentLayer.batchDraw();
  }

  function scheduleDraw() {
    if (pendingRedraw) return;
    pendingRedraw = requestAnimationFrame(() => {
      pendingRedraw = null;
      contentLayer.batchDraw();
    });
  }

  function makeCanvas(w, h) {
    const c = window.document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  }

  async function loadImageBitmap(source) {
    if (source instanceof Blob) {
      return await createImageBitmap(source);
    }
    if (typeof source === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = source;
      await img.decode();
      return img;
    }
    return null;
  }

  async function rasterizeSource(layer, st) {
    if (layer.type === 'image') {
      const bmp = await loadImageBitmap(layer.source);
      if (!bmp) return null;
      const w = bmp.width || bmp.naturalWidth;
      const h = bmp.height || bmp.naturalHeight;
      const c = makeCanvas(w, h);
      c.getContext('2d').drawImage(bmp, 0, 0);
      st.naturalSize = { w, h };
      return c.getContext('2d').getImageData(0, 0, w, h);
    }
    if (layer.type === 'text') {
      return rasterizeText(layer.text, st);
    }
    if (layer.type === 'fx') {
      // FX layer's "source" is the composite of every visible layer beneath it.
      // Re-computed lazily in paintLayerSync; this initial pass returns an empty
      // 1×1 placeholder so the layer has valid dimensions before the first paint.
      const c = makeCanvas(1, 1);
      st.naturalSize = { w: 1, h: 1 };
      return c.getContext('2d').getImageData(0, 0, 1, 1);
    }
    return null;
  }

  // Composite every visible layer that sits BELOW the given layer in the doc's
  // z-order, into a single canvas covering the union bounding box. Used as the
  // source for an FX layer's effect pipeline.
  //
  // CRITICAL: read positions from the LIVE Konva groups (st.group.x() etc.)
  // rather than layer.transform.* (which is only updated on dragend). Mixing
  // the two sources during a live drag produces a ghosted composite where the
  // bbox is sized for the new position but the pixels draw at the old one.
  function compositeLayersBelow(layer) {
    const idx = document.layers.indexOf(layer);
    if (idx <= 0) return null;
    const below = document.layers.slice(0, idx).filter((l) => l.visible);
    const stRefs = below.map((l) => ({ layer: l, st: layerState.get(l.id) }))
      .filter((x) => x.st && x.st.dstCanvas);
    if (!stRefs.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { st } of stRefs) {
      const r = st.group.getClientRect({ relativeTo: contentLayer });
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
    if (!isFinite(minX)) return null;
    const w = Math.ceil(maxX - minX);
    const h = Math.ceil(maxY - minY);
    if (w <= 0 || h <= 0) return null;

    const out = makeCanvas(w, h);
    const octx = out.getContext('2d');
    octx.translate(-minX, -minY);
    for (const { st, layer: l } of stRefs) {
      // Live Konva state — matches what the user actually sees on screen.
      const gx = st.group.x();
      const gy = st.group.y();
      const sx = st.group.scaleX();
      const sy = st.group.scaleY();
      const rot = st.group.rotation();
      octx.save();
      octx.globalCompositeOperation = l.blendMode || 'source-over';
      octx.globalAlpha = (l.opacity ?? 1) * (st.group.opacity() ?? 1);
      octx.translate(gx, gy);
      octx.rotate((rot * Math.PI) / 180);
      octx.scale(sx, sy);
      octx.drawImage(st.dstCanvas, 0, 0);
      octx.restore();
    }
    // Position the FX layer's group so its composite aligns with the canvas.
    const st = layerState.get(layer.id);
    if (st) st.fxOrigin = { x: minX, y: minY };
    return octx.getImageData(0, 0, w, h);
  }

  function rasterizeText(text, st) {
    const meas = window.document.createElement('canvas').getContext('2d');
    const fontSpec = `${text.weight} ${text.size}px "${text.font}", sans-serif`;
    meas.font = fontSpec;
    const ls = +text.letterSpacing || 0;
    const lineH = text.size * (+text.lineHeight || 1.2);
    const align = text.align || 'left';
    const mode = text.mode || 'text';

    // Build lines: split on \n, then word-wrap each line to boxWidth in textBox mode.
    const rawLines = String(text.value || '').split('\n');
    const lines = mode === 'textBox'
      ? rawLines.flatMap((ln) => wrapToWidth(meas, ln, ls, Math.max(40, +text.boxWidth || 600)))
      : rawLines;

    // Measure each line's actual rendered width (handles negative tracking by clamping at >=0).
    const lineWidths = lines.map((ln) => measureLineWidth(meas, ln, ls));

    // Filter-safe padding so blur etc. has room to expand without being clipped.
    // Heuristic: half a font-size each side, capped to a sensible range.
    const pad = Math.min(96, Math.max(16, Math.round(text.size * 0.5)));

    // Vertical extent: top half of size on first line + (n-1) lineH steps + descender on last line.
    // Use 1.2× size as the visual line-box (handles descenders even when lineHeight < 1).
    const visualLineBox = text.size * 1.2;
    const contentH = Math.max(visualLineBox, (lines.length - 1) * lineH + visualLineBox);

    // Horizontal extent: max line width (tracked).
    const contentW = mode === 'textBox'
      ? Math.max(40, +text.boxWidth || 600)
      : Math.max(1, Math.ceil(Math.max(...lineWidths, 1)));

    const w = Math.max(1, Math.ceil(contentW + pad * 2));
    const h = Math.max(1, Math.ceil(contentH + pad * 2));

    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.font = fontSpec;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = text.color || '#fff';
    ctx.textAlign = align;

    // Baseline of the FIRST line: top padding + ascent (~size). After that, advance by lineH.
    const firstBaseline = pad + text.size * 0.85;
    // Reference X depends on alignment.
    const xRef = align === 'center' ? pad + contentW / 2
               : align === 'right'  ? pad + contentW
               : pad;

    lines.forEach((ln, i) => {
      const baseline = firstBaseline + i * lineH;
      if (ls !== 0) {
        // Render character-by-character so we can apply tracking. Honour alignment ourselves.
        const lineWidth = measureLineWidth(meas, ln, ls);
        let x = align === 'center' ? xRef - lineWidth / 2
              : align === 'right'  ? xRef - lineWidth
              :                      xRef;
        ctx.textAlign = 'left';
        for (const ch of ln) {
          ctx.fillText(ch, x, baseline);
          x += meas.measureText(ch).width + ls;
        }
        ctx.textAlign = align;
      } else {
        ctx.fillText(ln, xRef, baseline);
      }
    });

    st.naturalSize = { w, h };
    return ctx.getImageData(0, 0, w, h);
  }

  // Greedy word-wrap to a target pixel width, respecting per-character tracking.
  function wrapToWidth(meas, line, ls, targetW) {
    if (!line) return [''];
    const words = line.split(/(\s+)/); // keep spaces as separators
    const out = [];
    let cur = '';
    for (const tok of words) {
      const candidate = cur + tok;
      const w = measureLineWidth(meas, candidate, ls);
      if (w > targetW && cur.trim().length) {
        out.push(cur.replace(/\s+$/, ''));
        cur = tok.replace(/^\s+/, '');
      } else {
        cur = candidate;
      }
    }
    if (cur.length) out.push(cur);
    return out.length ? out : [''];
  }

  function measureLineWidth(meas, line, ls) {
    if (!line) return 0;
    let w = meas.measureText(line).width;
    if (ls && line.length > 1) w += (line.length - 1) * ls;
    return Math.max(0, w);
  }

  async function applyEffectsPipeline(layer, st) {
    if (!st.sourceImageData) return null;
    const { effects } = layer;
    const enabledIndices = effects.map((e, i) => (e.enabled ? i : -1)).filter((i) => i >= 0);

    // Trim cache to current effects length.
    if (st.steps.length > effects.length) st.steps.length = effects.length;
    while (st.steps.length < effects.length) st.steps.push(null);

    let prev = st.sourceImageData;
    let dirty = st.dirtyFromIndex;
    if (!Number.isFinite(dirty) || dirty < 0) dirty = 0;

    // Walk all steps, but only re-run from dirty onward; reuse prior cached output otherwise.
    // Plugins may be sync OR async — `await` on a non-Promise returns the value unchanged.
    for (let i = 0; i < effects.length; i++) {
      const eff = effects[i];
      if (!eff.enabled) {
        st.steps[i] = prev;
        continue;
      }
      if (i < dirty && st.steps[i]) {
        prev = st.steps[i];
        continue;
      }
      const plugin = getPlugin(eff.pluginId);
      if (!plugin) {
        st.steps[i] = prev;
        continue;
      }
      const input = cloneImageData(prev);
      let out = prev;
      try {
        const r = await plugin.process(input, eff.params || {});
        out = r || input;
      } catch (err) {
        console.error('[plugin]', eff.pluginId, err);
        out = prev;
      }
      st.steps[i] = out;
      prev = out;
    }

    st.dirtyFromIndex = effects.length;
    const last = enabledIndices.length ? st.steps[enabledIndices[enabledIndices.length - 1]] : st.sourceImageData;
    return last || st.sourceImageData;
  }

  function cloneImageData(src) {
    const out = new ImageData(src.width, src.height);
    out.data.set(src.data);
    return out;
  }

  // Public-ish: queue a layer for repaint on the next animation frame.
  function paintLayer(layer, st) {
    schedulePaint(layer.id);
  }

  // Actual paint — called only from the RAF queue. Async-friendly: when an effect
  // returns a Promise (e.g. JPEG using the browser's real encoder), we await it.
  async function paintLayerSync(layer, st) {
    // FX layers re-source from the composite of layers below before each paint.
    if (layer.type === 'fx') {
      const composite = compositeLayersBelow(layer);
      if (composite) {
        st.sourceImageData = composite;
        st.naturalSize = { w: composite.width, h: composite.height };
        st.dirtyFromIndex = 0; // composite changed → re-run all effects
        // Position the FX group so its composite renders at the same world coords
        // as the underlying layers (compositeLayersBelow stores fxOrigin).
        if (st.fxOrigin) {
          st.group.position({ x: st.fxOrigin.x, y: st.fxOrigin.y });
          // Reflect into the layer model so transform feels stable when user drags.
          layer.transform.x = st.fxOrigin.x;
          layer.transform.y = st.fxOrigin.y;
        }
      } else {
        // Nothing below to composite — leave the FX layer empty.
        const empty = new ImageData(1, 1);
        st.sourceImageData = empty;
        st.dirtyFromIndex = 0;
      }
    }
    const finalImageData = await applyEffectsPipeline(layer, st);
    if (!finalImageData) return;
    const dimsChanged =
      st.image.width() !== finalImageData.width ||
      st.image.height() !== finalImageData.height;
    if (st.dstCanvas.width !== finalImageData.width || st.dstCanvas.height !== finalImageData.height) {
      st.dstCanvas.width = finalImageData.width;
      st.dstCanvas.height = finalImageData.height;
    }
    st.dstCanvas.getContext('2d').putImageData(finalImageData, 0, 0);
    st.image.image(st.dstCanvas);
    st.image.width(finalImageData.width);
    st.image.height(finalImageData.height);
    if (dimsChanged && transformer && document.activeLayerId === layer.id) {
      transformer.forceUpdate();
    }
    syncFxVisibility();
    // After a non-FX layer finishes painting, every FX layer above it must
    // re-composite — its source-from-below was potentially stale (e.g. just
    // after doc:loaded the underlying layers' dstCanvases are still 1×1 until
    // their first async paint completes; without this hop the FX bitmap would
    // render with the moved/restored layer missing).
    if (layer.type !== 'fx') {
      const idx = document.layers.indexOf(layer);
      if (idx >= 0) {
        for (let i = idx + 1; i < document.layers.length; i++) {
          const above = document.layers[i];
          if (above.type !== 'fx') continue;
          const aboveSt = layerState.get(above.id);
          if (!aboveSt) continue;
          aboveSt.dirtyFromIndex = 0;
          paintLayer(above, aboveSt);
        }
      }
    }
    scheduleDraw();
  }

  // FX layers are "invisible pseudo-layers" — they don't grab pointer events.
  // Their bitmap (the modified composite of layers below) draws on top of the
  // underlying groups; with listening: false on the FX image, clicks fall through
  // so the user can still click / drag any layer beneath an FX layer on canvas.
  function syncFxVisibility() {
    document.layers.forEach((l) => {
      const st = layerState.get(l.id);
      if (!st) return;
      st.group.visible(!!l.visible);
      if (l.type === 'fx') {
        st.image.listening(false);
        st.group.listening(false);
        st.group.draggable(false);
      }
    });
  }

  async function createLayerNodes(layer) {
    const group = new Konva.Group({
      id: layer.id,
      x: layer.transform.x,
      y: layer.transform.y,
      scaleX: layer.transform.scaleX,
      scaleY: layer.transform.scaleY,
      rotation: layer.transform.rotation,
      opacity: layer.opacity,
      visible: layer.visible,
      draggable: true,
      name: 'slammer-layer',
    });
    // Initialise with finite dimensions so the Transformer (which can attach
    // synchronously below, before paintLayerSync runs on the next frame) has
    // valid bounds to compute anchor positions from. Without this, an Image
    // with undefined width/height makes Konva emit dozens of "NaN is not a
    // valid value" warnings at startup. paintLayerSync() overwrites these
    // with the rasterised size on the first paint.
    const initW = Math.max(1, layer.naturalSize?.w | 0 || 1);
    const initH = Math.max(1, layer.naturalSize?.h | 0 || 1);
    const image = new Konva.Image({
      image: null,
      listening: true,
      globalCompositeOperation: layer.blendMode,
      width: initW,
      height: initH,
    });
    image._slammerLayerId = layer.id;
    group.add(image);
    contentLayer.add(group);

    const st = {
      group,
      image,
      dstCanvas: makeCanvas(1, 1),
      sourceImageData: null,
      steps: [],
      dirtyFromIndex: 0,
      naturalSize: null,
    };
    layerState.set(layer.id, st);

    // Decode source -> sourceImageData
    const imgData = await rasterizeSource(layer, st);
    if (imgData) {
      st.sourceImageData = imgData;
      st.dirtyFromIndex = 0;
      paintLayer(layer, st);

      // If transform never set explicitly, center the layer in the current viewport.
      const stageRef = getStage();
      if (layer.transform.x === 0 && layer.transform.y === 0 && layer.naturalSize == null) {
        const stageScale = stageRef.scaleX();
        const worldW = stageRef.width() / stageScale;
        const worldH = stageRef.height() / stageScale;
        const cx = (worldW - imgData.width) / 2 - stageRef.x() / stageScale;
        const cy = (worldH - imgData.height) / 2 - stageRef.y() / stageScale;
        layer.transform.x = cx;
        layer.transform.y = cy;
        group.position({ x: cx, y: cy });
      }
      layer.naturalSize = st.naturalSize;
    }

    syncZOrder();
    if (document.activeLayerId === layer.id) attachTransformer(group);
    return st;
  }

  function destroyLayerNodes(id) {
    const st = layerState.get(id);
    if (!st) return;
    if (transformer && transformer.nodes().includes(st.group)) attachTransformer(null);
    st.group.destroy();
    layerState.delete(id);
    scheduleDraw();
  }

  function syncZOrder() {
    document.layers.forEach((layer, idx) => {
      const st = layerState.get(layer.id);
      if (st) st.group.zIndex(idx);
    });
    if (transformer) transformer.moveToTop();
  }

  function applyLayerProps(layer) {
    const st = layerState.get(layer.id);
    if (!st) return;
    st.group.visible(layer.visible);
    st.group.opacity(layer.opacity);
    st.image.globalCompositeOperation(layer.blendMode);
  }

  function applyTransform(layer) {
    const st = layerState.get(layer.id);
    if (!st) return;
    st.group.position({ x: layer.transform.x, y: layer.transform.y });
    st.group.scale({ x: layer.transform.scaleX, y: layer.transform.scaleY });
    st.group.rotation(layer.transform.rotation);
    scheduleDraw();
  }

  function reprocessLayer(layer) {
    const st = layerState.get(layer.id);
    if (!st) return;
    paintLayer(layer, st);
  }

  function reprocessAll() {
    for (const layer of document.layers) {
      const st = layerState.get(layer.id);
      if (st) {
        st.dirtyFromIndex = 0;
        paintLayer(layer, st);
      }
    }
  }

  // Repaint every FX layer that sits ABOVE the given layer index. Used whenever
  // an underlying layer changes so the FX layer's source-from-composite refreshes.
  function repaintFxAbove(changedLayerId) {
    const idx = document.layers.findIndex((l) => l.id === changedLayerId);
    if (idx < 0) return;
    for (let i = idx + 1; i < document.layers.length; i++) {
      const l = document.layers[i];
      if (l.type !== 'fx') continue;
      const st = layerState.get(l.id);
      if (!st) continue;
      st.dirtyFromIndex = 0; // composite-below changed → re-run from start
      paintLayer(l, st);
    }
  }

  // Subscribe to document changes
  document.subscribe(async (event) => {
    switch (event.type) {
      case 'layer:added':
        await createLayerNodes(event.layer);
        repaintFxAbove(event.layer.id);
        syncFxVisibility();
        break;
      case 'layer:removed': {
        const removedIdx = -1; // already removed; just refresh all FX
        destroyLayerNodes(event.id);
        for (const l of document.layers) if (l.type === 'fx') {
          const st = layerState.get(l.id);
          if (st) { st.dirtyFromIndex = 0; paintLayer(l, st); }
        }
        syncFxVisibility();
        break;
      }
      case 'layer:reordered':
        syncZOrder();
        for (const l of document.layers) if (l.type === 'fx') {
          const st = layerState.get(l.id);
          if (st) { st.dirtyFromIndex = 0; paintLayer(l, st); }
        }
        syncFxVisibility();
        scheduleDraw();
        break;
      case 'layer:propChanged': {
        const layer = document.findLayer(event.id);
        if (layer) applyLayerProps(layer);
        // Re-tint transformer from live --ctx-accent (honours custom-colours toggle).
        if (event.prop === 'accentColor' && document.activeLayerId === event.id && transformer) {
          const st = layerState.get(event.id);
          if (st) attachTransformer(st.group);
        }
        // Visibility / opacity / blendMode of an underlying layer changes the composite.
        if (['visible', 'opacity', 'blendMode'].includes(event.prop)) {
          repaintFxAbove(event.id);
          if (event.prop === 'visible') syncFxVisibility();
        }
        scheduleDraw();
        break;
      }
      case 'layer:transform': {
        const layer = document.findLayer(event.id);
        if (layer) applyTransform(layer);
        // Moving / scaling / rotating an underlying layer changes the composite.
        repaintFxAbove(event.id);
        break;
      }
      case 'layer:sourceChanged': {
        const layer = document.findLayer(event.id);
        if (!layer) break;
        const st = layerState.get(event.id);
        if (!st) break;
        const imgData = await rasterizeSource(layer, st);
        if (imgData) {
          st.sourceImageData = imgData;
          st.dirtyFromIndex = 0;
          paintLayer(layer, st);
          repaintFxAbove(event.id);
        }
        break;
      }
      case 'layer:textChanged': {
        const layer = document.findLayer(event.id);
        if (!layer) break;
        const st = layerState.get(event.id);
        if (!st) break;
        const imgData = await rasterizeSource(layer, st);
        if (imgData) {
          st.sourceImageData = imgData;
          st.dirtyFromIndex = 0;
          paintLayer(layer, st);
          repaintFxAbove(event.id);
        }
        break;
      }
      case 'layer:active': {
        const layer = document.findLayer(event.id);
        const st = layer ? layerState.get(layer.id) : null;
        // FX layers are pseudo-layers — no selection handles, no on-canvas
        // transform. They're just position markers in the stack.
        if (layer?.type === 'fx') attachTransformer(null);
        else attachTransformer(st ? st.group : null);
        break;
      }
      case 'effect:added':
      case 'effect:removed':
      case 'effect:reordered': {
        const layer = document.findLayer(event.layerId);
        if (!layer) break;
        const st = layerState.get(event.layerId);
        if (!st) break;
        const fromIndex = event.atIndex ?? event.fromIndex ?? 0;
        st.dirtyFromIndex = Math.min(st.dirtyFromIndex, fromIndex);
        paintLayer(layer, st);
        if (layer.type !== 'fx') repaintFxAbove(layer.id);
        break;
      }
      case 'effect:propChanged': {
        const layer = document.findLayer(event.layerId);
        if (!layer) break;
        const st = layerState.get(event.layerId);
        if (!st) break;
        if (event.fromIndex >= 0) st.dirtyFromIndex = Math.min(st.dirtyFromIndex, event.fromIndex);
        paintLayer(layer, st);
        // An effect param change on a non-FX layer changes its visible output,
        // so any FX layer above must re-composite.
        if (layer.type !== 'fx') repaintFxAbove(layer.id);
        break;
      }
      case 'doc:loaded':
        // Tear down all layer state, then rebuild from document.
        for (const id of Array.from(layerState.keys())) destroyLayerNodes(id);
        for (const layer of document.layers) await createLayerNodes(layer);
        if (document.activeLayerId) {
          const st = layerState.get(document.activeLayerId);
          if (st) attachTransformer(st.group);
        }
        scheduleDraw();
        break;
    }
  });

  // Hook transformer drag/transform back into the document. We listen to BOTH
  // the per-frame events (dragmove / transform) and the commit events
  // (dragend / transformend):
  //   • Per-frame  → repaint FX layers live so the modified composite follows
  //                  the layer being moved/resized in real time. Throttled to
  //                  one rAF per event burst so heavy filters don't choke.
  //   • Commit     → write the new transform into the doc model (history,
  //                  autosave, layer:transform listeners).
  let liveFxRaf = null;
  function scheduleLiveFxRecompute() {
    if (liveFxRaf) return;
    liveFxRaf = requestAnimationFrame(() => {
      liveFxRaf = null;
      for (const l of document.layers) {
        if (l.type !== 'fx') continue;
        const st = layerState.get(l.id);
        if (!st) continue;
        st.dirtyFromIndex = 0;
        paintLayer(l, st);
      }
    });
  }

  // Track which underlying layer is currently being dragged/transformed so we can
  // hide its raw image while a live FX preview shows the modified composite at
  // the new position. Avoids the "raw layer here, FX bitmap there" double-image.
  let liveDragLayerId = null;

  function isLayerUnderTopFx(layerId) {
    let topmostFxIdx = -1;
    document.layers.forEach((l, i) => { if (l.type === 'fx' && l.visible) topmostFxIdx = i; });
    if (topmostFxIdx < 0) return false;
    const idx = document.layers.findIndex((l) => l.id === layerId);
    return idx >= 0 && idx < topmostFxIdx;
  }

  function bindTransformerEvents() {
    contentLayer.on('dragstart transformstart', (e) => {
      const target = e.target;
      const layerId = target.id?.() || target._slammerLayerId;
      const layer = document.findLayer(layerId) || (target.parent && document.findLayer(target.parent.id?.()));
      if (!layer || layer.type === 'fx') return;
      // Only bother hiding when there's actually an FX layer above this one.
      if (!isLayerUnderTopFx(layer.id)) return;
      liveDragLayerId = layer.id;
      const st = layerState.get(layer.id);
      if (st) st.image.opacity(0);
    });
    contentLayer.on('dragmove transform', (e) => {
      const target = e.target;
      const layerId = target.id?.() || target._slammerLayerId;
      const layer = document.findLayer(layerId) || (target.parent && document.findLayer(target.parent.id?.()));
      if (layer?.type === 'fx') return;
      scheduleLiveFxRecompute();
    });
    contentLayer.on('dragend transformend', (e) => {
      const target = e.target;
      const layerId = target.id?.() || target._slammerLayerId;
      const layer = document.findLayer(layerId) || (target.parent && document.findLayer(target.parent.id?.()));
      if (!layer) return;
      const group = layer.id === layerId ? target : target.parent;
      if (!group) return;
      document.setLayerTransform(layer.id, {
        x: group.x(),
        y: group.y(),
        scaleX: group.scaleX(),
        scaleY: group.scaleY(),
        rotation: group.rotation(),
      });
      // Restore the dragged layer's visibility now that the FX layer's bitmap
      // covers the final position.
      if (liveDragLayerId) {
        const st = layerState.get(liveDragLayerId);
        if (st) st.image.opacity(1);
        liveDragLayerId = null;
        scheduleDraw();
      }
    });
  }
  bindTransformerEvents();

  return {
    layerState,
    attachTransformer,
    syncZOrder,
    reprocessLayer,
    reprocessAll,
    scheduleDraw,
    flattenVisible,
  };

  // ---------- Helpers exposed for export-png ----------
  function flattenVisible({ background = null } = {}) {
    // Compute bounding box of all visible layers, render to single canvas.
    const visible = document.layers.filter((l) => l.visible);
    if (!visible.length) return null;

    const stRefs = visible.map((l) => ({ layer: l, st: layerState.get(l.id) })).filter((x) => x.st && x.st.dstCanvas);
    if (!stRefs.length) return null;

    // Use Konva's clientRect on each group for bbox in stage coordinates.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { st } of stRefs) {
      const r = st.group.getClientRect({ relativeTo: contentLayer });
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
    if (!isFinite(minX)) return null;

    const w = Math.ceil(maxX - minX);
    const h = Math.ceil(maxY - minY);
    if (w <= 0 || h <= 0) return null;

    const out = makeCanvas(w, h);
    const octx = out.getContext('2d');
    if (background && background !== 'transparent') {
      octx.fillStyle = background;
      octx.fillRect(0, 0, w, h);
    }
    octx.translate(-minX, -minY);
    for (const { st, layer } of stRefs) {
      const sx = layer.transform.scaleX, sy = layer.transform.scaleY;
      octx.save();
      octx.globalCompositeOperation = layer.blendMode || 'source-over';
      octx.globalAlpha = layer.opacity ?? 1;
      octx.translate(layer.transform.x, layer.transform.y);
      octx.rotate(((layer.transform.rotation || 0) * Math.PI) / 180);
      octx.scale(sx, sy);
      octx.drawImage(st.dstCanvas, 0, 0);
      octx.restore();
    }
    return out;
  }
}
