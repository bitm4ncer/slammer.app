// Per-layer rendered dstCanvas cache.
//
// On page reload, the renderer normally rebuilds every layer from its source
// Blob: decode → padded canvas → getImageData → effect pipeline. On a doc
// with multiple heavy effects (Drop Shadow, Organic Gradient, Halftone Raster)
// that takes seconds. This module persists each layer's FINAL rendered bitmap
// as a PNG Blob keyed by `layer.id`, plus a fingerprint of the inputs that
// produced it. On boot the renderer probes the cache: a fingerprint match
// hydrates Konva.Image with the cached blob directly, skipping rasterise +
// effect rerun until the user actually edits the layer.
//
// IDB store `layer-renders` (declared at v5 in project-store.js).
// Record: { id, blob, contentKey, paintVersion, updatedAt }.

import { _openSharedDB } from './project-store.js';

const STORE = 'layer-renders';

export async function getRender(layerId) {
  if (!layerId) return null;
  let db;
  try { db = await _openSharedDB(); } catch { return null; }
  return new Promise((resolve) => {
    let tx;
    try { tx = db.transaction(STORE, 'readonly'); }
    catch { resolve(null); return; }
    const req = tx.objectStore(STORE).get(layerId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function setRender(layerId, blob, contentKey, paintVersion, geom) {
  if (!layerId || !blob) return;
  let db;
  try { db = await _openSharedDB(); } catch { return; }
  return new Promise((resolve) => {
    let tx;
    try { tx = db.transaction(STORE, 'readwrite'); }
    catch { resolve(); return; }
    tx.objectStore(STORE).put({
      id: layerId,
      blob,
      contentKey,
      paintVersion: paintVersion | 0,
      // Konva.Image local offset within the group (image.position()) and
      // pad metadata. Required so vector / text / image-with-pad layers
      // restore at the right world coords without rerunning rasterizeSource.
      geom: geom || null,
      updatedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function deleteRender(layerId) {
  if (!layerId) return;
  let db;
  try { db = await _openSharedDB(); } catch { return; }
  return new Promise((resolve) => {
    let tx;
    try { tx = db.transaction(STORE, 'readwrite'); }
    catch { resolve(); return; }
    tx.objectStore(STORE).delete(layerId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Garbage-collect cached renders for layers that no longer exist in any
// known project. Pass the union of all layer ids currently referenced from
// any persisted project document. Called from main.js on idle after boot.
export async function gcRenders(activeLayerIds) {
  let db;
  try { db = await _openSharedDB(); } catch { return; }
  const active = new Set(activeLayerIds);
  return new Promise((resolve) => {
    let tx;
    try { tx = db.transaction(STORE, 'readwrite'); }
    catch { resolve(); return; }
    const store = tx.objectStore(STORE);
    const allKeys = store.getAllKeys();
    allKeys.onsuccess = () => {
      for (const key of (allKeys.result || [])) {
        if (!active.has(key)) store.delete(key);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
