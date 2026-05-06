// Document — the editable state container.
// Mutate via methods so listeners can react with precise change events.

import { createImageLayer, createTextLayer, createFxLayer, createVectorLayer, createGroupLayer, isVectorOnlyGroup as _isVectorOnly } from './layer.js';

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

  // Deep-clone a layer's POJO state for duplicate / paste. Blob-typed
  // fields (image source) bypass JSON and are reattached by reference —
  // Blobs are immutable so sharing the underlying bytes is safe.
  function cloneLayerJSON(layer) {
    const { source, naturalSize, ...rest } = layer;
    const out = JSON.parse(JSON.stringify(rest));
    out.id = uid();
    if (source !== undefined) out.source = source;
    if (naturalSize !== undefined) out.naturalSize = JSON.parse(JSON.stringify(naturalSize));
    return out;
  }

  // Recursively clone every descendant of a group, splice each clone
  // into state.layers right after its parent's clone (so the flat order
  // mirrors the source group's), and return the new childIds list. Used
  // by duplicateLayer when the source layer is a group.
  function cloneGroupChildren(srcChildIds, newGroupId, baseInsertAt) {
    const newChildIds = [];
    let cursor = baseInsertAt;
    for (const cid of srcChildIds) {
      const child = findLayer(cid);
      if (!child) continue;
      const childClone = cloneLayerJSON(child);
      childClone.parentGroupId = newGroupId;
      state.layers.splice(cursor, 0, childClone);
      newChildIds.push(childClone.id);
      cursor += 1;
      if (childClone.type === 'group' && Array.isArray(childClone.childIds)) {
        // Recurse into nested groups; their freshly-spliced children
        // continue at the cursor.
        const nested = cloneGroupChildren(child.childIds || [], childClone.id, cursor);
        childClone.childIds = nested;
        cursor += nested.length;
      }
    }
    return newChildIds;
  }

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

    // The anchor overlay fires this when the user clicks an anchor in
    // Direct Selection mode — the Vector panel listens and switches its
    // active sub-path so the Fill / Stroke / Shape rows edit that path.
    _emitVectorActivePath(layerId, pathIdx) {
      emit({ type: 'layer:vectorActivePath', id: layerId, pathIdx });
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

    // Group ops — see plan: a group wraps N children of any type via
    // childIds + each child's parentGroupId mirror. Nested groups are
    // allowed. childIds order = panel display order (top-of-stack first).
    addGroupLayer(opts = {}) {
      const layer = createGroupLayer({ id: uid(), ...opts });
      // Stamp parentGroupId on each child + drop them from any prior group.
      for (const childId of layer.childIds) {
        const child = findLayer(childId);
        if (!child) continue;
        // Detach from previous parent group (single-membership invariant).
        if (child.parentGroupId && child.parentGroupId !== layer.id) {
          const prev = findLayer(child.parentGroupId);
          if (prev && Array.isArray(prev.childIds)) {
            prev.childIds = prev.childIds.filter((cid) => cid !== childId);
          }
        }
        child.parentGroupId = layer.id;
      }
      // Insert near the topmost existing child so the group appears at
      // the same z-position as the layers it now wraps. Default = top.
      let insertAt = state.layers.length;
      for (const cid of layer.childIds) {
        const idx = findIndex(cid);
        if (idx > insertAt) insertAt = idx + 1;
        else if (idx >= 0 && insertAt === state.layers.length) insertAt = idx + 1;
      }
      state.layers.splice(insertAt, 0, layer);
      state.activeLayerId = layer.id;
      emit({ type: 'layer:added', layer });
      emit({ type: 'layer:active', id: layer.id });
      return layer;
    },

    addToGroup(groupId, childId, atIndex) {
      const group = findLayer(groupId);
      const child = findLayer(childId);
      if (!group || group.type !== 'group' || !child) return;
      // Detach from previous parent.
      if (child.parentGroupId && child.parentGroupId !== groupId) {
        const prev = findLayer(child.parentGroupId);
        if (prev && Array.isArray(prev.childIds)) {
          prev.childIds = prev.childIds.filter((id) => id !== childId);
          emit({ type: 'group:childrenChanged', layerId: prev.id });
        }
      }
      child.parentGroupId = groupId;
      if (!group.childIds.includes(childId)) {
        if (typeof atIndex === 'number') group.childIds.splice(atIndex, 0, childId);
        else group.childIds.push(childId);
      }
      emit({ type: 'group:childrenChanged', layerId: groupId });
    },

    removeFromGroup(groupId, childId) {
      const group = findLayer(groupId);
      const child = findLayer(childId);
      if (!group || group.type !== 'group') return;
      group.childIds = group.childIds.filter((id) => id !== childId);
      if (child) child.parentGroupId = null;
      emit({ type: 'group:childrenChanged', layerId: groupId });
    },

    reorderGroupChildren(groupId, orderedIds) {
      const group = findLayer(groupId);
      if (!group || group.type !== 'group') return;
      const set = new Set(orderedIds);
      const kept = orderedIds.filter((id) => group.childIds.includes(id));
      const tail = group.childIds.filter((id) => !set.has(id));
      group.childIds = kept.concat(tail);
      emit({ type: 'group:childrenChanged', layerId: groupId });
    },

    // Dissolve a group — children stay in the layer list; their
    // parentGroupId clears. The group layer is removed.
    dissolveGroup(groupId) {
      const group = findLayer(groupId);
      if (!group || group.type !== 'group') return;
      for (const cid of group.childIds) {
        const child = findLayer(cid);
        if (child) child.parentGroupId = group.parentGroupId || null;
      }
      const idx = findIndex(groupId);
      if (idx >= 0) state.layers.splice(idx, 1);
      if (state.activeLayerId === groupId) {
        state.activeLayerId = group.childIds[0] || state.layers[idx]?.id || null;
        emit({ type: 'layer:active', id: state.activeLayerId });
      }
      emit({ type: 'group:dissolved', layerId: groupId });
      emit({ type: 'layer:removed', id: groupId, layer: group });
    },

    findParentGroup(layerId) {
      const layer = findLayer(layerId);
      if (!layer || !layer.parentGroupId) return null;
      return findLayer(layer.parentGroupId) || null;
    },

    descendantsOf(groupId) {
      const out = [];
      const group = findLayer(groupId);
      if (!group || group.type !== 'group') return out;
      const visit = (g) => {
        for (const cid of (g.childIds || [])) {
          const child = findLayer(cid);
          if (!child) continue;
          out.push(child);
          if (child.type === 'group') visit(child);
        }
      };
      visit(group);
      return out;
    },

    isLayerInAnyGroup(layerId) {
      const layer = findLayer(layerId);
      return !!(layer && layer.parentGroupId);
    },

    isVectorOnlyGroup(groupId) {
      const group = findLayer(groupId);
      return _isVectorOnly(group, findLayer);
    },

    // Insert an already-fully-formed layer into the document at the
    // given index (or end). Used by clone / duplicate flows where the
    // caller has already constructed the layer via JSON and just needs
    // it wired into the renderer + panel. Fires the same events the
    // type-specific add* methods do.
    _addLayerRaw(layer, atIndex) {
      if (!layer || !layer.id) return null;
      const idx = (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= state.layers.length)
        ? atIndex
        : state.layers.length;
      state.layers.splice(idx, 0, layer);
      emit({ type: 'layer:added', layer });
      return layer;
    },

    // Deep-clone a layer (preserving Blob refs for image sources), drop
    // it back into the document just above the original, and return the
    // clone. Group children are recursively cloned with fresh ids.
    //
    // Vector layers store path d-coords in WORLD space (see
    // vector-renderer COORDINATE CONVENTION). The transform.x/y bumps
    // here move the rotation anchor — for image/text/group/fx that ALSO
    // moves the visible content; for vector layers the path coords need
    // a matching translatePathD pass at the call site to produce a
    // visible offset. The UI handler does that.
    duplicateLayer(id, { offsetXY = { x: 20, y: 20 } } = {}) {
      const src = findLayer(id);
      if (!src) return null;
      const clone = cloneLayerJSON(src);
      clone.parentGroupId = src.parentGroupId || null;
      if (clone.transform && clone.type !== 'fx') {
        clone.transform.x = (clone.transform.x || 0) + (offsetXY.x || 0);
        clone.transform.y = (clone.transform.y || 0) + (offsetXY.y || 0);
      }
      const insertAt = findIndex(id) + 1;
      state.layers.splice(insertAt, 0, clone);

      // Recursively clone group descendants. Each level remaps childIds
      // to the freshly-created child clone ids.
      if (clone.type === 'group' && Array.isArray(clone.childIds)) {
        clone.childIds = cloneGroupChildren(src.childIds || [], clone.id, insertAt + 1);
      }

      // Sibling-of-original membership: drop into the same parent group
      // right after the original.
      if (clone.parentGroupId) {
        const parent = findLayer(clone.parentGroupId);
        if (parent && Array.isArray(parent.childIds)) {
          const ci = parent.childIds.indexOf(id);
          parent.childIds.splice(ci >= 0 ? ci + 1 : parent.childIds.length, 0, clone.id);
          emit({ type: 'group:childrenChanged', layerId: parent.id });
        }
      }

      state.activeLayerId = clone.id;
      emit({ type: 'layer:added', layer: clone });
      emit({ type: 'layer:active', id: clone.id });
      return clone;
    },

    setLayerLocked(id, locked) {
      const layer = findLayer(id);
      if (!layer) return;
      layer.locked = !!locked;
      emit({ type: 'layer:propChanged', id, prop: 'locked', value: !!locked });
      // Cascade: lock state propagates to descendants of a group.
      if (layer.type === 'group') {
        for (const child of (layer.childIds || []).map(findLayer).filter(Boolean)) {
          if (!!child.locked !== !!locked) {
            child.locked = !!locked;
            emit({ type: 'layer:propChanged', id: child.id, prop: 'locked', value: !!locked });
          }
        }
      }
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
      // If the removed layer was a member of a group, drop it from the
      // group's childIds so the group renders the remainder cleanly.
      if (removed.parentGroupId) {
        const parent = findLayer(removed.parentGroupId);
        if (parent && Array.isArray(parent.childIds)) {
          parent.childIds = parent.childIds.filter((cid) => cid !== id);
          emit({ type: 'group:childrenChanged', layerId: parent.id });
        }
      }
      // If the removed layer was a group itself, orphan its children
      // (they survive at the top level).
      if (removed.type === 'group' && Array.isArray(removed.childIds)) {
        for (const cid of removed.childIds) {
          const child = findLayer(cid);
          if (child) child.parentGroupId = removed.parentGroupId || null;
        }
      }
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

    // Vector-effect crud — separate stack on vector layers, applied
    // pre-rasterise inside vector-renderer. The pixel-level effect
    // stack (addEffect / removeEffect / etc.) stays unchanged and runs
    // on the resulting ImageData.
    addVectorEffect(layerId, effect) {
      const layer = findLayer(layerId);
      if (!layer || (layer.type !== 'vector' && layer.type !== 'group')) return null;
      if (!layer.vectorEffects) layer.vectorEffects = [];
      const inst = { id: uid(), enabled: true, expanded: true, ...effect };
      layer.vectorEffects.push(inst);
      emit({ type: 'vectorEffect:added', layerId, effect: inst, atIndex: layer.vectorEffects.length - 1 });
      return inst;
    },

    removeVectorEffect(layerId, effectId) {
      const layer = findLayer(layerId);
      if (!layer || !layer.vectorEffects) return;
      const idx = layer.vectorEffects.findIndex((e) => e.id === effectId);
      if (idx < 0) return;
      layer.vectorEffects.splice(idx, 1);
      emit({ type: 'vectorEffect:removed', layerId, effectId, fromIndex: idx });
    },

    setVectorEffectProp(layerId, effectId, prop, value) {
      const layer = findLayer(layerId);
      if (!layer || !layer.vectorEffects) return;
      const idx = layer.vectorEffects.findIndex((e) => e.id === effectId);
      if (idx < 0) return;
      layer.vectorEffects[idx][prop] = value;
      emit({ type: 'vectorEffect:propChanged', layerId, effectId, prop, value, fromIndex: idx });
    },

    setVectorEffectParams(layerId, effectId, params) {
      const layer = findLayer(layerId);
      if (!layer || !layer.vectorEffects) return;
      const idx = layer.vectorEffects.findIndex((e) => e.id === effectId);
      if (idx < 0) return;
      layer.vectorEffects[idx].params = { ...layer.vectorEffects[idx].params, ...params };
      emit({ type: 'vectorEffect:propChanged', layerId, effectId, prop: 'params', value: layer.vectorEffects[idx].params, fromIndex: idx });
    },

    reorderVectorEffects(layerId, orderedIds) {
      const layer = findLayer(layerId);
      if (!layer || !layer.vectorEffects) return;
      const map = new Map(layer.vectorEffects.map((e) => [e.id, e]));
      layer.vectorEffects = orderedIds.map((id) => map.get(id)).filter(Boolean);
      emit({ type: 'vectorEffect:reordered', layerId });
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
