// Effect Library — modal picker for the Effects + button (raster + vector).
//
// Replaces the old compact dropdown menus that lived inline in
// effect-panel.js / vector-effects-panel.js. Layout pattern follows the
// Font Manager (src/ui/typography/font-picker.js + style/typography.css)
// but classes live in their own .eff-lib-* namespace.
//
// Public API
//   openEffectLibrary({ mode, anchor, doc, onPick })
//
//   mode    — 'raster' | 'vector'. Decides which plugin set is shown and
//             which storage key is used for favorites/recents.
//   anchor  — optional Element. When provided, the modal positions itself
//             below/above the anchor (clamped to viewport). When omitted,
//             it centres on the screen.
//   doc     — document store; used to read `doc.activeLayer` for the
//             "Recommended" pseudo-category in vector mode (groups boost
//             multiPathPreferred plugins to the top).
//   onPick  — (plugin) => void. Called with the chosen plugin manifest.
//             The library handles the close + recents update; the caller
//             is in charge of mutating the document.
//
// The library never calls doc.addEffect itself — that contract keeps
// raster/vector wiring symmetric and the picker side-effect free.

import { listPlugins, getPlugin } from '../plugins/registry.js';
import { PREMIUM_CATALOG } from '../plugins/premium-catalog.js';

// ---------------------------------------------------------------------------
// Category display order. Anything not in this list lands in "Other".
const CATEGORY_ORDER = [
  'image', 'color', 'stylize', 'glitch', 'distort', 'render',
  'pattern', 'combine', 'stroke', 'generate', 'other',
];
const CATEGORY_LABELS = {
  image: 'Adjustments',
  color: 'Color',
  stylize: 'Stylize',
  glitch: 'Glitch',
  distort: 'Distort',
  render: 'Render',
  pattern: 'Pattern',
  combine: 'Combine',
  stroke: 'Stroke',
  generate: 'Generate',
  other: 'Other',
};

const RECENTS_CAP = 8;
const VIEW_KEY = 'slammer:effect-library:view';
const recentsKey = (mode) => `slammer:effect-library:recents:${mode}`;
const favoritesKey = (mode) => `slammer:effect-library:favorites:${mode}`;

let active = null; // single open modal at a time

// ---------------------------------------------------------------------------

export function openEffectLibrary({ mode = 'raster', anchor = null, doc, onPick }) {
  if (active) closeLibrary();

  const plugins = collectPlugins(mode);
  const state = {
    mode,
    query: '',
    activeChip: 'all',          // 'all' | 'recents' | 'favorites' | 'pro' | <category>
    view: loadView(),
    selectedIdx: 0,
    plugins,
    visible: [],                 // filtered list (flat, in render order)
    recents: loadRecents(mode),
    favorites: loadFavorites(mode),
  };

  // In vector mode with a group active, multiPathPreferred plugins float
  // to the top — same affordance the old vector picker had.
  if (mode === 'vector') {
    const layer = doc?.activeLayer;
    const isGroup = layer && layer.type === 'group';
    if (isGroup) {
      state.plugins.sort((a, b) =>
        (b.multiPathPreferred === true) - (a.multiPathPreferred === true)
      );
    }
  }

  const root = buildDom(state, doc, onPick);
  window.document.body.appendChild(root);

  positionModal(root, anchor);
  bindEvents(root, state, doc, onPick);
  refresh(root, state);

  // Focus search after mount.
  const search = root.querySelector('.eff-lib-search');
  search?.focus();

  active = { root, state };
}

function closeLibrary() {
  if (!active) return;
  active.root.remove();
  active = null;
}

// ---------------------------------------------------------------------------
// Plugin collection — live registry merged with the premium catalog (raster).
// ---------------------------------------------------------------------------

function collectPlugins(mode) {
  if (mode === 'vector') {
    return listPlugins({ type: 'vector-filter' }).map(toEntry);
  }

  // Raster: filters + tools, then merge in catalog entries that aren't
  // already registered. Locked entries get `_locked: true`.
  const live = [
    ...listPlugins({ type: 'filter' }),
    ...listPlugins({ type: 'tool' }),
  ].map(toEntry);

  const liveIds = new Set(live.map((p) => p.id));
  const locked = PREMIUM_CATALOG
    .filter((c) => !liveIds.has(c.id))
    .map((c) => ({ ...c, _locked: true, _isPro: true }));

  // Mark live premium too — for the badge — when manifest had pack-related
  // hints. We treat any live plugin whose id matches a catalog entry as Pro.
  const catalogIds = new Set(PREMIUM_CATALOG.map((c) => c.id));
  for (const p of live) if (catalogIds.has(p.id)) p._isPro = true;

  return [...live, ...locked];
}

function toEntry(p) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    icon: p.icon || 'puzzle-piece',
    category: p.category || 'other',
    description: p.description || '',
    pack: p.pack || '',
    multiPathPreferred: p.multiPathPreferred === true,
    _locked: false,
    _isPro: false,
    // Reference back to the live manifest; used by onPick callers via getPlugin().
    _ref: p,
  };
}

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------

function buildDom(state, doc, onPick) {
  const backdrop = window.document.createElement('div');
  backdrop.className = 'eff-lib-backdrop';
  backdrop.innerHTML = `
    <div class="eff-lib" role="dialog" aria-label="Effect library" tabindex="-1">
      <div class="eff-lib-header">
        <div class="eff-lib-title">${state.mode === 'vector' ? 'Vector Effect Library' : 'Effect Library'}</div>
        <div class="eff-lib-view-toggle" role="group" aria-label="View mode">
          <button type="button" data-view="grid" title="Grid view"><i class="fas fa-th"></i></button>
          <button type="button" data-view="list" title="List view"><i class="fas fa-list"></i></button>
        </div>
        <button type="button" class="eff-lib-close" title="Close (Esc)"><i class="fas fa-times"></i></button>
      </div>
      <div class="eff-lib-search-row">
        <i class="fas fa-search eff-lib-search-icon" aria-hidden="true"></i>
        <input class="eff-lib-search" type="text" placeholder="Search effects…" autocomplete="off" spellcheck="false">
      </div>
      <div class="eff-lib-chip-row" role="tablist"></div>
      <div class="eff-lib-results" tabindex="0"></div>
      <div class="eff-lib-footer">
        <span class="eff-lib-count"></span>
        <span class="eff-lib-hint"><kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> add · <kbd>/</kbd> search · <kbd>Esc</kbd> close</span>
      </div>
    </div>
  `;
  return backdrop;
}

function positionModal(root, anchor) {
  if (!anchor) return; // centred mode — flexbox already handles it.
  root.classList.add('anchored');
  const modal = root.querySelector('.eff-lib');
  const r = anchor.getBoundingClientRect();
  // Prefer below the anchor; flip above if it overflows.
  const desiredW = 720;
  const desiredH = 600;
  const margin = 8;
  let left = r.left;
  if (left + desiredW > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - desiredW - margin);
  }
  let top = r.bottom + 6;
  if (top + desiredH > window.innerHeight - margin) {
    top = Math.max(margin, r.top - desiredH - 6);
  }
  modal.style.left = `${left}px`;
  modal.style.top = `${top}px`;
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function bindEvents(root, state, doc, onPick) {
  const modal = root.querySelector('.eff-lib');
  const search = root.querySelector('.eff-lib-search');
  const results = root.querySelector('.eff-lib-results');

  // Close
  root.querySelector('.eff-lib-close').addEventListener('click', closeLibrary);
  root.addEventListener('mousedown', (e) => {
    if (e.target === root) closeLibrary(); // backdrop click
  });

  // View toggle
  root.querySelectorAll('.eff-lib-view-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      saveView(state.view);
      refresh(root, state);
    });
  });

  // Search
  search.addEventListener('input', () => {
    state.query = search.value.trim().toLowerCase();
    state.selectedIdx = 0;
    renderResults(root, state);
  });

  // Keyboard
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLibrary();
      return;
    }
    if (e.key === '/' && document.activeElement !== search) {
      e.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if (e.key === 'Enter') {
      const item = state.visible[state.selectedIdx];
      if (item) {
        e.preventDefault();
        commitPick(item, state, doc, onPick);
      }
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      moveSelection(root, state, e.key);
    }
  });

  // Chip clicks delegated.
  root.querySelector('.eff-lib-chip-row').addEventListener('click', (e) => {
    const chip = e.target.closest('.eff-lib-chip');
    if (!chip) return;
    state.activeChip = chip.dataset.chip;
    state.selectedIdx = 0;
    refresh(root, state);
  });

  // Card clicks delegated.
  results.addEventListener('click', (e) => {
    const fav = e.target.closest('.eff-lib-fav');
    if (fav) {
      const id = fav.closest('.eff-lib-card').dataset.id;
      toggleFavorite(state, id);
      saveFavorites(state.mode, state.favorites);
      // Just toggle the class — no full re-render needed unless we're on
      // the Favorites chip, in which case the item may disappear.
      if (state.activeChip === 'favorites') {
        renderResults(root, state);
      } else {
        fav.classList.toggle('is-fav', state.favorites.has(id));
      }
      return;
    }
    const card = e.target.closest('.eff-lib-card');
    if (!card) return;
    const id = card.dataset.id;
    const item = state.visible.find((p) => p.id === id);
    if (item) commitPick(item, state, doc, onPick);
  });
}

function commitPick(item, state, doc, onPick) {
  if (item._locked) {
    // Open Bitmancer Shop. Lazy-import so the library doesn't drag the shop
    // bundle in by default.
    closeLibrary();
    import('./shop-popup.js').then(({ openShop }) => openShop?.()).catch(() => {});
    return;
  }
  // Push to recents (LRU, raster/vector keys are separate).
  state.recents = pushRecent(state.recents, item.id);
  saveRecents(state.mode, state.recents);
  closeLibrary();
  // Pass the live manifest object — callers expect a real plugin, not our
  // catalog projection.
  const live = item._ref || getPlugin(item.id);
  if (live && typeof onPick === 'function') onPick(live);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function refresh(root, state) {
  // View class on the results container drives layout.
  const results = root.querySelector('.eff-lib-results');
  results.classList.toggle('is-grid', state.view === 'grid');
  results.classList.toggle('is-list', state.view === 'list');

  // View toggle button state.
  root.querySelectorAll('.eff-lib-view-toggle button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });

  renderChips(root, state);
  renderResults(root, state);
}

function renderChips(root, state) {
  const row = root.querySelector('.eff-lib-chip-row');
  // Build chips: All, Recents, Favorites, every populated category, then Pro.
  const usedCats = new Set(state.plugins.map((p) => p.category));
  const cats = CATEGORY_ORDER.filter((c) => usedCats.has(c));

  const chips = [
    { key: 'all',        label: 'All' },
    { key: 'recents',    label: 'Recents', icon: 'clock' },
    { key: 'favorites',  label: 'Favorites', icon: 'star' },
    ...cats.map((c) => ({ key: c, label: CATEGORY_LABELS[c] || c })),
    { key: 'pro',        label: 'AddOn' },
  ];

  row.innerHTML = chips.map((c) => `
    <button type="button" class="eff-lib-chip${state.activeChip === c.key ? ' active' : ''}" data-chip="${c.key}">
      ${c.icon ? `<i class="fas fa-${c.icon}"></i>` : ''}${c.label}
    </button>
  `).join('');
}

function renderResults(root, state) {
  const results = root.querySelector('.eff-lib-results');
  const count = root.querySelector('.eff-lib-count');

  // 1) Filter by chip.
  let pool = state.plugins;
  if (state.activeChip === 'recents') {
    const order = new Map(state.recents.map((id, i) => [id, i]));
    pool = pool.filter((p) => order.has(p.id))
               .sort((a, b) => order.get(a.id) - order.get(b.id));
  } else if (state.activeChip === 'favorites') {
    pool = pool.filter((p) => state.favorites.has(p.id));
  } else if (state.activeChip === 'pro') {
    pool = pool.filter((p) => p._isPro || p._locked);
  } else if (state.activeChip !== 'all') {
    pool = pool.filter((p) => p.category === state.activeChip);
  }

  // 2) Filter by search query.
  if (state.query) {
    const q = state.query;
    pool = pool.filter((p) => {
      const hay = `${p.name} ${p.id} ${p.description} ${p.category} ${p.pack}`.toLowerCase();
      return hay.includes(q);
    });
  }

  state.visible = pool;

  // 3) Render. When the chip is "all" or pure search, group by category for
  // visual scannability. For Recents/Favorites/Pro/single-category, render
  // a flat grid — the chip already implies grouping.
  results.innerHTML = '';
  if (!pool.length) {
    results.innerHTML = `<div class="eff-lib-empty">${
      state.query ? `No effects match "${escapeHtml(state.query)}"` : 'Nothing here yet'
    }</div>`;
    count.textContent = '';
    return;
  }

  const showSections = (state.activeChip === 'all') && !state.query;
  if (showSections) {
    const buckets = new Map();
    for (const p of pool) {
      const cat = CATEGORY_ORDER.includes(p.category) ? p.category : 'other';
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat).push(p);
    }
    const orderedCats = CATEGORY_ORDER.filter((c) => buckets.has(c));
    for (const cat of orderedCats) {
      const label = window.document.createElement('div');
      label.className = 'eff-lib-section-label';
      label.textContent = CATEGORY_LABELS[cat] || cat;
      results.appendChild(label);
      const grid = window.document.createElement('div');
      grid.className = 'eff-lib-grid';
      for (const p of buckets.get(cat)) grid.appendChild(renderCard(p, state));
      results.appendChild(grid);
    }
  } else {
    const grid = window.document.createElement('div');
    grid.className = 'eff-lib-grid';
    for (const p of pool) grid.appendChild(renderCard(p, state));
    results.appendChild(grid);
  }

  // Selection highlight.
  applySelection(root, state);

  // Count line.
  const proCount = pool.filter((p) => p._isPro || p._locked).length;
  count.textContent = proCount
    ? `${pool.length} effect${pool.length === 1 ? '' : 's'} · ${proCount} pro`
    : `${pool.length} effect${pool.length === 1 ? '' : 's'}`;
}

function renderCard(p, state) {
  const card = window.document.createElement('div');
  card.className = 'eff-lib-card' + (p._locked ? ' is-locked' : '');
  card.dataset.id = p.id;
  card.setAttribute('role', 'button');
  card.tabIndex = -1;
  // Description lives in the title attribute — native browser tooltip on
  // hover. Cards stay compact so the library reads at a glance.
  if (p.description) card.title = p.description;
  const isFav = state.favorites.has(p.id);
  card.innerHTML = `
    <button class="eff-lib-fav${isFav ? ' is-fav' : ''}" type="button" title="${isFav ? 'Unfavorite' : 'Favorite'}">
      <i class="fas fa-star"></i>
    </button>
    <div class="eff-lib-card-icon"><i class="fas fa-${p.icon || 'puzzle-piece'}"></i></div>
    <div class="eff-lib-card-name">${escapeHtml(p.name)}</div>
    <div class="eff-lib-card-cat">${CATEGORY_LABELS[p.category] || p.category}</div>
    ${p._isPro || p._locked ? `<span class="eff-lib-pro-badge">AddOn</span>` : ''}
  `;
  return card;
}

function applySelection(root, state) {
  const cards = root.querySelectorAll('.eff-lib-card');
  cards.forEach((c, i) => c.classList.toggle('is-selected', i === state.selectedIdx));
  const sel = cards[state.selectedIdx];
  if (sel) {
    // Keep selection in view without snapping the search row away.
    sel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

function moveSelection(root, state, key) {
  const cards = root.querySelectorAll('.eff-lib-card');
  if (!cards.length) return;

  let idx = state.selectedIdx;
  if (state.view === 'list') {
    if (key === 'ArrowDown' || key === 'ArrowRight') idx = Math.min(cards.length - 1, idx + 1);
    if (key === 'ArrowUp'   || key === 'ArrowLeft')  idx = Math.max(0, idx - 1);
  } else {
    // Grid: estimate cols from card geometry within its parent grid.
    const cur = cards[idx];
    const grid = cur?.parentElement;
    let cols = 1;
    if (grid) {
      const first = grid.querySelector('.eff-lib-card');
      const styles = window.getComputedStyle(grid);
      const w = grid.clientWidth;
      const cardW = first?.getBoundingClientRect().width || 160;
      const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
      cols = Math.max(1, Math.floor((w + gap) / (cardW + gap)));
    }
    if (key === 'ArrowRight') idx = Math.min(cards.length - 1, idx + 1);
    if (key === 'ArrowLeft')  idx = Math.max(0, idx - 1);
    if (key === 'ArrowDown')  idx = Math.min(cards.length - 1, idx + cols);
    if (key === 'ArrowUp')    idx = Math.max(0, idx - cols);
  }
  state.selectedIdx = idx;
  applySelection(root, state);
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadView() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; }
  catch (_) { return 'grid'; }
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch (_) {}
}

function loadRecents(mode) {
  try {
    const raw = localStorage.getItem(recentsKey(mode));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, RECENTS_CAP) : [];
  } catch (_) { return []; }
}
function saveRecents(mode, list) {
  try { localStorage.setItem(recentsKey(mode), JSON.stringify(list.slice(0, RECENTS_CAP))); } catch (_) {}
}
function pushRecent(list, id) {
  const next = [id, ...list.filter((x) => x !== id)];
  return next.slice(0, RECENTS_CAP);
}

function loadFavorites(mode) {
  try {
    const raw = localStorage.getItem(favoritesKey(mode));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) { return new Set(); }
}
function saveFavorites(mode, set) {
  try { localStorage.setItem(favoritesKey(mode), JSON.stringify([...set])); } catch (_) {}
}
function toggleFavorite(state, id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
}

// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
