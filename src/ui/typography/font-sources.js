// font-sources — registry of font providers (System / Google / Fontshare / Uploaded).
// Each provider feeds the picker the same shape so the UI is provider-agnostic.

import googleCatalog from './font-catalogues/google.json';
import fontshareCatalog from './font-catalogues/fontshare.json';
import { listUploaded, onUploadedChange } from './uploaded-fonts.js';
import { getSystemFonts, onSystemFontsChange } from './local-system-fonts.js';

// Bundled local faces (already in the page via @font-face in main CSS or font files).
const SYSTEM_FONTS = [
  { family: 'Chicago',           source: 'system', category: 'display',     weights: [400], italic: false, variable: false, axes: [] },
  { family: 'GlyphWorld-Mountain', source: 'system', category: 'display',  weights: [400], italic: false, variable: false, axes: [], display: 'GlyphWorld' },
  { family: 'GothicPixels',      source: 'system', category: 'display',     weights: [400], italic: false, variable: false, axes: [], display: 'Gothic Pixels' },
  { family: 'Inter (System)',    source: 'system', category: 'sans-serif',  weights: [400, 500, 600, 700], italic: false, variable: false, axes: [], cssFamily: 'Inter' },
];

// Cache the merged list — only rebuild when uploaded / installed fonts change.
let _cache = null;
function rebuild() {
  const dedupedFontshare = fontshareCatalog.map(normaliseFontshare);
  // If the Local Font Access API has surfaced installed fonts, use those
  // INSTEAD of the bundled four-font fallback (else dedupe by family name).
  const installed = getSystemFonts();
  const systemBlock = installed && installed.length ? installed : SYSTEM_FONTS;
  _cache = [
    ...systemBlock,
    ...googleCatalog,
    ...dedupedFontshare,
    ...listUploaded(),
  ];
}
function normaliseFontshare(f) {
  // Source data has duplicate weights from italic variants; dedupe.
  return { ...f, weights: [...new Set(f.weights)].sort((a, b) => a - b) };
}

onUploadedChange(() => { _cache = null; });
onSystemFontsChange(() => { _cache = null; });

export function listAllFonts() {
  if (!_cache) rebuild();
  return _cache;
}

export function findFont(family, source) {
  const all = listAllFonts();
  // Source-qualified lookup (when both providers ship the same family name).
  if (source) return all.find((f) => f.family === family && f.source === source) || null;
  // Source-agnostic: prefer system → uploaded → google → fontshare so user-pinned wins.
  return all.find((f) => f.family === family && f.source === 'system')
      || all.find((f) => f.family === family && f.source === 'uploaded')
      || all.find((f) => f.family === family && f.source === 'google')
      || all.find((f) => f.family === family && f.source === 'fontshare')
      || null;
}

export const SOURCE_LABELS = {
  system: 'System',
  google: 'Google',
  fontshare: 'Fontshare',
  uploaded: 'Uploaded',
};

export const SOURCE_BADGES = {
  system: '⊡',     // ⊡
  google: 'G',
  fontshare: 'F',
  uploaded: '↑',   // ↑
};

export const CATEGORIES = ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'];
export const CATEGORY_LABELS = {
  'sans-serif': 'Sans',
  'serif': 'Serif',
  'display': 'Display',
  'handwriting': 'Hand',
  'monospace': 'Mono',
};
