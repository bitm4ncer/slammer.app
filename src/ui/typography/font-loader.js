// font-loader — loads font files on demand, per provider.
//
//   System fonts → already in <head>, no-op
//   Google      → <link rel="stylesheet" href="fonts.googleapis.com/css2?...">
//   Fontshare   → <link rel="stylesheet" href="api.fontshare.com/v2/css?f[]=slug">
//   Uploaded    → registered into document.fonts on app boot via uploaded-fonts.js
//
// Always exposes one function: `loadFont(meta) -> Promise<void>` and a
// preloader for an entire doc snapshot.

import { findFont, listAllFonts } from './font-sources.js';

const _loaded = new Map(); // family@source → Promise

function key(family, source) { return `${family}@${source}`; }

export function loadFont(meta) {
  if (!meta || !meta.family) return Promise.resolve();
  const k = key(meta.family, meta.source);
  if (_loaded.has(k)) return _loaded.get(k);
  let p;
  switch (meta.source) {
    case 'system':   p = Promise.resolve(); break;
    case 'uploaded': p = Promise.resolve(); break; // already in document.fonts
    case 'google':   p = loadGoogle(meta);   break;
    case 'fontshare':p = loadFontshare(meta); break;
    default:         p = Promise.resolve();
  }
  _loaded.set(k, p);
  return p;
}

function injectLink(href, id) {
  if (id && document.getElementById(id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  if (id) link.id = id;
  document.head.appendChild(link);
}

async function loadGoogle(meta) {
  // Pull every weight + variable axes the font advertises so the picker preview
  // and the canvas paint can use any value the user picks. When the catalog
  // says the font has an italic cut, request it explicitly so the browser
  // uses the REAL italic rather than synthesising a skewed roman.
  const family = meta.family.replace(/\s+/g, '+');
  const wantItalic = !!meta.italic;
  let spec;

  if (meta.variable && meta.axes && meta.axes.length) {
    // Build the axis spec. Google's API requires all axis tags + ranges
    // alphabetised; if italic is desired we add a synthetic `ital` axis
    // (range 0..1). Some variable fonts already declare ital in their fvar
    // axes — in that case we don't double it.
    const axes = [...meta.axes];
    if (wantItalic && !axes.some((a) => a.tag === 'ital')) {
      axes.push({ tag: 'ital', min: 0, max: 1 });
    }
    // Google requires lowercase tags first then uppercase; sort axes accordingly.
    axes.sort((a, b) => {
      const al = a.tag === a.tag.toLowerCase();
      const bl = b.tag === b.tag.toLowerCase();
      if (al !== bl) return al ? -1 : 1;
      return a.tag.localeCompare(b.tag);
    });
    const tags = axes.map((a) => a.tag).join(',');
    const ranges = axes.map((a) => `${a.min}..${a.max}`).join(',');
    spec = `${family}:${tags}@${ranges}`;
  } else if (meta.weights && meta.weights.length) {
    // Static font. Use the ital,wght combo so we get italic for every weight.
    if (wantItalic) {
      const ws = meta.weights.join(';');
      const both = meta.weights.flatMap((w) => [`0,${w}`, `1,${w}`]).join(';');
      spec = `${family}:ital,wght@${both}`;
      void ws;
    } else {
      spec = `${family}:wght@${meta.weights.join(';')}`;
    }
  } else {
    spec = wantItalic ? `${family}:ital@0;1` : family;
  }
  injectLink(
    `https://fonts.googleapis.com/css2?family=${spec}&display=swap`,
    `font-google-${meta.family.replace(/\W+/g, '_')}`,
  );
  if (document.fonts?.ready) await document.fonts.ready;
}

async function loadFontshare(meta) {
  // Fontshare CSS endpoint: api.fontshare.com/v2/css?f[]=slug@weights
  // To request italic styles too we add `,i` after each weight:
  //   ?f[]=satoshi@400,400i,700,700i
  const slug = meta.slug || meta.family.toLowerCase().replace(/\s+/g, '-');
  const wantItalic = !!meta.italic;
  let suffix = '';
  if (meta.weights && meta.weights.length) {
    const ws = wantItalic
      ? meta.weights.flatMap((w) => [String(w), `${w}i`]).join(',')
      : meta.weights.join(',');
    suffix = `@${ws}`;
  }
  injectLink(
    `https://api.fontshare.com/v2/css?f[]=${slug}${suffix}&display=swap`,
    `font-fontshare-${slug}`,
  );
  if (document.fonts?.ready) await document.fonts.ready;
}

// CSS family name to actually use in `font-family`. Some catalogues use a
// "display" name that differs from the underlying loaded family (e.g. our
// "Inter (System)" vs "Inter").
export function cssFamily(meta) {
  if (!meta) return 'Inter';
  return meta.cssFamily || meta.family;
}

// Walk a doc snapshot, kick off loading for every text-layer font.
export async function preloadFontsForDoc(doc) {
  const refs = new Set();
  for (const layer of doc.layers || []) {
    if (layer?.type === 'text' && layer.text?.font) {
      refs.add(`${layer.text.font}@${layer.text.provider || ''}`);
    }
  }
  const promises = [];
  for (const ref of refs) {
    const [family, source] = ref.split('@');
    const meta = findFont(family, source || undefined);
    if (meta) promises.push(loadFont(meta));
  }
  await Promise.allSettled(promises);
  // Final probe so the canvas rasteriser sees the fonts at the exact
  // weight/size combos the project uses.
  if (document.fonts?.load) {
    const probes = [];
    for (const layer of doc.layers || []) {
      if (layer?.type === 'text' && layer.text) {
        const t = layer.text;
        const meta = findFont(t.font, t.provider);
        const fam = cssFamily(meta) || t.font;
        const style = t.italic ? 'italic ' : '';
        probes.push(document.fonts.load(`${style}${t.weight || 400} ${t.size || 96}px "${fam}"`));
      }
    }
    if (probes.length) await Promise.allSettled(probes);
  }
}
