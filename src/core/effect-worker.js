// Main-thread wrapper around the pixel-effect Web Worker.
//
// The renderer's pipeline calls `runInWorker(pluginId, imageData, params)`
// when a plugin manifests `worker: true`. This module owns a single
// long-lived Worker (lazy-instantiated on first call), routes calls via a
// promise table keyed by an incrementing id, and uses transferable
// ArrayBuffers to avoid struct-clone copy overhead.
//
// Falls back to null when:
//   • OffscreenCanvas is unavailable (the worker plugins use it)
//   • Worker construction throws (sandbox / file-protocol environment)
// In those cases the renderer must invoke plugin.process synchronously
// on the main thread instead.

import EffectWorker from '../workers/effect-worker.js?worker';

let _worker = null;
let _workerFailed = false;
let _nextId = 1;
const _pending = new Map(); // id → { resolve, reject }

function workerSupported() {
  if (typeof Worker === 'undefined') return false;
  if (typeof OffscreenCanvas === 'undefined') return false;
  return true;
}

function ensureWorker() {
  if (_worker) return _worker;
  if (_workerFailed || !workerSupported()) return null;
  try {
    _worker = new EffectWorker();
    _worker.onmessage = (e) => {
      const { id, buffer, error } = e.data;
      const slot = _pending.get(id);
      if (!slot) return;
      _pending.delete(id);
      if (error) slot.reject(new Error(error));
      else slot.resolve(buffer);
    };
    _worker.onerror = (e) => {
      // Worker threw at top level (e.g. import error). Fail every pending
      // call so the renderer can fall back to main-thread.
      console.error('[effect-worker]', e.message || e);
      _workerFailed = true;
      for (const [, slot] of _pending) slot.reject(new Error('effect-worker: ' + (e.message || 'failed')));
      _pending.clear();
      try { _worker.terminate(); } catch (_) {}
      _worker = null;
    };
    return _worker;
  } catch (err) {
    console.warn('[effect-worker] could not create worker:', err);
    _workerFailed = true;
    return null;
  }
}

export function isWorkerAvailable() {
  return !_workerFailed && workerSupported();
}

/**
 * Run a plugin's process function in the worker. Returns the resulting
 * ImageData (a NEW one, owning a freshly transferred buffer). The input
 * imageData's underlying ArrayBuffer is transferred to the worker — the
 * caller MUST treat it as neutered after this call returns. That's why
 * the renderer's pipeline only routes through here for steps that ALREADY
 * cloned the input (in-place plugins) or use an explicitly disposable
 * intermediate (out-of-place sources).
 *
 * Resolves to null if the worker isn't available; caller should fall back
 * to plugin.process on the main thread.
 */
export function runInWorker(pluginId, imageData, params) {
  const worker = ensureWorker();
  if (!worker) return null;
  const id = _nextId++;
  return new Promise((resolve, reject) => {
    _pending.set(id, {
      resolve: (buffer) => {
        try {
          // Wrap the returned buffer back into an ImageData of the same dims.
          const data = new Uint8ClampedArray(buffer);
          resolve(new ImageData(data, imageData.width, imageData.height));
        } catch (err) { reject(err); }
      },
      reject,
    });
    try {
      worker.postMessage({
        id,
        pluginId,
        w: imageData.width,
        h: imageData.height,
        params,
        buffer: imageData.data.buffer,
      }, [imageData.data.buffer]);
    } catch (err) {
      _pending.delete(id);
      reject(err);
    }
  });
}
