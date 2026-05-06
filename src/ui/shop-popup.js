// Bitmancer Shop — Specimen Catalogue.
// Type-foundry-meets-glitch-zine. Each plugin is a specimen with its own
// flag colour and character pattern. Plugins fill the card with their
// colour; vector tools breathe on cream paper. The shop chrome is mono /
// editorial italic — JetBrains Mono + Newsreader.
//
// Card content (description, FAQ, screenshots, real preview image)
// reads from optional `meta.json` next to each premium plugin's
// `index.js`. Bake-in fallback below covers the five launch specimens
// so the shop is never empty during development.

import { listPlugins } from '../plugins/registry.js';

let backdrop = null;
let viewState = { mode: 'grid', selectedId: null };

/* =========================================================================
   PLUGIN PALETTE — per-plugin flag colour and character pattern
   ========================================================================= */
// Each entry sets four CSS custom properties on the card:
//   --plugin-c       : flag colour (knallig or pastel — never both, never blended)
//   --plugin-ink     : ink colour for text on the flag (off-black for warm flags,
//                      cream for very dark flags — none in current palette)
//   --plugin-pattern : background-image with HARD-STOP primitives only.
//                      Repeating stripes / dot grids / block lines — never a
//                      smooth gradient transition. The pattern carries the
//                      plugin's character (scanline / block / dot / stipple).
//   --plugin-pattern-size : background-size for the pattern
//
// Order matters in the value of --plugin-pattern: layered patterns are
// comma-separated and Vite passes them through as plain CSS strings.
const PLUGIN_PALETTE = {
  'datamosh': {
    c: '#FF2E63',
    ink: '#0e0e10',
    pattern: `repeating-linear-gradient(0deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 6px),
              repeating-linear-gradient(90deg, rgba(14,14,16,0.55) 0 1px, transparent 1px 220px),
              repeating-linear-gradient(90deg, rgba(14,14,16,0.4) 0 2px, transparent 2px 380px)`,
    size: 'auto, auto, auto',
    blend: 'normal',
    opacity: 1,
    mark: 'TV.SIGNAL.LOST',
  },
  'jpeg-compression': {
    c: '#F5D000',
    ink: '#0e0e10',
    pattern: `linear-gradient(to right, transparent calc(100% - 1px), rgba(14,14,16,0.32) 0),
              linear-gradient(to bottom, transparent calc(100% - 1px), rgba(14,14,16,0.32) 0)`,
    size: '32px 32px, 32px 32px',
    blend: 'normal',
    opacity: 1,
    mark: 'BLOCK.8x8',
  },
  'dithering': {
    c: '#7DE0B5',
    ink: '#0e0e10',
    pattern: `radial-gradient(circle at 50% 50%, rgba(14,14,16,0.55) 1.4px, transparent 1.8px)`,
    size: '7px 7px',
    blend: 'normal',
    opacity: 1,
    mark: 'BAYER.4x4',
  },
  // Vector specimens — printed onto cream paper, the plugin colour is the ink.
  'vector-stipple': {
    c: '#B6A4FF',
    ink: '#0e0e10',
    pattern: `radial-gradient(circle at 30% 35%, var(--plugin-c) 1.4px, transparent 1.8px),
              radial-gradient(circle at 70% 65%, var(--plugin-c) 1.2px, transparent 1.6px),
              radial-gradient(circle at 15% 78%, var(--plugin-c) 1.6px, transparent 2px)`,
    size: '14px 14px, 19px 19px, 23px 23px',
    blend: 'normal',
    opacity: 0.95,
    mark: 'STIPPLE.HEX',
  },
  'vector-halftone': {
    c: '#FF6A00',
    ink: '#0e0e10',
    pattern: `radial-gradient(circle at 50% 50%, var(--plugin-c) 2.6px, transparent 3px)`,
    size: '13px 13px',
    blend: 'normal',
    opacity: 1,
    mark: 'SCREEN.85LPI',
  },
};

/* =========================================================================
   PACK metadata — pure typographic; no colour, no gradient.
   ========================================================================= */
const PACK_INFO = {
  'glitch-pack': {
    label: 'Glitch Pack',
    rule: 'Real data-domain glitches. Bit-flips, channel shifts, byte cascades. Honest corruption.',
  },
  'raster-pack': {
    label: 'Raster Pack',
    rule: 'Print-shop dot patterns and bitmap aesthetics. Dither today, halftone soon.',
  },
  'dots-pack': {
    label: 'Dots Pack',
    rule: 'Vector dot fields. Stipple and halftone applied directly to paths — scales infinitely.',
  },
};

/* =========================================================================
   Per-pack layout rhythm — assign card-size variants
   ========================================================================= */
// Returns the CSS modifier class for a card given its index in the pack and
// the pack's overall item count. Each pack composes its own rhythm so the
// shop reads like a magazine spread, not a uniform e-commerce grid.
function variantFor(packId, items) {
  const ids = items.map((it) => it.id);
  if (packId === 'glitch-pack') {
    // Datamosh as hero (8 col x 2 row), JPEG as tall sidekick (4 col x 2 row)
    return ids.map((id) => (id === 'datamosh' ? 'shop-card--hero' : ''));
  }
  if (packId === 'raster-pack') {
    // Single plugin → wide solo
    if (items.length === 1) return ['shop-card--wide'];
    return ids.map(() => '');
  }
  if (packId === 'dots-pack') {
    // Two halves
    return ids.map(() => 'shop-card--half');
  }
  return ids.map(() => '');
}

/* =========================================================================
   Fallback meta — used when a plugin has no meta.json yet
   ========================================================================= */
const FALLBACK_META = {
  'datamosh': {
    tagline: 'Bit-level corruption that actually works.',
    description: 'Four real glitch operations stacked on each input — JPEG entropy bit-flipping, RGB channel shift, bit-plane XOR, byte-skew cascades. Composable intensities, deterministic seeds, no displacement-of-pixels fakery. The good stuff.',
    faq: [
      { q: 'Is this just random pixel noise?', a: 'No. Every operation is a real data-domain glitch — JPEG marker manipulation, channel byte arithmetic, bit-plane XOR. The corruption is structurally honest and reproducible across reloads.' },
      { q: 'Can I export the result?', a: 'Yes — like any layer effect. Render the layer, export PNG/JPEG/WebP. The glitched pixels are real pixels.' },
    ],
  },
  'jpeg-compression': {
    tagline: 'Real JPEG decay, not posterise.',
    description: 'The browser\'s native JPEG encoder, pushed beyond its comfort zone. Three modes — Classic single encode, Downsample (resample then encode for blocky artefacts), Gen Loss (re-encode N passes for the "shared 50 times on Facebook" look). Quality + glitch sliders.',
    faq: [
      { q: 'Why not just lower export quality?', a: 'This effect re-encodes per-layer non-destructively, with optional resample and generation-loss passes. You can stack other effects on top of the JPEG-decayed result.' },
    ],
  },
  'dithering': {
    tagline: 'Bitmap precision: 8 algorithms, 4 colour modes.',
    description: 'Floyd-Steinberg, Atkinson, Bayer, Burkes, more. Halftone (light/dark recolour with optional transparent light), Multi (palette error-diffusion), RGB (per-channel parallel), CMYK (true colour-separated). Resolution scale slider for chunkier artefacts.',
    faq: [
      { q: 'Will this look correct printed?', a: 'CMYK mode does a real RGB→CMYK separation before dithering each channel — closest you can get to print-shop behaviour in a browser.' },
    ],
  },
  'vector-stipple': {
    tagline: 'Stipple a closed path with a uniform dot field.',
    description: 'Hex / square / random layouts, jitter control, dot size, seedable noise. Each dot inside the path is emitted as its own circle — vector output, scales infinitely, exports as SVG.',
    faq: [
      { q: 'Can I use it on text?', a: 'Convert text to path first (Text → Path in the typography panel), then apply Stipple. Each glyph becomes a stippled vector field.' },
    ],
  },
  'vector-halftone': {
    tagline: 'Stipple — but with size variation.',
    description: 'Like Stipple, but each dot\'s radius varies by gradient — linear, radial, or fbm-noise across the path. Min/max size, gradient direction, invert. Built for screenprint-style artwork that scales without resampling.',
    faq: [],
  },
};

/* =========================================================================
   meta.json loader — Vite glob, optional per-plugin override
   ========================================================================= */
let metaCache = null;
function loadMeta() {
  if (metaCache !== null) return metaCache;
  const modules = import.meta.glob('../plugins/premium/*/meta.json', { eager: true, import: 'default' });
  const map = {};
  for (const path in modules) {
    const m = path.match(/premium\/([^/]+)\/meta\.json$/);
    if (m) map[m[1]] = modules[path];
  }
  metaCache = map;
  return map;
}

function getEntry(plugin) {
  const meta = loadMeta();
  const folderId = plugin.id.startsWith('vector-') ? plugin.id.replace(/^vector-/, '') : plugin.id;
  const fileMeta = meta[folderId] || meta[plugin.id] || {};
  const fallback = FALLBACK_META[plugin.id] || {};
  const palette = PLUGIN_PALETTE[plugin.id] || {
    c: '#ebebe5', ink: '#0e0e10', pattern: 'none', size: 'auto', blend: 'normal', opacity: 1, mark: '',
  };
  return {
    id: plugin.id,
    name: plugin.name,
    type: plugin.type,
    pack: plugin.pack || null,
    isVector: plugin.type === 'vector-filter',
    palette,
    price: fileMeta.price ?? fallback.price ?? null,
    tagline: fileMeta.tagline ?? fallback.tagline ?? '',
    description: fileMeta.description ?? fallback.description ?? '',
    faq: fileMeta.faq ?? fallback.faq ?? [],
    screenshot: fileMeta.screenshot ?? null,
    screenshots: fileMeta.screenshots ?? [],
  };
}

function pluginsByPack() {
  const items = listPlugins().filter((p) => p.pro === true).map(getEntry);
  const grouped = {};
  for (const it of items) {
    const key = it.pack || 'misc';
    (grouped[key] ||= []).push(it);
  }
  return grouped;
}

/* =========================================================================
   Public API
   ========================================================================= */
export function openShop() {
  if (backdrop) return;
  viewState = { mode: 'grid', selectedId: null };

  backdrop = document.createElement('div');
  backdrop.className = 'shop-backdrop';
  backdrop.innerHTML = renderShell();
  document.body.appendChild(backdrop);
  bindEvents();

  const onKey = (e) => {
    if (e.key === 'Escape') {
      if (viewState.mode === 'detail') { setView('grid'); return; }
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop._onKey = onKey;
}

function close() {
  if (!backdrop) return;
  document.removeEventListener('keydown', backdrop._onKey);
  backdrop.remove();
  backdrop = null;
}

function setView(mode, selectedId = null) {
  viewState = { mode, selectedId };
  backdrop.querySelector('.shop-modal').innerHTML = renderInner();
  bindEvents();
}

/* =========================================================================
   Render — root shell + branching by view mode
   ========================================================================= */
function renderShell() {
  return `<div class="shop-modal" role="dialog" aria-label="Bitmancer Shop">${renderInner()}</div>`;
}
function renderInner() {
  return viewState.mode === 'detail'
    ? renderDetail(viewState.selectedId)
    : renderGrid();
}

/* ----- Header (shared across both views) ----- */
function renderHeader({ withBack = false }) {
  return `
    <header class="shop-header">
      <div class="shop-header-line">
        <span class="h-mark">bitmancer</span>
        <span>—</span>
        <span>catalogue 01</span>
        <span class="h-rule"></span>
        <span class="h-issue">2026.05</span>
      </div>
      <div class="shop-header-actions">
        ${withBack ? `<button class="shop-back" data-act="back" aria-label="Back">← back</button>` : ''}
        <button class="shop-close" data-act="close" aria-label="Close">×</button>
      </div>
    </header>
  `;
}

/* ----- Lede + filters ----- */
function renderLede() {
  return `
    <div class="shop-lede">
      <h1 class="shop-lede-title">Five plugins. <em>Five worlds.</em><br>One editor.</h1>
      <div class="shop-lede-meta">
        <span>edition 01</span><br>
        pre-launch preview<br>
        polar.sh / bitmancer
      </div>
    </div>
  `;
}

/* ----- Grid view ----- */
function renderGrid() {
  const grouped = pluginsByPack();
  const order = ['glitch-pack', 'raster-pack', 'dots-pack', 'misc'];
  const sections = order
    .filter((p) => grouped[p]?.length)
    .map((p, idx) => renderPackSection(p, grouped[p], idx))
    .join('');

  return `
    ${renderHeader({ withBack: false })}
    ${renderLede()}
    <main class="shop-content">
      ${sections}
      ${renderFuture()}
    </main>
  `;
}

function renderPackSection(packId, items, idx) {
  const info = PACK_INFO[packId] || { label: 'Misc', rule: '' };
  const variants = variantFor(packId, items);
  const num = String(idx + 1).padStart(2, '0');
  return `
    <section class="shop-pack">
      <div class="shop-pack-head">
        <div class="shop-pack-num">// ${num}</div>
        <div class="shop-pack-title">${info.label}</div>
        <div class="shop-pack-meta">${items.length} ${items.length === 1 ? 'specimen' : 'specimens'}</div>
        <p class="shop-pack-blurb">${info.rule}</p>
      </div>
      <div class="shop-grid">
        ${items.map((it, i) => renderCard(it, variants[i] || '')).join('')}
      </div>
    </section>
  `;
}

function renderCard(entry, variant) {
  const { id, name, palette, price, tagline, isVector, pack } = entry;
  const tag = pack ? PACK_INFO[pack]?.label?.replace(' Pack', '').toUpperCase() : '';
  const num = pluginNumber(id);
  const priceStr = price != null ? `€${price}.00` : 'TBD';
  const variantClass = variant ? variant : '';
  const flavour = isVector ? 'shop-card--vector' : 'shop-card--plugin';
  const style = paletteStyle(palette);
  const stamp = palette.mark || '';

  return `
    <button class="shop-card ${flavour} ${variantClass}" data-act="open" data-id="${id}" style="${style}">
      <div class="shop-card-thumb">
        ${stamp ? `<span class="shop-card-stamp">${stamp}</span>` : ''}
        <span class="shop-card-mark">${id}</span>
      </div>
      <div class="shop-card-foot">
        <span class="shop-card-num">${num}</span>
        <span class="shop-card-name">${name}</span>
        <span class="shop-card-price">${priceStr}</span>
        <span class="shop-card-tag"><span class="dot"></span>${tag}${isVector ? ' · VECTOR' : ''}</span>
      </div>
    </button>
  `;
}

/* ----- Detail view ----- */
function renderDetail(id) {
  const entries = listPlugins().filter((p) => p.pro).map(getEntry);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return `${renderHeader({ withBack: true })}<div class="shop-empty">specimen not found</div>`;

  const { name, palette, price, tagline, description, faq, screenshot, screenshots, isVector, pack } = entry;
  const num = pluginNumber(id);
  const priceStr = price != null ? `€${price}.00` : 'tbd';
  const flavour = isVector ? 'shop-detail--vector' : 'shop-detail--plugin';
  const tag = pack ? PACK_INFO[pack]?.label?.toUpperCase() : '';
  const style = paletteStyle(palette);
  const stamp = palette.mark || '';

  return `
    ${renderHeader({ withBack: true })}
    <main class="shop-content shop-detail ${flavour}" style="${style}">
      <section class="shop-detail-hero">
        <div class="shop-detail-thumb">
          ${screenshot ? `<img src="${screenshot}" alt="">` : ''}
          ${stamp ? `<span class="shop-detail-mark">${stamp}</span>` : ''}
        </div>
        <div class="shop-detail-meta">
          <div class="shop-detail-spec">
            <span class="dot"></span>
            <span class="num">${num}</span>
            <span>${tag}${isVector ? ' · VECTOR' : ''}</span>
          </div>
          <h1 class="shop-detail-name">${name}</h1>
          ${tagline ? `<p class="shop-detail-tagline">${tagline}</p>` : ''}
          <div class="shop-detail-cta">
            <span class="shop-detail-price">${priceStr}</span>
            <button class="shop-buy-btn" data-act="buy" data-id="${id}" disabled>
              <span class="arrow">→</span> Buy via Polar — soon
            </button>
          </div>
        </div>
      </section>

      <div class="shop-detail-body">
        ${description ? `
          <section class="shop-detail-section">
            <h2>// about</h2>
            <p>${description}</p>
          </section>
        ` : ''}

        ${faq.length ? `
          <section class="shop-detail-section">
            <h2>// frequently asked</h2>
            <dl class="shop-faq">
              ${faq.map((it) => `<dt>${it.q}</dt><dd>${it.a}</dd>`).join('')}
            </dl>
          </section>
        ` : ''}

        ${screenshots.length ? `
          <section class="shop-detail-section shop-detail-howitworks" style="grid-column: 1 / -1;">
            <h2>// in use</h2>
            <div class="shop-screenshots">
              ${screenshots.map((s) => `<img src="${s}" alt="">`).join('')}
            </div>
          </section>
        ` : ''}
      </div>
    </main>
  `;
}

function renderFuture() {
  return `
    <aside class="shop-future">
      <div class="shop-future-label">// in production</div>
      <p class="shop-future-list">
        Halftone <i>(raster)</i>, Background Removal, AI Inpainting, Soft Face Filter, Y2K Vector Pack, Xerox Textures, CRT Look, Mesh Warp, Organic Gradients. <a href="roadmap.md" target="_blank" rel="noreferrer">roadmap → F5</a>
      </p>
    </aside>
  `;
}

/* =========================================================================
   Helpers
   ========================================================================= */
function paletteStyle(palette) {
  // Single-quotes inside double-quoted attribute — escape pattern correctly
  // by replacing newlines and quotes with safe equivalents.
  const pattern = (palette.pattern || 'none').replace(/\s+/g, ' ').replace(/"/g, "'");
  return [
    `--plugin-c:${palette.c}`,
    `--plugin-ink:${palette.ink}`,
    `--plugin-pattern:${pattern}`,
    `--plugin-pattern-size:${palette.size || 'auto'}`,
    `--plugin-pattern-opacity:${palette.opacity ?? 1}`,
    `--plugin-pattern-blend:${palette.blend || 'normal'}`,
  ].join(';');
}

function pluginNumber(id) {
  // Stable numbering for the catalogue. Specimens 01-05 in launch order.
  const order = ['datamosh', 'jpeg-compression', 'dithering', 'vector-stipple', 'vector-halftone'];
  const idx = order.indexOf(id);
  return idx >= 0 ? String(idx + 1).padStart(2, '0') : '00';
}

function bindEvents() {
  if (!backdrop) return;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) { close(); return; }
    const card = e.target.closest('[data-act="open"]');
    if (card) { setView('detail', card.dataset.id); return; }
    if (e.target.closest('[data-act="close"]')) { close(); return; }
    if (e.target.closest('[data-act="back"]')) { setView('grid'); return; }
    // [data-act="buy"] — disabled in v1, real Polar checkout in Phase 28
  };
}
