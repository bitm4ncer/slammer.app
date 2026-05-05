// Document — the editable state container.
// Mutate via methods so listeners can react with precise change events.

import { createImageLayer, createTextLayer, createFxLayer, createVectorLayer } from './layer.js';

const uid = () => crypto.randomUUID();

export function createDocument() {
  const state = {
    version: 1,
    name: 'Untitled',
    canvasBackground: { type: 'transparent' },
    layers: [],
    activeLayerId: null,
    exportFrame: null,
  };

  const listeners = new Set();
  const emit = (event) => listeners.forEach((fn) => fn(event));

  const findIndex = (id) => state.layers.findIndex((l) => l.id === id);
  const findLayer = (id) => state.layers.find((l) => l.id === id) || null;

  return {
    get state() { return state; },
    get layers() { return state.layers; },
    get activeLayerId() { return state.activeLayerId; },
    get activeLayer() { return findLayer(state.activeLayerId); },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // Lightweight notifier used during gestures (e.g. Ctrl+Shift text-box
    // resize): pushes the current value to subscribers WITHOUT going through
    // the full layer:textChanged → re-rasterise pipeline. Use only when the
    // visual is being driven by another mechanism (Konva scale, etc.).
    _emitTextBoxLive(id, value) {
      emit({ type: 'layer:textBoxLive', id, value });
    },

    setName(name) {
      state.name = name;
      emit({ type: 'doc:propChanged', prop: 'name' });
    },

    setActiveLayer(id) {
      if (state.activeLayerId === id) return;
      state.activeLayerId = id;
      emit({ type: 'layer:active', id });
    },

    addImageLayer(opts) {
      const layer = createImageLayer({ id: uid(), ...opts });
      state.layers.push(layer);
      state.activeLayerId = layer.id;
      emit({ type: 'layer:added', layer });
      emit({ type: 'layer:active', id: layer.id });
      return layer;
    },

    addTextLayer(opts) {
      const layer = createTextLayer({ id: uid(), ...opts });
      state.layers.push(layer);
      state.activeLayerId = layer.id;
      emit({ type: 'layer:added', layer });
      emit({ type: 'layer:active', id: layer.id });
      return layer;
    },

    addFxLayer(opts) {
      const layer = createFxLayer({ id: uid(), ...opts });
      state.layers.push(layer);
      state.activeLayerId = layer.id;
      emit({ type: 'layer:added', layer });
      emit({ type: 'layer:active', id: layer.id });
      return layer;
    },

    addVectorLayer(opts) {
      const layer = createVectorLayer({ id: uid(), ...opts });
      state.layers.push(layer);
      state.activeLayerId = layer.id;
      emit({ type: 'layer:added', layer });
      emit({ type: 'layer:active', id: layer.id });
      return layer;
    },

    // Replace the entire `paths` array. Used by Pen / Pencil drawers and
    // boolean-op pipelines that want to commit a fully-formed result.
    setVectorPaths(id, paths) {
      const layer = findLayer(id);
      if (!layer || layer.type !== 'vector') return;
      layer.vector.paths = paths;
      emit({ type: 'layer:vectorChanged', id, prop: 'paths' });
    },

    // Patch a single path (by index) — partial merge of fields like d / fill / stroke.
    setVectorPath(id, pathIdx, partial) {
      const layer = findLayer(id);
      if (!layer || layer.type !== 'vector') return;
      const p = layer.vector.paths[pathIdx];
      if (!p) return;
      Object.assign(p, partial);
      emit({ type: 'layer:vectorChanged', id, prop: 'path', pathIdx });
    },

    // Convenience setters that broadcast the same vectorChanged event so the
    // renderer can re-rasterise and the panel can refresh.
    setVectorFill(id, pathIdx, fill) {
      this.setVectorPath(id, pathIdx, { fill });
    },
    setVectorStroke(id, pathIdx, stroke) {
      this.setVectorPath(id, pathIdx, { stroke });
    },

    removeLayer(id) {
      const idx = findIndex(id);
      if (idx < 0) return;
      const [removed] = state.layers.splice(idx, 1);
      if (state.activeLayerId === id) {
        state.activeLayerId = state.layers[idx]?.id ?? state.layers[idx - 1]?.id ?? null;
        emit({ type: 'layer:active', id: state.activeLayerId });
      }
      emit({ type: 'layer:removed', id, layer: removed });
    },

    reorderLayers(orderedIds) {
      const map = new Map(state.layers.map((l) => [l.id, l]));
      state.layers = orderedIds.map((id) => map.get(id)).filter(Boolean);
      emit({ type: 'layer:reordered', orderedIds });
    },

    setLayerProp(id, prop, value) {
      const layer = findLayer(id);
      if (!layer) return;
      layer[prop] = value;
      emit({ type: 'layer:propChanged', id, prop, value });
    },

    setLayerTransform(id, partial) {
      const layer = findLayer(id);
      if (!layer) return;
      Object.assign(layer.transform, partial);
      emit({ type: 'layer:transform', id });
    },

    setLayerSource(id, source, naturalSize) {
      const layer = findLayer(id);
      if (!layer || layer.type !== 'image') return;
      layer.source = source;
      if (naturalSize) layer.naturalSize = naturalSize;
      emit({ type: 'layer:sourceChanged', id });
    },

    setTextProp(id, prop, value) {
      const layer = findLayer(id);
      if (!layer || layer.type !== 'text') return;
      layer.text[prop] = value;
      emit({ type: 'layer:textChanged', id, prop, value });
    },

    // Set/clear a single OpenType variation axis (e.g. 'wght', 'wdth', 'slnt').
    // Pass `null` to remove the axis entirely (font's default takes over).
    setTextVariation(id, axisTag, value) {
      const layer = findLayer(id);
      if (!layer || layer.type !== 'text') return;
      if (!layer.text.variation) layer.text.variation = {};
      if (value == null) delete layer.text.variation[axisTag];
      else layer.text.variation[axisTag] = value;
      emit({ type: 'layer:textChanged', id, prop: 'variation', value: { ...layer.text.variation } });
    },

    // Toggle/set a single OpenType feature flag (e.g. 'liga', 'smcp', 'ss01').
    setTextFeature(id, featureTag, enabled) {
      const layer = findLayer(id);
      if (!layer || layer.type !== 'text') return;
      if (!layer.text.features) layer.text.features = {};
      if (enabled === null) delete layer.text.features[featureTag];
      else layer.text.features[featureTag] = !!enabled;
      emit({ type: 'layer:textChanged', id, prop: 'features', value: { ...layer.text.features } });
    },

    addEffect(layerId, effect) {
      const layer = findLayer(layerId);
      if (!layer) return null;
      const inst = { id: uid(), enabled: true, expanded: false, ...effect };
      layer.effects.push(inst);
      emit({ type: 'effect:added', layerId, effect: inst, atIndex: layer.effects.length - 1 });
      return inst;
    },

    removeEffect(layerId, effectId) {
      const layer = findLayer(layerId);
      if (!layer) return;
      const idx = layer.effects.findIndex((e) => e.id === effectId);
      if (idx < 0) return;
      layer.effects.splice(idx, 1);
      emit({ type: 'effect:removed', layerId, effectId, fromIndex: idx });
    },

    setEffectProp(layerId, effectId, prop, value) {
      const layer = findLayer(layerId);
      if (!layer) return;
      const idx = layer.effects.findIndex((e) => e.id === effectId);
      if (idx < 0) return;
      layer.effects[idx][prop] = value;
      const cacheBreaking = prop === 'enabled' || prop === 'params';
      emit({ type: 'effect:propChanged', layerId, effectId, prop, value, fromIndex: cacheBreaking ? idx : -1 });
    },

    setEffectParams(layerId, effectId, params) {
      const layer = findLayer(layerId);
      if (!layer) return;
      const idx = layer.effects.findIndex((e) => e.id === effectId);
      if (idx < 0) return;
      layer.effects[idx].params = { ...layer.effects[idx].params, ...params };
      emit({ type: 'effect:propChanged', layerId, effectId, prop: 'params', value: layer.effects[idx].params, fromIndex: idx });
    },

    reorderEffects(layerId, orderedIds) {
      const layer = findLayer(layerId);
      if (!layer) return;
      const oldOrder = layer.effects.map((e) => e.id);
      const map = new Map(layer.effects.map((e) => [e.id, e]));
      layer.effects = orderedIds.map((id) => map.get(id)).filter(Boolean);
      let firstChange = -1;
      for (let i = 0; i < layer.effects.length; i++) {
        if (oldOrder[i] !== layer.effects[i].id) { firstChange = i; break; }
      }
      emit({ type: 'effect:reordered', layerId, fromIndex: firstChange < 0 ? 0 : firstChange });
    },

    setExportFrame(partial) {
      // null clears the frame; partial object merges into current.
      if (partial == null) {
        state.exportFrame = null;
      } else {
        state.exportFrame = { ...(state.exportFrame || {}), ...partial };
      }
      emit({ type: 'doc:exportFrame', frame: state.exportFrame });
    },

    findLayer,
    serialize() {
      return JSON.parse(JSON.stringify(state, (k, v) => (k === 'naturalSize' ? v : v)));
    },
    load(snapshot) {
      state.version = snapshot.version ?? 1;
      state.name = snapshot.name ?? 'Untitled';
      state.canvasBackground = snapshot.canvasBackground ?? { type: 'transparent' };
      state.layers = snapshot.layers ?? [];
      state.activeLayerId = snapshot.activeLayerId ?? null;
      state.exportFrame = snapshot.exportFrame ?? null;
      emit({ type: 'doc:loaded' });
    },
  };
}
