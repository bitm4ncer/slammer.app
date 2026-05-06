// Bitmancer Shop — full-screen overlay listing premium plugins, effects,
// vector tools and asset packs. Plugins listed are those with `pro: true`
// in their manifest. Card content (description, FAQ, screenshots) reads
// from an optional `meta.json` next to the plugin's `index.js`. Fallback
// content is baked in below so the shop is never empty during dev.
//
// v1 — no real commerce wiring. "Buy" buttons are placeholders that point
// at Polar.sh once Phase 28 lands. Owned-state is implicit ("you have it
// because you developed it") — license-checking lives in Phase 28.

import { listPlugins } from '../plugins/registry.js';

let backdrop = null;
let viewState = { mode: 'grid', selectedId: null };

const PACK_INFO = {
  'glitch-pack': {
    label: 'Glitch Pack',
    short: 'GLITCH',
    accent: '#ff3a73',
    accent2: '#ff9f1a',
    blurb: 'Real data-domain glitches — bit-flips, channel shifts, byte cascades. The good stuff, not faked.',
  },
  'raster-pack': {
    label: 'Raster Pack',
    short: 'RASTER',
    accent: '#3aa0ff',
    accent2: '#1ad4d4',
    blurb: 'Print-shop dot patterns and bitmap aesthetics — dither, halftone, screenprint.',
  },
  'dots-pack': {
    label: 'Dots Pack',
    short: 'DOTS',
    accent: '#a0e024',
    accent2: '#ffd000',
    blurb: 'Vector dot fields — stipple, halftone, dot-art applied directly to paths.',
  },
};

// Placeholder pricing — overridden by meta.json when present. Phase 28
// commerce wiring will pull final prices from Polar product listings.
const FALLBACK_PRICE = {
  'datamosh': 7,
  'jpeg-compression': 7,
  'dithering': 7,
  'vector-stipple': 5,
  'vector-halftone': 5,
};

// Tagline + short description for each known plugin id. meta.json wins
// over these when it exists. These are deliberately cheeky/punchy to set
// the brand voice — refine before public launch.
const FALLBACK_META = {
  'datamosh': {
    tagline: 'Bit-level corruption that actually works.',
    description: 'Four real glitch operations stacked on each input: JPEG entropy bit-flipping, RGB channel shift, bit-plane XOR, and byte-skew cascades. Composable intensities, deterministic seeds, no displacement-of-pixels fakery.',
    faq: [
      { q: 'Is this just random pixel noise?', a: 'No. Every effect is a real data-domain glitch — JPEG marker manipulation, channel byte arithmetic, bit-plane operations. The corruption is structurally honest.' },
      { q: 'Can I export the glitched result?', a: 'Yes — just like any other effect, render the layer and export PNG/JPEG.' },
    ],
  },
  'jpeg-compression': {
    tagline: 'Real JPEG decay, not posterise.',
    description: 'Uses the browser\'s native JPEG encoder for honest compression artefacts. Three modes — Classic, Downsample (resample-then-encode for blocky artefacts), Gen Loss (re-encode N passes for the "shared 50 times on Facebook" look). Quality + glitch sliders.',
    faq: [
      { q: 'Why not just lower JPEG quality on export?', a: 'This effect re-encodes per-layer non-destructively, with optional resample and generation-loss passes. You can stack other effects on top of the JPEG-decayed result.' },
    ],
  },
  'dithering': {
    tagline: 'Bitmap precision: 8 algorithms, 4 colour modes.',
    description: 'Floyd-Steinberg, Atkinson, Bayer, Burkes and more. Halftone (light/dark recolour with optional transparent light), Multi (palette error-diffusion), RGB (per-channel parallel), CMYK (true colour-separated). Resolution scale slider.',
    faq: [
      { q: 'Will this look correct printed?', a: 'CMYK mode does a real RGB→CMYK separation before dithering each channel — the closest you can get to print-shop behaviour in a browser.' },
    ],
  },
  'vector-stipple': {
    tagline: 'Stipple a closed path with a uniform dot field.',
    description: 'Hex / square / random layouts, jitter control, dot size, seedable noise. Each dot inside the path is emitted as its own circle — vector output, scales infinitely.',
    faq: [],
  },
  'vector-halftone': {
    tagline: 'Stipple, but with size variation.',
    description: 'Like Stipple, but each dot\'s radius varies by gradient — linear, radial, or fbm-noise across the path. Min/max size, gradient direction, invert.',
    faq: [],
  },
};

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
  return {
    id: plugin.id,
    name: plugin.name,
    icon: plugin.icon || 'puzzle-piece',
    pack: plugin.pack || null,
    type: plugin.type,
    price: fileMeta.price ?? fallback.price ?? FALLBACK_PRICE[plugin.id] ?? null,
    tagline: fileMeta.tagline ?? fallback.tagline ?? '',
    description: fileMeta.description ?? fallback.description ?? '',
    faq: fileMeta.faq ?? fallback.faq ?? [],
    screenshots: fileMeta.screenshots ?? [],
    owned: true, // dev-mode default; Phase 28 wires real license check
  };
}

function listPremium() {
  return listPlugins().filter((p) => p.pro === true).map(getEntry);
}

export function openShop() {
  if (backdrop) return;
  viewState = { mode: 'grid', selectedId: null };

  backdrop = document.createElement('div');
  backdrop.className = 'shop-backdrop';
  backdrop.innerHTML = renderRoot();
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

function renderRoot() {
  return `<div class="shop-modal" role="dialog" aria-label="Bitmancer Shop">${renderInner()}</div>`;
}

function renderInner() {
  if (viewState.mode === 'detail') return renderDetail(viewState.selectedId);
  return renderGrid();
}

function renderGrid() {
  const items = listPremium();
  const byPack = {};
  for (const it of items) {
    const key = it.pack || 'misc';
    (byPack[key] ||= []).push(it);
  }

  const packOrder = ['glitch-pack', 'raster-pack', 'dots-pack'];
  const sections = packOrder
    .filter((p) => byPack[p]?.length)
    .map((p) => renderPackSection(p, byPack[p]))
    .join('');
  const misc = byPack.misc?.length ? renderPackSection('misc', byPack.misc) : '';

  return `
    <div class="shop-header">
      <div class="shop-header-title">
        <i class="fas fa-bag-shopping"></i>
        <span>Bitmancer Shop</span>
      </div>
      <div class="shop-header-right">
        <span class="shop-header-tag">PRE-LAUNCH PREVIEW</span>
        <button class="shop-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
    </div>

    <div class="shop-content">
      <div class="shop-intro">
        <p>Free app, à-la-carte premium plugins. Pay only for what you actually use. <a href="STRATEGY.md" target="_blank" rel="noreferrer">Read the strategy →</a></p>
      </div>
      ${sections}
      ${misc}
      <div class="shop-future">
        <h2>Coming soon</h2>
        <p>Halftone (raster), Background Removal, AI Inpainting, Soft Face Filter, Y2K Vector Pack, Xerox Textures, CRT Look, Mesh Warp, Organic Gradients. See <a href="roadmap.md" target="_blank" rel="noreferrer">roadmap.md → F5</a>.</p>
      </div>
    </div>
  `;
}

function renderPackSection(packId, items) {
  const info = PACK_INFO[packId] || { label: 'Other', short: 'OTHER', accent: '#888', accent2: '#aaa', blurb: '' };
  return `
    <section class="shop-pack" style="--pack-a:${info.accent};--pack-b:${info.accent2};">
      <div class="shop-pack-head">
        <div class="shop-pack-title">${info.label}</div>
        <div class="shop-pack-blurb">${info.blurb}</div>
      </div>
      <div class="shop-grid">
        ${items.map(renderCard).join('')}
      </div>
    </section>
  `;
}

function renderCard(entry) {
  const info = PACK_INFO[entry.pack] || { short: '', accent: '#888', accent2: '#aaa' };
  const priceLabel = entry.price != null ? `€${entry.price}` : 'TBD';
  return `
    <button class="shop-card" data-act="open" data-id="${entry.id}" style="--pack-a:${info.accent};--pack-b:${info.accent2};">
      <div class="shop-card-thumb">
        <i class="fas fa-${entry.icon}"></i>
      </div>
      <div class="shop-card-body">
        <div class="shop-card-row">
          <span class="shop-card-name">${entry.name}</span>
          <span class="shop-card-price">${priceLabel}</span>
        </div>
        ${entry.tagline ? `<div class="shop-card-tagline">${entry.tagline}</div>` : ''}
        ${info.short ? `<div class="shop-card-pack">${info.short}</div>` : ''}
      </div>
    </button>
  `;
}

function renderDetail(id) {
  const items = listPremium();
  const entry = items.find((e) => e.id === id);
  if (!entry) return '<div class="shop-empty">Plugin not found.</div>';
  const info = PACK_INFO[entry.pack] || { label: '', short: '', accent: '#888', accent2: '#aaa', blurb: '' };
  const priceLabel = entry.price != null ? `€${entry.price}` : 'Price TBD';
  return `
    <div class="shop-header">
      <div class="shop-header-title">
        <button class="shop-back" data-act="back" aria-label="Back"><i class="fas fa-chevron-left"></i></button>
        <span>${entry.name}</span>
      </div>
      <div class="shop-header-right">
        <button class="shop-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
    </div>

    <div class="shop-content shop-detail" style="--pack-a:${info.accent};--pack-b:${info.accent2};">
      <div class="shop-detail-hero">
        <div class="shop-detail-thumb">
          <i class="fas fa-${entry.icon}"></i>
        </div>
        <div class="shop-detail-meta">
          <div class="shop-detail-pack">${info.label}</div>
          <h1 class="shop-detail-name">${entry.name}</h1>
          ${entry.tagline ? `<p class="shop-detail-tagline">${entry.tagline}</p>` : ''}
          <div class="shop-detail-cta">
            <span class="shop-detail-price">${priceLabel}</span>
            <button class="shop-buy-btn" data-act="buy" data-id="${entry.id}" disabled>
              <i class="fas fa-bag-shopping"></i> Buy — Coming soon
            </button>
          </div>
        </div>
      </div>

      ${entry.description ? `
        <section class="shop-detail-section">
          <h2>About</h2>
          <p>${entry.description}</p>
        </section>
      ` : ''}

      ${entry.screenshots.length ? `
        <section class="shop-detail-section">
          <h2>Screenshots</h2>
          <div class="shop-screenshots">
            ${entry.screenshots.map((src) => `<img src="${src}" alt="">`).join('')}
          </div>
        </section>
      ` : ''}

      ${entry.faq.length ? `
        <section class="shop-detail-section">
          <h2>FAQ</h2>
          <dl class="shop-faq">
            ${entry.faq.map((item) => `
              <dt>${item.q}</dt>
              <dd>${item.a}</dd>
            `).join('')}
          </dl>
        </section>
      ` : ''}

      <section class="shop-detail-section shop-detail-meta-end">
        <h2>How it works</h2>
        <p>This is a Bitmancer-made premium plugin. It's loaded into slammer at runtime through the public plugin API; the source is closed but the plugin contract is documented in <code>src/plugins/plugin-contract.md</code>. Once Phase 28 ships (Bitmancer Library + Polar.sh), purchases happen via Polar with EU VAT handled, and your owned plugins install with one click.</p>
      </section>
    </div>
  `;
}

function bindEvents() {
  if (!backdrop) return;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) { close(); return; }
    const card = e.target.closest('[data-act="open"]');
    if (card) { setView('detail', card.dataset.id); return; }
    if (e.target.closest('[data-act="close"]')) { close(); return; }
    if (e.target.closest('[data-act="back"]')) { setView('grid'); return; }
    if (e.target.closest('[data-act="buy"]')) {
      // Phase 28 wires real Polar checkout. v1: no-op (button is disabled anyway).
    }
  };
}
