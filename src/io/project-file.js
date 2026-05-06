// .slmr — Self-contained portable project format.
// ZIP archive containing manifest.json + raw binary assets.

import { zip, unzip, strToU8, strFromU8 } from 'fflate';
import { registerEmbeddedFont, getUploadedBlob } from '../ui/typography/uploaded-fonts.js';
import { setSettings } from '../ui/settings-popup.js';
import { preloadFontsForDoc } from '../ui/typography/font-loader.js';
import { findFont } from '../ui/typography/font-sources.js';

// Capture the global DOM document before any function parameter shadows it.
const DOM = document;

// ---------- .slmr Export ----------

export async function exportSlmr({ document, name }) {
  // `document` can be a live doc (with serialize()/layers getters) or a plain snapshot.
  const isLiveDoc = typeof document.serialize === 'function';
  const docState = isLiveDoc ? document.serialize() : JSON.parse(JSON.stringify(document));
  const liveLayers = isLiveDoc ? document.layers : (document.layers || []);

  const files = {};
  const assets = [];
  let assetCounter = 0;

  function addAsset(filename, bytes, mime) {
    const id = `asset_${assetCounter++}`;
    const path = `assets/${filename}`;
    files[path] = bytes;
    assets.push({ id, path, mime });
    return id;
  }

  // Extract image-layer sources as raw binary assets.
  for (let i = 0; i < docState.layers.length; i++) {
    const layer = docState.layers[i];
    if (layer.type !== 'image') continue;

    const liveSrc = liveLayers[i]?.source;
    const storedSrc = layer.source;

    if (liveSrc instanceof Blob) {
      const bytes = new Uint8Array(await liveSrc.arrayBuffer());
      const ext = mimeToExt(liveSrc.type) || 'bin';
      const id = addAsset(`layer_${layer.id}.${ext}`, bytes, liveSrc.type || 'application/octet-stream');
      layer.source = { __asset: id };
    } else if (typeof storedSrc === 'string' && storedSrc.startsWith('data:')) {
      const blob = await (await fetch(storedSrc)).blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const ext = mimeToExt(blob.type) || 'bin';
      const id = addAsset(`layer_${layer.id}.${ext}`, bytes, blob.type || 'application/octet-stream');
      layer.source = { __asset: id };
    }
    // else: keep string URLs as-is
  }

  // Collect every font referenced by a text layer, regardless of provider, so
  // the receiving system can auto-load Google / Fontshare / System / Uploaded
  // fonts without depending on its own catalogue being up-to-date. Uploaded
  // fonts also get their raw bytes embedded as ZIP assets.
  const fontKeys = new Set(); // dedupe by `family@source`
  const allFontRefs = []; // [{family, source}]
  function collectFromLayer(layer) {
    if (layer?.type !== 'text' || !layer.text?.font) return;
    const family = layer.text.font;
    const source = layer.text.provider || '';
    const k = `${family}@${source}`;
    if (fontKeys.has(k)) return;
    fontKeys.add(k);
    allFontRefs.push({ family, source });
  }
  for (const layer of liveLayers) collectFromLayer(layer);
  for (const layer of docState.layers) collectFromLayer(layer);

  const fonts = [];
  for (const ref of allFontRefs) {
    if (ref.source === 'uploaded') {
      // Embed the actual font bytes so the receiver doesn't need a copy.
      const blob = await getUploadedBlob(ref.family);
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const ext = mimeToExt(blob.type) || 'ttf';
      const id = addAsset(`font_${sanitizeFilename(ref.family)}.${ext}`, bytes, blob.type || 'font/ttf');
      fonts.push({ family: ref.family, source: 'uploaded', assetId: id, format: blob.type || 'font/ttf' });
    } else {
      // Reference-only entry: family + source + meta-snapshot from the local
      // catalogue. The receiver uses it directly via loadFont(meta) if its own
      // catalogue is stale and findFont() comes back empty.
      const meta = findFont(ref.family, ref.source) || { family: ref.family, source: ref.source };
      fonts.push({
        family: meta.family,
        source: meta.source || ref.source || 'system',
        slug: meta.slug,
        weights: meta.weights,
        italic: !!meta.italic,
        variable: !!meta.variable,
        axes: meta.axes,
        cssFamily: meta.cssFamily,
      });
    }
  }

  // Settings.
  let settings = null;
  try {
    settings = JSON.parse(localStorage.getItem('slammer:settings') || '{}');
  } catch {}

  const manifest = {
    version: 1,
    format: 'slmr',
    exportedAt: Date.now(),
    document: docState,
    settings,
    assets,
    fonts,
  };

  files['manifest.json'] = strToU8(JSON.stringify(manifest));

  const docName = name || docState.name || 'project';

  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => {
      if (err) return reject(err);
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = DOM.createElement('a');
      a.href = url;
      a.download = `${docName}.slmr`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    });
  });
}

// ---------- .slmr Import ----------

export async function importSlmr(file, doc) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const files = await new Promise((resolve, reject) => {
    unzip(bytes, (err, data) => {
      if (err) return reject(new Error(`Unzip failed: ${err.message || err}`));
      resolve(data);
    });
  });

  if (!files['manifest.json']) {
    throw new Error('Invalid .slmr file: missing manifest.json');
  }

  let manifest;
  try {
    manifest = JSON.parse(strFromU8(files['manifest.json']));
  } catch (err) {
    throw new Error(`Failed to parse manifest: ${err.message}`);
  }

  // Validate manifest shape.
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid manifest: not an object');
  }
  if (!manifest.document || typeof manifest.document !== 'object') {
    throw new Error('Invalid manifest: missing document object');
  }
  if (!Array.isArray(manifest.document.layers)) {
    throw new Error('Invalid manifest: document.layers is not an array');
  }

  // Build asset blobs.
  const assetBlobs = {};
  for (const asset of manifest.assets || []) {
    const data = files[asset.path];
    if (!data) {
      console.warn(`[slmr] missing asset in ZIP: ${asset.path}`);
      continue;
    }
    assetBlobs[asset.id] = new Blob([data], { type: asset.mime });
  }

  // Hydrate layer sources.
  for (const layer of manifest.document.layers) {
    if (layer.type === 'image' && layer.source && typeof layer.source === 'object' && layer.source.__asset) {
      const blob = assetBlobs[layer.source.__asset];
      if (!blob) {
        throw new Error(`Missing asset for layer "${layer.name || layer.id}": ${layer.source.__asset}`);
      }
      layer.source = blob;
    }
  }

  // Register embedded uploaded fonts (ones with raw bytes in the ZIP).
  for (const font of manifest.fonts || []) {
    if (!font.assetId) continue; // reference-only entries handled below via preloadFontsForDoc
    const blob = assetBlobs[font.assetId];
    if (!blob) {
      console.warn(`[slmr] missing font asset: ${font.assetId}`);
      continue;
    }
    const dataUrl = await blobToDataURL(blob);
    try {
      await registerEmbeddedFont({
        family: font.family,
        dataUrl,
        format: font.format,
        axes: font.axes,
        features: font.features,
        weights: font.weights,
        foundry: font.foundry,
      });
    } catch (err) {
      console.warn(`[slmr] failed to register font ${font.family}:`, err);
    }
  }

  // Restore settings.
  if (manifest.settings && Object.keys(manifest.settings).length) {
    try {
      setSettings(manifest.settings);
    } catch (err) {
      console.warn('[slmr] failed to restore settings:', err);
    }
  }

  // Auto-load Google / Fontshare / System fonts referenced by text layers
  // (Phase 19 Cluster C). preloadFontsForDoc walks the doc and resolves each
  // (family, source) via the local font catalogue. Race with a 2 s timeout so
  // a slow CDN doesn't block document load.
  try {
    await Promise.race([
      preloadFontsForDoc(manifest.document),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch (err) {
    console.warn('[slmr] font preload skipped:', err);
  }

  // Load document.
  try {
    doc.load(manifest.document);
  } catch (err) {
    throw new Error(`Document load failed: ${err.message || err}`);
  }
}

// ---------- Helpers ----------

function mimeToExt(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'font/ttf': 'ttf',
    'font/otf': 'otf',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
  };
  return map[mime] || 'bin';
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
