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
    return null;
  }

  function rasterizeText(text, st) {
    // Measure first
    const meas = window.document.createElement('canvas').getContext('2d');
    const fontSpec = `${text.weight} ${text.size}px "${text.font}", sans-serif`;
    meas.font = fontSpec;
    const lines = String(text.value || '').split('\n');
    const lineH = text.size * text.lineHeight;
    const widths = lines.map((ln) => meas.measureText(ln).width + (ln.length - 1) * (text.letterSpacing || 0));
    const w = Math.max(1, Math.ceil(Math.max(...widths) + 8));
    const h = Math.max(1, Math.ceil(lineH * lines.length + 8));
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.font = fontSpec;
    ctx.textBaseline = 'top';
    ctx.fillStyle = text.color || '#fff';
    ctx.textAlign = text.align || 'left';
    const xRef = text.align === 'center' ? w / 2 : text.align === 'right' ? w - 4 : 4;
    lines.forEach((ln, i) => {
      const y = 4 + i * lineH;
      if (text.letterSpacing && text.letterSpacing !== 0) {
        let x = xRef;
        for (const ch of ln) {
          ctx.fillText(ch, x, y);
          x += ctx.measureText(ch).width + text.letterSpacing;
        }
      } else {
        ctx.fillText(ln, xRef, y);
      }
    });
    st.naturalSize = { w, h };
    return ctx.getImageData(0, 0, w, h);
  }

  function applyEffectsPipeline(layer, st) {
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
    for (let i = 0; i < effects.length; i++) {
      const eff = effects[i];
      if (!eff.enabled) {
        // disabled effects don't contribute; cache mirrors prev
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
        const r = plugin.process(input, eff.params || {});
        out = r || input;
      } catch (err) {
        console.error('[plugin]', eff.pluginId, err);
        out = prev;
      }
      st.steps[i] = out;
      prev = out;
    }

    st.dirtyFromIndex = effects.length;

    // The "final" output is the last enabled effect's cache, or source.
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

  // Actual paint — called only from the RAF queue.
  function paintLayerSync(layer, st) {
    const finalImageData = applyEffectsPipeline(layer, st);
    if (!finalImageData) return;
    if (st.dstCanvas.width !== finalImageData.width || st.dstCanvas.height !== finalImageData.height) {
      st.dstCanvas.width = finalImageData.width;
      st.dstCanvas.height = finalImageData.height;
    }
    st.dstCanvas.getContext('2d').putImageData(finalImageData, 0, 0);
    st.image.image(st.dstCanvas);
    st.image.width(finalImageData.width);
    st.image.height(finalImageData.height);
    scheduleDraw();
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
    const image = new Konva.Image({
      image: null,
      listening: true,
      globalCompositeOperation: layer.blendMode,
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

  // Subscribe to document changes
  document.subscribe(async (event) => {
    switch (event.type) {
      case 'layer:added':
        await createLayerNodes(event.layer);
        break;
      case 'layer:removed':
        destroyLayerNodes(event.id);
        break;
      case 'layer:reordered':
        syncZOrder();
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
        scheduleDraw();
        break;
      }
      case 'layer:transform': {
        const layer = document.findLayer(event.id);
        if (layer) applyTransform(layer);
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
        }
        break;
      }
      case 'layer:active': {
        const layer = document.findLayer(event.id);
        const st = layer ? layerState.get(layer.id) : null;
        attachTransformer(st ? st.group : null);
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
        break;
      }
      case 'effect:propChanged': {
        const layer = document.findLayer(event.layerId);
        if (!layer) break;
        const st = layerState.get(event.layerId);
        if (!st) break;
        if (event.fromIndex >= 0) st.dirtyFromIndex = Math.min(st.dirtyFromIndex, event.fromIndex);
        paintLayer(layer, st);
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

  // Hook transformer drag/transform back into the document.
  function bindTransformerEvents() {
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
