// Effect worker — runs heavy pixel-effect plugins off the main thread.
//
// Protocol (postMessage from main → worker):
//   { id: number, pluginId: string, w: int, h: int, params: object,
//     buffer: ArrayBuffer (Uint8ClampedArray bytes, transferred) }
//
// Reply (postMessage from worker → main):
//   { id: number, buffer: ArrayBuffer (transferred) }
// or on error:
//   { id: number, error: string }
//
// To add a plugin: import its process-impl module and register a handler.

import { processDropShadow } from '../plugins/filters/drop-shadow/process-impl.js';

const handlers = {
  'drop-shadow': (data, w, h, params) => {
    const imageData = new ImageData(data, w, h);
    processDropShadow(imageData, params);
    // processDropShadow mutates imageData.data in place.
    return imageData.data;
  },
};

self.onmessage = (e) => {
  const { id, pluginId, w, h, params, buffer } = e.data;
  const fn = handlers[pluginId];
  if (!fn) {
    self.postMessage({ id, error: `effect-worker: unknown plugin ${pluginId}` });
    return;
  }
  try {
    // Wrap the transferred buffer back into a Uint8ClampedArray of the
    // right size. ImageData wants the exact W*H*4 length.
    const data = new Uint8ClampedArray(buffer);
    const result = fn(data, w, h, params);
    // Return the (possibly same) buffer back to main, transferred.
    const out = result.buffer;
    self.postMessage({ id, buffer: out }, [out]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack ? err.stack : err) });
  }
};
