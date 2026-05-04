// Datamosh result cache — survives page reload via IndexedDB.
//
// Keyed by a fast hash of (input ImageData sample + glitch params). Stores the
// glitched JPEG Blob so we can decode it back on the next render without
// re-rolling the bit-flips.

const DB_NAME = 'slammer';
const STORE = 'datamosh-cache';
const VERSION = 2; // bumped — adds the datamosh-cache store

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If a NEWER version is requested elsewhere, close so we don't block the upgrade.
      db.onversionchange = () => { try { db.close(); } catch {} dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('IndexedDB open failed'));
    };
    req.onblocked = () => {
      console.warn('[slammer.app] datamosh-cache: IndexedDB upgrade blocked');
    };
  });
  return dbPromise;
}

export async function cacheGet(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function cacheSet(key, blob) {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    // Best-effort LRU trim — keep the most recent ~60 entries.
    trim().catch(() => {});
  } catch {}
}

async function trim() {
  const db = await openDB();
  const keys = await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAllKeys();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  });
  if (keys.length <= 60) return;
  // Drop the oldest insertion-order entries until under cap.
  const toDelete = keys.slice(0, keys.length - 60);
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const k of toDelete) store.delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// Fast content-hash: samples 128 evenly-spaced pixels and folds into a 32-bit int.
// Combined with the params signature into the final cache key.
export function buildCacheKey(imageData, paramsSig) {
  const W = imageData.width, H = imageData.height;
  const d = imageData.data;
  let h = 2166136261 >>> 0; // FNV-1a init
  // Image dims
  h = mix(h, W);
  h = mix(h, H);
  // Sampled pixel data
  const samples = 128;
  const stride = Math.max(4, ((W * H) / samples) | 0) * 4;
  for (let i = 0; i < d.length; i += stride) {
    h = mix(h, d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24));
  }
  return `${h.toString(36)}-${paramsSig}`;
}

function mix(h, v) {
  h ^= v >>> 0;
  h = Math.imul(h, 16777619) >>> 0;
  return h;
}
