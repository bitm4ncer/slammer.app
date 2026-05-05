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

// Resolve a font binary URL (or blob URL) suitable for opentype.load().
async function resolveFontBinary(meta, t) {
  if (!meta) return null;
  if (meta.source === 'uploaded') {
    const blob = await getUploadedBlob(meta.family);
    if (blob) return URL.createObjectURL(blob);
    return null;
  }
  if (meta.source === 'system') {
    return null; // not reachable without Local Font Access raw binary access
  }
  // Google + Fontshare — sniff the woff2 URL out of the @font-face the
  // loader injected. Fallback: build a one-off Google CSS request and parse.
  const fam = (meta.cssFamily || meta.family);
  const wght = (t.variation && t.variation.wght != null) ? t.variation.wght : t.weight;
  const url = await fetchFontFileUrl(fam, wght || 400, !!t.italic);
  return url;
}

async function fetchFontFileUrl(family, weight, italic) {
  // Probe Google's CSS endpoint with a precise spec, then read out the
  // .woff2 URL the @font-face uses. We have to send a UA Google likes
  // (woff2 isn't returned to "old" UAs); fetch() in a modern browser is fine.
  const fam = family.replace(/\s+/g, '+');
  const url = italic
    ? `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@1,${weight}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${fam}:wght@${weight}&display=swap`;
  try {
    const r = await fetch(url);
    const css = await r.text();
    const m = css.match(/url\((https?:\/\/[^)]+\.woff2)\)/);
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

  const fontUrl = await resolveFontBinary(meta, t);
  if (!fontUrl) {
    showNotification('Convert to Path: couldn’t locate the font file URL.');
    return null;
  }

  let otFont;
  try {
    const opentype = await loadOpentype();
    otFont = await new Promise((resolve, reject) => {
      opentype.load(fontUrl, (err, font) => err ? reject(err) : resolve(font));
    });
  } catch (e) {
    showNotification('Convert to Path: font failed to load (' + (e.message || e) + ').');
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
  // First-line baseline matches our rasteriser's `pad + size * 0.85`.
  const firstBaseline = size * 0.85;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const advance = lineAdvances[i];
    let x = 0;
    if (align === 'center') x = (longest - advance) / 2;
    else if (align === 'right') x = longest - advance;
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
