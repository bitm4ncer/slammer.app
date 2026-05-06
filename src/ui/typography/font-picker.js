// font-picker — portaled popup font browser.
//   • Fuzzy search + provider/category chips + favourite/recent filters
//   • Live-preview tiles ("The quick brown fox") loaded lazily
//   • Drag + drop file upload at the bottom of the popup
//   • G2: "import layer text" icon button next to preview-text input
//   • G3: live hover preview on the active text layer (settings-gated)

import {
  listAllFonts, findFont, SOURCE_LABELS, SOURCE_BADGES,
  CATEGORIES, CATEGORY_LABELS,
} from './font-sources.js';
import { loadFont, cssFamily } from './font-loader.js';
import { uploadFontFile, deleteUploadedFont, onUploadedChange } from './uploaded-fonts.js';
import { isSupported as localFontsSupported, getSystemFonts, loadSystemFonts, onSystemFontsChange } from './local-system-fonts.js';

const STORE_FAV = 'slammer:fonts:favourites';
const STORE_RECENT = 'slammer:fonts:recent';
const STORE_PREVIEW_TEXT = 'slammer:fonts:previewText';
const STORE_PREVIEW_SIZE = 'slammer:fonts:previewSize';
const DEFAULT_PREVIEW_TEXT = 'The quick brown fox jumps over a dog';
const DEFAULT_PREVIEW_SIZE = 18;

let openPopup = null;

function loadFavourites() {
  try { return new Set(JSON.parse(localStorage.getItem(STORE_FAV) || '[]')); }
  catch { return new Set(); }
}
function saveFavourites(set) {
  try { localStorage.setItem(STORE_FAV, JSON.stringify([...set])); } catch {}
}
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); }
  catch { return []; }
}
function pushRecent(family, source) {
  const list = loadRecent().filter((r) => !(r.family === family && r.source === source));
  list.unshift({ family, source });
  while (list.length > 12) list.pop();
  try { localStorage.setItem(STORE_RECENT, JSON.stringify(list)); } catch {}
}

export function openFontPicker({ current, onPick, anchor, doc, getSettings } = {}) {
  if (openPopup) { openPopup.close(); }

  const state = {
    query: '',
    providers: new Set(['system', 'google', 'fontshare', 'uploaded']),
    categories: new Set(),
    showFavOnly: false,
    showRecentOnly: false,
    showVariableOnly: false,
    favourites: loadFavourites(),
    previewText: localStorage.getItem(STORE_PREVIEW_TEXT) || DEFAULT_PREVIEW_TEXT,
    previewSize: parseInt(localStorage.getItem(STORE_PREVIEW_SIZE), 10) || DEFAULT_PREVIEW_SIZE,
    activeIdx: 0,
  };

  const backdrop = document.createElement('div');
  backdrop.className = 'font-picker-backdrop';
  backdrop.innerHTML = `
    <div class="font-picker" role="dialog" aria-label="Font picker">
      <div class="fp-search-row">
        <i class="fas fa-search fp-search-icon"></i>
        <input type="text" class="fp-search" placeholder="Search fonts…" autofocus />
        <button class="fp-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <div class="fp-chip-row" data-row="providers"></div>
      <div class="fp-chip-row" data-row="categories">
        <span class="fp-chip-divider" aria-hidden="true"></span>
        <button class="fp-chip fp-fav-toggle" data-toggle="fav" title="Favourites only"><i class="fas fa-star"></i></button>
        <button class="fp-chip" data-toggle="recent" title="Recently used"><i class="fas fa-clock-rotate-left"></i></button>
        <button class="fp-chip" data-toggle="variable" title="Variable fonts only (one file, multiple axes)">VF</button>
      </div>
      <div class="fp-preview-row">
        <div class="fp-preview-text-wrap">
          <input type="text" class="fp-preview-text" placeholder="Preview text…" />
          <button type="button" class="fp-import-text-btn" title="Use selected layer's text" aria-label="Use selected layer's text">
            <i class="fas fa-arrow-down-to-line"></i>
          </button>
        </div>
        <div class="fp-preview-size-wrap">
          <input type="range" class="fp-preview-size" min="10" max="80" step="1" />
          <span class="fp-preview-size-readout">18px</span>
        </div>
      </div>
      <div class="fp-tile-list" tabindex="0"></div>
      <div class="fp-footer">
        <span class="fp-count"></span>
        <button class="fp-upload-btn"><i class="fas fa-cloud-arrow-up"></i> Upload font</button>
      </div>
      <input type="file" class="fp-file-input" accept=".ttf,.otf,.woff,.woff2,.ttc" hidden />
    </div>
  `;
  document.body.appendChild(backdrop);

  const popup = backdrop.querySelector('.font-picker');
  const searchInput = backdrop.querySelector('.fp-search');
  const tileList = backdrop.querySelector('.fp-tile-list');
  const fileInput = backdrop.querySelector('.fp-file-input');
  const countEl = backdrop.querySelector('.fp-count');
  const prevTextInput = backdrop.querySelector('.fp-preview-text');
  const importTextBtn = backdrop.querySelector('.fp-import-text-btn');
  const prevSizeInput = backdrop.querySelector('.fp-preview-size');
  const prevSizeReadout = backdrop.querySelector('.fp-preview-size-readout');
  prevTextInput.value = state.previewText;
  prevSizeInput.value = state.previewSize;
  prevSizeReadout.textContent = `${state.previewSize}px`;
  prevTextInput.addEventListener('input', () => {
    state.previewText = prevTextInput.value;
    try { localStorage.setItem(STORE_PREVIEW_TEXT, state.previewText); } catch {}
    // Just update preview text in-place — no need to rebuild tiles.
    backdrop.querySelectorAll('.fp-tile-preview').forEach((p) => { p.textContent = state.previewText; });
  });

  // G2 — import layer text button: populate preview text from active text layer.
  function syncImportBtn() {
    if (!doc) { importTextBtn.style.display = 'none'; return; }
    const activeLayer = doc.activeLayer;
    const hasText = activeLayer?.type === 'text' && activeLayer.text?.value?.trim();
    importTextBtn.disabled = !hasText;
    importTextBtn.classList.toggle('disabled', !hasText);
  }
  syncImportBtn();
  importTextBtn.addEventListener('click', () => {
    if (!doc) return;
    const activeLayer = doc.activeLayer;
    if (!activeLayer || activeLayer.type !== 'text') return;
    const content = activeLayer.text?.value || '';
    if (!content.trim()) return;
    prevTextInput.value = content;
    state.previewText = content;
    try { localStorage.setItem(STORE_PREVIEW_TEXT, content); } catch {}
    backdrop.querySelectorAll('.fp-tile-preview').forEach((p) => { p.textContent = content; });
  });
  prevSizeInput.addEventListener('input', () => {
    state.previewSize = parseInt(prevSizeInput.value, 10);
    prevSizeReadout.textContent = `${state.previewSize}px`;
    try { localStorage.setItem(STORE_PREVIEW_SIZE, String(state.previewSize)); } catch {}
    backdrop.querySelectorAll('.fp-tile-preview').forEach((p) => { p.style.fontSize = `${state.previewSize}px`; });
  });

  // Build chip rows.
  const provRow = backdrop.querySelector('[data-row=providers]');
  for (const src of ['system', 'google', 'fontshare', 'uploaded']) {
    const b = document.createElement('button');
    b.className = 'fp-chip';
    b.dataset.provider = src;
    b.innerHTML = `${SOURCE_BADGES[src]} ${SOURCE_LABELS[src]}`;
    b.addEventListener('click', () => {
      if (state.providers.has(src)) state.providers.delete(src);
      else state.providers.add(src);
      if (state.providers.size === 0) state.providers = new Set(['system','google','fontshare','uploaded']);
      syncChips(); render();
    });
    provRow.appendChild(b);
  }
  // "Load installed system fonts" — surfaced when the browser supports
  // the Local Font Access API but we haven't loaded them yet this session.
  if (localFontsSupported() && !getSystemFonts()) {
    const loadBtn = document.createElement('button');
    loadBtn.className = 'fp-chip fp-load-installed';
    loadBtn.innerHTML = '<i class="fas fa-plus"></i> Load installed';
    loadBtn.title = 'Surface every font installed on this machine (browser will ask permission).';
    loadBtn.addEventListener('click', async () => {
      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading…';
      const list = await loadSystemFonts({ requestPermission: true });
      if (list) {
        loadBtn.remove();
        render();
      } else {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Permission denied';
        loadBtn.classList.add('disabled');
      }
    });
    provRow.appendChild(loadBtn);
  }
  const catRow = backdrop.querySelector('[data-row=categories]');
  for (const cat of CATEGORIES) {
    const b = document.createElement('button');
    b.className = 'fp-chip';
    b.dataset.category = cat;
    b.textContent = CATEGORY_LABELS[cat];
    b.addEventListener('click', () => {
      if (state.categories.has(cat)) state.categories.delete(cat);
      else state.categories.add(cat);
      syncChips(); render();
    });
    catRow.appendChild(b);
  }
  backdrop.querySelector('[data-toggle=fav]').addEventListener('click', () => {
    state.showFavOnly = !state.showFavOnly; syncChips(); render();
  });
  backdrop.querySelector('[data-toggle=recent]').addEventListener('click', () => {
    state.showRecentOnly = !state.showRecentOnly; syncChips(); render();
  });
  backdrop.querySelector('[data-toggle=variable]').addEventListener('click', () => {
    state.showVariableOnly = !state.showVariableOnly; syncChips(); render();
  });

  function syncChips() {
    backdrop.querySelectorAll('[data-provider]').forEach((b) => {
      b.classList.toggle('active', state.providers.has(b.dataset.provider));
    });
    backdrop.querySelectorAll('[data-category]').forEach((b) => {
      b.classList.toggle('active', state.categories.has(b.dataset.category));
    });
    backdrop.querySelector('[data-toggle=fav]').classList.toggle('active', state.showFavOnly);
    backdrop.querySelector('[data-toggle=recent]').classList.toggle('active', state.showRecentOnly);
    backdrop.querySelector('[data-toggle=variable]').classList.toggle('active', state.showVariableOnly);
  }
  syncChips();

  // ---------- Search ----------
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    state.activeIdx = 0;
    render();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); applyActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  function moveActive(delta) {
    const tiles = tileList.querySelectorAll('.fp-tile');
    if (!tiles.length) return;
    state.activeIdx = Math.max(0, Math.min(tiles.length - 1, state.activeIdx + delta));
    tiles.forEach((t, i) => t.classList.toggle('active', i === state.activeIdx));
    tiles[state.activeIdx]?.scrollIntoView({ block: 'nearest' });
  }
  function applyActive() {
    const tiles = tileList.querySelectorAll('.fp-tile');
    const t = tiles[state.activeIdx];
    if (t) selectFont(t.dataset.family, t.dataset.source);
  }

  // ---------- Tile rendering ----------
  let observer = null;
  function render() {
    const all = listAllFonts();
    const recent = state.showRecentOnly ? loadRecent() : null;
    let items = all.filter((f) => {
      if (!state.providers.has(f.source)) return false;
      if (state.categories.size && !state.categories.has(f.category)) return false;
      if (state.showFavOnly && !state.favourites.has(famKey(f))) return false;
      if (state.showVariableOnly && !f.variable) return false;
      if (recent && !recent.some((r) => r.family === f.family && r.source === f.source)) return false;
      if (state.query) {
        const q = state.query;
        const hay = `${f.family} ${f.foundry || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Pin favourites to the top (unless showing recents — keep recent order).
    if (!recent) {
      items.sort((a, b) => {
        const fa = state.favourites.has(famKey(a)) ? 0 : 1;
        const fb = state.favourites.has(famKey(b)) ? 0 : 1;
        return fa - fb;
      });
    } else {
      // Order matches the "recent" array order.
      items.sort((a, b) => {
        const ai = recent.findIndex((r) => r.family === a.family && r.source === a.source);
        const bi = recent.findIndex((r) => r.family === b.family && r.source === b.source);
        return ai - bi;
      });
    }

    countEl.textContent = `${items.length} font${items.length === 1 ? '' : 's'}`;
    tileList.innerHTML = '';
    if (observer) { observer.disconnect(); observer = null; }
    if (!items.length) {
      tileList.innerHTML = '<div class="fp-empty">No fonts match — try clearing filters.</div>';
      return;
    }
    observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const tile = en.target;
        const family = tile.dataset.family;
        const source = tile.dataset.source;
        const meta = findFont(family, source);
        if (!meta) continue;
        loadFont(meta).then(() => {
          const fam = cssFamily(meta);
          const preview = tile.querySelector('.fp-tile-preview');
          if (preview) {
            preview.style.fontFamily = `"${fam}", system-ui, sans-serif`;
            preview.classList.add('loaded');
          }
        });
        observer.unobserve(tile);
      }
    }, { root: tileList, rootMargin: '200px' });

    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      const tile = document.createElement('div');
      tile.className = 'fp-tile';
      tile.dataset.family = f.family;
      tile.dataset.source = f.source;
      const isCurrent = current && current.family === f.family && current.provider === f.source;
      if (isCurrent) tile.classList.add('selected');
      const isFav = state.favourites.has(famKey(f));
      const display = f.display || f.family;
      const variableTag = f.variable ? '<span class="fp-tile-vf" title="Variable font">VF</span>' : '';
      const deleteBtn = f.source === 'uploaded'
        ? '<button class="fp-tile-delete" title="Remove uploaded font" data-act="delete-upload"><i class="fas fa-trash"></i></button>' : '';
      tile.innerHTML = `
        <div class="fp-tile-head">
          <span class="fp-tile-name">${escapeHtml(display)}${variableTag}</span>
          <span class="fp-tile-badge fp-tile-badge--${f.source}" title="${SOURCE_LABELS[f.source]}">${SOURCE_BADGES[f.source]}</span>
          <button class="fp-tile-fav ${isFav ? 'is-fav' : ''}" data-act="fav" aria-label="Favourite">
            <i class="fa${isFav ? 's' : 'r'} fa-star"></i>
          </button>
          ${deleteBtn}
        </div>
        <div class="fp-tile-preview" style="font-size: ${state.previewSize}px">${escapeHtml(state.previewText)}</div>
      `;
      tile.addEventListener('click', (e) => {
        if (e.target.closest('[data-act=fav]')) {
          const k = famKey(f);
          if (state.favourites.has(k)) state.favourites.delete(k); else state.favourites.add(k);
          saveFavourites(state.favourites);
          render();
          return;
        }
        if (e.target.closest('[data-act=delete-upload]')) {
          if (confirm(`Remove "${f.family}" from your uploaded fonts?`)) {
            deleteUploadedFont(f.family).then(render);
          }
          return;
        }
        // G3: on click revert any ephemeral preview and commit permanently.
        if (_livePreviewActive) revertLivePreview();
        selectFont(f.family, f.source);
      });

      // G3 — live font preview on hover.
      tile.addEventListener('mouseenter', () => {
        if (!doc || !getSettings) return;
        const settings = getSettings();
        if (!settings.liveFontPreview) return;
        const layer = doc.activeLayer;
        if (!layer || layer.type !== 'text') return;
        activateLivePreview(layer, f.family, f.source);
      });
      tile.addEventListener('mouseleave', () => {
        if (_livePreviewActive) revertLivePreview();
      });

      if (i === state.activeIdx) tile.classList.add('active');
      tileList.appendChild(tile);
      observer.observe(tile);
    }
  }

  // G3 — live preview state: store original font so we can revert.
  let _livePreviewActive = false;
  let _livePreviewLayerId = null;
  let _livePreviewOrigFont = null;
  let _livePreviewOrigProvider = null;

  function activateLivePreview(layer, family, source) {
    if (!doc) return;
    if (!_livePreviewActive) {
      _livePreviewLayerId = layer.id;
      _livePreviewOrigFont = layer.text.font;
      _livePreviewOrigProvider = layer.text.provider;
    }
    _livePreviewActive = true;
    // Load the font first so the canvas preview is crisp.
    const meta = findFont(family, source);
    if (meta) loadFont(meta).catch(() => {});
    doc.setTextPropEphemeral(layer.id, 'font', family);
    doc.setTextPropEphemeral(layer.id, 'provider', source);
  }

  function revertLivePreview() {
    if (!doc || !_livePreviewActive) return;
    const layer = doc.findLayer(_livePreviewLayerId);
    if (layer) {
      doc.setTextPropEphemeral(layer.id, 'font', _livePreviewOrigFont);
      doc.setTextPropEphemeral(layer.id, 'provider', _livePreviewOrigProvider);
    }
    _livePreviewActive = false;
    _livePreviewLayerId = null;
    _livePreviewOrigFont = null;
    _livePreviewOrigProvider = null;
  }

  function selectFont(family, source) {
    pushRecent(family, source);
    onPick?.({ family, provider: source });
    close();
  }

  // ---------- Upload ----------
  backdrop.querySelector('.fp-upload-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files || [])];
    for (const f of files) await acceptFile(f);
    fileInput.value = '';
  });
  popup.addEventListener('dragover', (e) => { e.preventDefault(); popup.classList.add('drag-over'); });
  popup.addEventListener('dragleave', () => popup.classList.remove('drag-over'));
  popup.addEventListener('drop', async (e) => {
    e.preventDefault();
    popup.classList.remove('drag-over');
    const files = [...(e.dataTransfer?.files || [])];
    for (const f of files) await acceptFile(f);
  });

  async function acceptFile(file) {
    if (!file) return;
    try {
      await uploadFontFile(file);
      // Switch provider chip on so the new font is visible.
      state.providers.add('uploaded');
      syncChips();
      render();
    } catch (e) {
      alert(`Couldn't load font "${file.name}": ${e.message || e}`);
    }
  }

  // Re-render when uploaded set changes externally.
  const offUpload = onUploadedChange(() => render());
  // …or when the user grants Local Font Access permission.
  const offSystem = onSystemFontsChange(() => render());

  // ---------- Close handling ----------
  function close() {
    // G3: revert live preview if picker closed without clicking a tile.
    if (_livePreviewActive) revertLivePreview();
    offUpload();
    offSystem();
    if (observer) observer.disconnect();
    document.removeEventListener('keydown', onGlobalKey, true);
    backdrop.remove();
    if (openPopup === api) openPopup = null;
  }
  function onGlobalKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }
  document.addEventListener('keydown', onGlobalKey, true);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
  });

  // Anchor-relative position (drop-down style); fallback to centred.
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${Math.min(window.innerHeight - 540, r.bottom + 6)}px`;
    popup.style.left = `${Math.min(window.innerWidth - 580, Math.max(8, r.left))}px`;
    backdrop.classList.add('anchored');
  }

  render();
  searchInput.focus();
  const api = { close };
  openPopup = api;
  return api;
}

function famKey(f) { return `${f.family}@${f.source}`; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
