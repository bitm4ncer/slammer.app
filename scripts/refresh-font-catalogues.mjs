#!/usr/bin/env node
// Regenerate the bundled Google + Fontshare font catalogue snapshots.
//
// Usage: node scripts/refresh-font-catalogues.mjs
//
// Google Fonts: needs an API key — set GOOGLE_FONTS_API_KEY in env.
//   Get one at https://developers.google.com/fonts/docs/developer_api
//   The endpoint is free, no quota for normal usage.
//
// Fontshare: public, no key needed.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'src', 'ui', 'typography', 'font-catalogues');

// ---------- Google Fonts ----------
async function fetchGoogle() {
  const key = process.env.GOOGLE_FONTS_API_KEY;
  if (!key) {
    console.warn('[google] GOOGLE_FONTS_API_KEY not set — skipping Google refresh.');
    return null;
  }
  const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${key}&sort=popularity`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Google: ${r.status}`);
  const data = await r.json();
  // Trim to top 250 + remap shape.
  const items = (data.items || []).slice(0, 250).map((f) => ({
    family: f.family,
    source: 'google',
    category: f.category,                   // 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace'
    weights: parseWeights(f.variants),
    italic: f.variants.some((v) => v.includes('italic')),
    variable: !!(f.axes && f.axes.length),
    axes: (f.axes || []).map((a) => ({ tag: a.tag, min: a.start, max: a.end, default: a.start })),
    subsets: f.subsets,
    files: pickRegular(f.files),            // CDN URL for one weight (preview)
  }));
  return items;
}

function parseWeights(variants) {
  // Variants come as ['regular','italic','700','700italic',...]. Convert to ints.
  const ws = new Set();
  for (const v of variants) {
    if (v === 'regular' || v === 'italic') ws.add(400);
    else {
      const m = v.match(/^(\d+)/);
      if (m) ws.add(parseInt(m[1], 10));
    }
  }
  return [...ws].sort((a, b) => a - b);
}

function pickRegular(files) {
  return files?.regular || files?.['400'] || Object.values(files || {})[0] || null;
}

// ---------- Fontshare ----------
async function fetchFontshare() {
  // Fontshare public catalogue endpoint: documented at api.fontshare.com.
  // Pages of 50 fonts.
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`https://api.fontshare.com/v2/fonts?limit=50&offset=${(page - 1) * 50}`);
    if (!r.ok) throw new Error(`Fontshare page ${page}: ${r.status}`);
    const data = await r.json();
    if (!data.fonts || data.fonts.length === 0) break;
    all.push(...data.fonts);
  }
  return all.map((f) => ({
    family: f.name,
    source: 'fontshare',
    slug: f.slug,
    category: mapFontshareCategory(f.tags || []),
    weights: (f.styles || []).map((s) => s.weight?.weight || 400).filter(Boolean),
    italic: (f.styles || []).some((s) => s.is_italic),
    variable: !!(f.styles || []).find((s) => s.is_variable),
    axes: [], // Fontshare's API doesn't expose fvar ranges directly — populated lazily on use
    foundry: f.foundry?.name || 'Indian Type Foundry',
  }));
}

function mapFontshareCategory(tags) {
  const t = tags.map((x) => x.toLowerCase());
  if (t.includes('serif')) return 'serif';
  if (t.includes('mono') || t.includes('monospace')) return 'monospace';
  if (t.includes('display')) return 'display';
  if (t.includes('handwriting') || t.includes('script')) return 'handwriting';
  return 'sans-serif';
}

// ---------- Run ----------
const [google, fontshare] = await Promise.all([
  fetchGoogle().catch((e) => { console.error('[google]', e.message); return null; }),
  fetchFontshare().catch((e) => { console.error('[fontshare]', e.message); return null; }),
]);

if (google) {
  writeFileSync(resolve(OUT_DIR, 'google.json'), JSON.stringify(google, null, 0));
  console.log(`[google] wrote ${google.length} fonts`);
}
if (fontshare) {
  writeFileSync(resolve(OUT_DIR, 'fontshare.json'), JSON.stringify(fontshare, null, 0));
  console.log(`[fontshare] wrote ${fontshare.length} fonts`);
}
