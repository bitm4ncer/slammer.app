// .slammerproj — JSON file with embedded data URLs. Self-contained portable format.
// Legacy .crushproj imports are accepted via the file-extension drop handler.

import { getUploadedBlob, registerEmbeddedFont } from '../ui/typography/uploaded-fonts.js';

export async function exportProjectFile({ document: doc }) {
  const docCopy = JSON.parse(JSON.stringify(doc.serialize()));
  for (let i = 0; i < doc.layers.length; i++) {
    const src = doc.layers[i].source;
    if (src instanceof Blob) {
      docCopy.layers[i].source = await blobToDataURL(src);
    } else {
      docCopy.layers[i].source = src;
    }
  }
  // Embed uploaded fonts so the project is portable across machines.
  docCopy.embeddedFonts = await collectEmbeddedFonts(doc);
  const blob = new Blob([JSON.stringify(docCopy)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.state.name || 'project'}.slammerproj`;
  a.click();
}

export async function importProjectFile(file, doc) {
  const text = await file.text();
  const json = JSON.parse(text);
  // Restore embedded uploaded fonts BEFORE doc.load so text rasters use them.
  if (Array.isArray(json.embeddedFonts)) {
    for (const f of json.embeddedFonts) {
      try { await registerEmbeddedFont(f); } catch (e) { console.warn('[project] embedded font failed', e); }
    }
  }
  doc.load(json);
}

async function collectEmbeddedFonts(doc) {
  const wanted = new Set();
  for (const layer of doc.layers) {
    if (layer?.type === 'text' && layer.text?.provider === 'uploaded' && layer.text.font) {
      wanted.add(layer.text.font);
    }
  }
  const out = [];
  for (const family of wanted) {
    const blob = await getUploadedBlob(family);
    if (!blob) continue;
    out.push({
      family,
      dataUrl: await blobToDataURL(blob),
      format: blob.type || 'font/ttf',
    });
  }
  return out;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
