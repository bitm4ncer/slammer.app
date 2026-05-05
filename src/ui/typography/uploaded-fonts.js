// uploaded-fonts — IndexedDB-backed store of user-supplied fonts.
//
// Each record:
//   { family, format, blob, axes, features, weights, foundry, license, addedAt }
//
// On page load: walk the store, register every blob as a FontFace into
// document.fonts so the rest of the app can use the family name immediately.
// On user upload: parse with opentype.js → extract axes/features → store.

const DB_NAME = 'slammer.uploaded-fonts';
const STORE = 'fonts';

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'family' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

const _cache = new Map();   // family → meta record (without blob in memory)
const _changeListeners = new Set();
let _booted = false;

export function onUploadedChange(fn) {
  _changeListeners.add(fn);
  return () => _changeListeners.delete(fn);
}
function emitChange() {
  for (const fn of _changeListeners) try { fn(); } catch {}
}

export function listUploaded() {
  return [..._cache.values()].map(stripBlob);
}
function stripBlob(rec) {
  // Hide the blob from the picker — it only needs metadata.
  const { blob: _, ...meta } = rec;
  return { ...meta, source: 'uploaded' };
}

export async function bootUploadedFonts() {
  if (_booted) return;
  _booted = true;
  try {
    const db = await openDB();
    const records = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    for (const rec of records) {
      _cache.set(rec.family, rec);
      try { await registerFontFace(rec.family, rec.blob); } catch (e) {
        console.warn('[fonts] failed to register uploaded font', rec.family, e);
      }
    }
    emitChange();
  } catch (e) {
    console.warn('[fonts] uploaded boot failed', e);
  }
}

async function registerFontFace(family, blob) {
  if (!blob) return;
  const buf = await blob.arrayBuffer();
  const face = new FontFace(family, buf);
  await face.load();
  document.fonts.add(face);
}

// Accept a File from drop / file input. Parse it, register, persist.
// Returns the meta record on success, throws on failure.
export async function uploadFontFile(file) {
  if (!file) throw new Error('no file');
  const buf = await file.arrayBuffer();
  const meta = await parseFont(buf);
  meta.format = guessFormat(file.name);
  meta.addedAt = Date.now();
  meta.blob = new Blob([buf], { type: file.type || 'font/ttf' });
  meta.source = 'uploaded';
  // Register live first so the picker can preview immediately.
  await registerFontFace(meta.family, meta.blob);
  // Persist.
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(meta);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  _cache.set(meta.family, meta);
  emitChange();
  return stripBlob(meta);
}

// Public — register a font that was embedded inside a .slmr file.
// Used during project load so foreign-uploaded fonts work even if the user
// doesn't have them in their global IndexedDB store.
export async function registerEmbeddedFont({ family, dataUrl, axes, features, weights, foundry }) {
  if (!family || !dataUrl) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const meta = {
    family, axes: axes || [], features: features || [], weights: weights || [400],
    foundry: foundry || 'Embedded', addedAt: Date.now(), blob, source: 'uploaded',
  };
  await registerFontFace(family, blob);
  // Merge into cache but don't overwrite if user already has same-family upload.
  if (!_cache.has(family)) {
    _cache.set(family, meta);
    emitChange();
    // Persist in background — projects survive across machines after first open.
    try {
      const db = await openDB();
      await new Promise((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(meta);
        tx.oncomplete = resolve;
      });
    } catch {}
  }
  return stripBlob(meta);
}

// Get the raw blob for a family (used by project save to embed the font).
export async function getUploadedBlob(family) {
  const rec = _cache.get(family);
  return rec?.blob || null;
}

export async function deleteUploadedFont(family) {
  const db = await openDB();
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(family);
    tx.oncomplete = resolve;
  });
  _cache.delete(family);
  emitChange();
}

function guessFormat(name) {
  const ext = name.toLowerCase().split('.').pop();
  return ({ ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' })[ext] || 'truetype';
}

// Lazy-load opentype.js — heavy parser only needed when uploading.
let _opentypePromise = null;
async function loadOpentype() {
  if (_opentypePromise) return _opentypePromise;
  _opentypePromise = import('opentype.js').then((m) => m.default || m);
  return _opentypePromise;
}

async function parseFont(arrayBuffer) {
  const opentype = await loadOpentype();
  const font = opentype.parse(arrayBuffer);
  // Family name from the `name` table — fall back to font.familyName.
  const family =
    font.names?.fontFamily?.en ||
    font.names?.preferredFamily?.en ||
    font.familyName ||
    `Uploaded ${Date.now()}`;

  // Variable axes from fvar.
  const axes = [];
  if (font.tables.fvar?.axes) {
    for (const a of font.tables.fvar.axes) {
      axes.push({ tag: a.tag, min: a.minValue, max: a.maxValue, default: a.defaultValue, name: a.name?.en || a.tag });
    }
  }

  // GSUB feature tags (deduped).
  const features = [];
  const seen = new Set();
  if (font.tables.gsub?.features) {
    for (const f of font.tables.gsub.features) {
      if (!seen.has(f.tag)) { seen.add(f.tag); features.push(f.tag); }
    }
  }

  return {
    family,
    axes,
    features,
    weights: [font.tables.os2?.usWeightClass || 400],
    italic: !!font.tables.os2?.fsSelection && (font.tables.os2.fsSelection & 0x01),
    variable: axes.length > 0,
    foundry: font.names?.manufacturer?.en || '',
    license: font.names?.license?.en || font.names?.licenseURL?.en || '',
    category: 'sans-serif', // can't easily detect — show under "Uploaded" anyway
  };
}
