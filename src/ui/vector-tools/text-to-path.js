// text-to-path — convert a text layer into a vector layer with one path per
// glyph. Uses opentype.js (already a dep) to load the font binary and pull
// each glyph's outline as an SVG path.
//
// Glyph layout mirrors what the text rasteriser does (line wrap, alignment,
// tracking, line height, transform), so the output sits in the same world
// position as the rendered text was.
//
// Limitations:
//   - System fonts can't be loaded by opentype.js without raw binary
//     access. Show a notification + bail out.
//   - Variable-font instances: we use the static weight closest to
//     text.weight (or text.variation.wght when present).
//   - Stylistic sets / ligatures / kerning: not applied at glyph-extraction
//     time. Future enhancement could re-shape using HarfBuzz.

import { findFont } from '../typography/font-sources.js';
import { getUploadedBlob } from '../typography/uploaded-fonts.js';
import { showNotification } from '../notifications.js';

let _opentypePromise = null;
async function loadOpentype() {
  if (_opentypePromise) return _opentypePromise;
  _opentypePromise = import('opentype.js').then((m) => m.default || m);
  return _opentypePromise;
}

// opentype.js can't decode woff2 on its own — it needs an external WASM
// decompressor. Lazy-load wawoff2 only when we actually have a woff2 buffer.
let _wawoffPromise = null;
async function decompressWoff2IfNeeded(buffer) {
  // SFNT magic bytes: a woff2 file starts with 'wOF2' (0x77 0x4F 0x46 0x32).
  // TTF starts with 0x00010000, OTF with 'OTTO', WOFF1 with 'wOFF'. Only
  // woff2 needs decompressing — everything else opentype can parse directly.
  const view = new Uint8Array(buffer, 0, 4);
  const isWoff2 = view[0] === 0x77 && view[1] === 0x4F && view[2] === 0x46 && view[3] === 0x32;
  if (!isWoff2) return buffer;
  if (!_wawoffPromise) {
    _wawoffPromise = import('wawoff2').then((m) => m.default || m);
  }
  const wawoff2 = await _wawoffPromise;
  // wawoff2.decompress takes a Uint8Array and returns Uint8Array of SFNT bytes.
  const out = await wawoff2.decompress(new Uint8Array(buffer));
  // Hand opentype a clean ArrayBuffer slice (avoid passing a SharedArrayBuffer view).
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

// Fetch a font binary as ArrayBuffer (suitable for opentype.parse()).
// Returns { buffer, sourceLabel } or null on failure.
async function resolveFontBuffer(meta, t) {
  if (!meta) return null;
  if (meta.source === 'uploaded') {
    const blob = await getUploadedBlob(meta.family);
    if (!blob) return null;
    return { buffer: await blob.arrayBuffer(), sourceLabel: 'uploaded' };
  }
  if (meta.source === 'system') {
    return null; // not reachable without Local Font Access raw binary access
  }
  // Google + Fontshare — sniff the woff2 URL from the @font-face the loader
  // injected, then fetch it as ArrayBuffer.
  const fam = (meta.cssFamily || meta.family);
  const wght = (t.variation && t.variation.wght != null) ? t.variation.wght : t.weight;
  const url = await fetchFontFileUrl(fam, wght || 400, !!t.italic);
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return { buffer: await r.arrayBuffer(), sourceLabel: meta.source };
  } catch {
    return null;
  }
}

async function fetchFontFileUrl(family, weight, italic) {
  // Probe Google's CSS endpoint with a precise spec, then read out the
  // .woff2 URL the @font-face uses. fetch() in a modern browser sends a UA
  // Google understands, so woff2 is returned by default.
  const fam = family.replace(/\s+/g, '+');
  const url = italic
    ? `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@1,${weight}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${fam}:wght@${weight}&display=swap`;
  try {
    const r = await fetch(url);
    const css = await r.text();
    // Prefer woff2; fall back to any .ttf / .otf url if present.
    const m = css.match(/url\((https?:\/\/[^)]+\.woff2)\)/)
           || css.match(/url\((https?:\/\/[^)]+\.(?:ttf|otf))\)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function convertTextLayerToPath(doc, layer, { replace = true } = {}) {
  if (!layer || layer.type !== 'text') return null;
  const t = layer.text;
  const meta = findFont(t.font, t.provider);
  if (!meta) {
    showNotification('Convert to Path: font metadata not found.');
    return null;
  }
  if (meta.source === 'system') {
    showNotification('Convert to Path needs a downloadable font binary. System fonts aren’t supported yet — pick a Google or Fontshare equivalent.');
    return null;
  }

  const fontFile = await resolveFontBuffer(meta, t);
  if (!fontFile) {
    showNotification('Convert to Path: couldn’t download the font file.');
    return null;
  }

  let otFont;
  try {
    const opentype = await loadOpentype();
    // Google + Fontshare serve woff2 — decompress to SFNT first since
    // opentype.js v1.3.5 can't read woff2 natively.
    const sfntBuffer = await decompressWoff2IfNeeded(fontFile.buffer);
    otFont = opentype.parse(sfntBuffer);
  } catch (e) {
    console.error('[text-to-path] opentype.parse failed:', e);
    showNotification('Convert to Path: font failed to parse (' + (e.message || e) + ').');
    return null;
  }

  // Layout — keep this simple. Doesn't replicate every nuance of the
  // text rasteriser (no justify, no per-line tracking variation), but
  // good enough for the first cut.
  const size = t.size || 96;
  const lineH = size * (t.lineHeight || 1.2);
  const align = t.align || 'left';
  const ls = t.letterSpacing || 0;
  const transformMode = t.transform || 'none';
  const value = applyTransform(t.value || '', transformMode);
  const rawLines = value.split('\n');

  // Pre-measure each line's advance to derive its starting X for the chosen alignment.
  const lineAdvances = rawLines.map((line) => measureLineAdvance(otFont, line, size, ls));
  const longest = Math.max(...lineAdvances, 1);

  const records = [];
  // Match the text rasteriser's pad heuristic so glyph paths land in the same
  // world position as the rendered text. Without this, the new vector layer
  // is shifted by ~`pad` from where the text was visible.
  const pad = Math.min(96, Math.max(16, Math.round(size * 0.5)));
  // First-line baseline matches our rasteriser's `pad + size * 0.85`.
  const firstBaseline = pad + size * 0.85;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const advance = lineAdvances[i];
    let x = pad;
    if (align === 'center') x = pad + (longest - advance) / 2;
    else if (align === 'right') x = pad + longest - advance;
    const y = firstBaseline + i * lineH;
    let cursor = x;
    for (const ch of line) {
      const glyph = otFont.charToGlyph(ch);
      if (!glyph) { cursor += size * 0.5; continue; }
      const otp = glyph.getPath(cursor, y, size);
      const d = otp.toPathData(2);
      if (d) {
        records.push({
          d, closed: true,
          fill:   { type: 'solid', color: t.color || '#FFFFFF', opacity: 1 },
          stroke: { type: 'none' },
        });
      }
      cursor += (glyph.advanceWidth || 0) * (size / otFont.unitsPerEm) + ls;
    }
  }

  if (!records.length) {
    showNotification('Convert to Path: no glyphs could be extracted.');
    return null;
  }

  // Add the new vector layer at the same world position as the text layer.
  const xfm = layer.transform || { x: 0, y: 0 };
  const vectorLayer = doc.addVectorLayer({
    name: `${layer.name || 'Text'} (paths)`,
    transform: { x: xfm.x, y: xfm.y },
    accentColor: layer.accentColor,
    vector: { paths: records },
  });

  if (replace) {
    doc.removeLayer(layer.id);
    showNotification('Text converted to vector — original removed. Cmd+Z to undo.');
  } else {
    showNotification('Text duplicated as vector. Original kept.');
  }
  return vectorLayer;
}

function applyTransform(s, mode) {
  if (!mode || mode === 'none') return s;
  if (mode === 'uppercase')  return s.toUpperCase();
  if (mode === 'lowercase')  return s.toLowerCase();
  if (mode === 'capitalize') return s.replace(/(^|\s)(\S)/g, (_, sp, ch) => sp + ch.toUpperCase());
  return s;
}

function measureLineAdvance(otFont, line, size, ls) {
  let total = 0;
  for (const ch of line) {
    const glyph = otFont.charToGlyph(ch);
    if (!glyph) { total += size * 0.5; continue; }
    total += (glyph.advanceWidth || 0) * (size / otFont.unitsPerEm) + ls;
  }
  return total;
}
