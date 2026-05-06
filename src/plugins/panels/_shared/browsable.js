// Shared "browsable image source" plugin shell.
// Used by Unsplash and Pexels — feed it a `searchFn` and a `mapResult` adapter
// and it renders Search / Favorites / Folders tabs with grid + drag-import.

import {
  addFavorite, removeFavorite, listFavorites, isFavorited,
  createFolder, listFolders, renameFolder, deleteFolder, moveFavoriteToFolder,
} from '../../../io/plugin-store.js';
import { showConfirm } from '../../../ui/confirm-prompt.js';

export function createBrowsable({
  pluginId,
  container,
  ctx,
  searchFn,        // async (query, page) => { results: [], hasMore }
  mapResult,       // (raw) => { id, thumbUrl, fullUrl, attribution }
  apiKeyMissingMessage,
  apiKeyConfigured,
  landingHeadline = 'Search for images',     // Big text shown on first open.
  landingPlaceholder = 'Search…',             // Bigger placeholder on the landing input.
  landingTags = [],       // Clickable search suggestion pills.
  landingQueries = [],    // Random pool for the preview feed.
  curatedFn = null,       // Optional async (page) => { results, hasMore } (e.g. Pexels curated).
}) {
  container.innerHTML = `
    <div class="browsable-tabs">
      <div class="browsable-tabs-left">
        <button class="browsable-tab active" data-tab="search">Search</button>
        <button class="browsable-tab" data-tab="favorites">Favorites</button>
        <button class="browsable-tab" data-tab="folders">Folders</button>
      </div>
      <div class="browsable-col-knob" data-col-knob>
        <button class="browsable-col-btn" data-cols="1">1</button>
        <button class="browsable-col-btn" data-cols="2">2</button>
        <button class="browsable-col-btn active" data-cols="3">3</button>
        <button class="browsable-col-btn" data-cols="4">4</button>
        <button class="browsable-col-btn" data-cols="5">5</button>
      </div>
    </div>

    <div class="browsable-tab-panel browsable-tab-panel--search browsable-landing" data-tab="search">
      <div class="browsable-landing-headline">${escapeHtml(landingHeadline)}</div>
      <div class="browsable-search-header">
        <div class="browsable-search-row">
          <input type="text" class="browsable-search-input" placeholder="${escapeAttr(landingPlaceholder)}" />
          <button class="browsable-search-btn" type="button"><i class="fas fa-search"></i></button>
        </div>
        <div class="browsable-landing-tags" data-landing-tags>
          <div class="browsable-tags-track"></div>
        </div>
      </div>
      <div class="browsable-grid" data-grid="search"></div>
      <div class="browsable-grid-sentinel" data-sentinel="search"></div>
      <div class="browsable-loading" hidden><i class="fas fa-circle-notch fa-spin"></i> Loading…</div>
      <div class="browsable-empty" hidden></div>
      <div class="browsable-landing-loader" data-landing-loader>
        <i class="fas fa-circle-notch fa-spin"></i>
      </div>
    </div>

    <div class="browsable-tab-panel" data-tab="favorites" hidden>
      <div class="browsable-grid" data-grid="favorites"></div>
      <div class="browsable-empty" data-empty="favorites" hidden>No favorites yet — heart an image from Search.</div>
    </div>

    <div class="browsable-tab-panel" data-tab="folders" hidden>
      <div class="browsable-folder-row">
        <button class="browsable-new-folder"><i class="fas fa-folder-plus"></i> New folder</button>
      </div>
      <div class="browsable-folder-list"></div>
      <div class="browsable-grid" data-grid="folder" hidden></div>
      <div class="browsable-folder-back" hidden><button><i class="fas fa-chevron-left"></i> Back to folders</button></div>
    </div>
  `;

  const STORAGE_KEY = `slammer:browsable-cols:${pluginId}`;
  function getSavedCols() {
    try {
      const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (v >= 1 && v <= 5) return v;
    } catch {}
    return 3;
  }
  let COLUMN_COUNT = getSavedCols();

  // ---------- Landing recommendation pills ----------
  const tagsContainer = container.querySelector('[data-landing-tags]');
  const tagsTrack = tagsContainer?.querySelector('.browsable-tags-track');
  if (landingTags.length > 0 && tagsTrack) {
    const makePill = (text) => {
      const btn = document.createElement('button');
      btn.className = 'browsable-tag-pill';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        searchInput.value = text;
        runSearch();
      });
      return btn;
    };
    for (const text of landingTags) tagsTrack.appendChild(makePill(text));
    for (const text of landingTags) tagsTrack.appendChild(makePill(text));
  } else if (tagsContainer) {
    tagsContainer.hidden = true;
  }

  const tabs = container.querySelectorAll('.browsable-tab');
  const panels = container.querySelectorAll('.browsable-tab-panel');
  const searchInput = container.querySelector('.browsable-search-input');
  const searchBtn = container.querySelector('.browsable-search-btn');
  const searchGrid = container.querySelector('[data-grid="search"]');
  const favGrid = container.querySelector('[data-grid="favorites"]');
  const folderGrid = container.querySelector('[data-grid="folder"]');
  const searchPanel = container.querySelector('.browsable-tab-panel--search');
  searchPanel.style.opacity = '0';

  // ---------- Column-based masonry helpers ----------
  // Resets a grid to N empty columns, each tracking its own predicted height
  // so the next append can pick the shortest one without measuring layout.
  function resetColumns(grid) {
    grid.innerHTML = '';
    const cols = [];
    for (let i = 0; i < COLUMN_COUNT; i++) {
      const col = document.createElement('div');
      col.className = 'browsable-column';
      col.dataset.h = '0';
      grid.appendChild(col);
      cols.push(col);
    }
    return cols;
  }
  // Append a card to whichever existing column is currently shortest.
  // Predicted height = (item.height / item.width); columns share equal widths
  // so ratios are sufficient — no need to measure DOM.
  function appendToColumns(grid, card) {
    const cols = grid.querySelectorAll('.browsable-column');
    if (!cols.length) {
      // Grid was rendered without columns (legacy state). Treat the grid as
      // a single wrapper and just append.
      grid.appendChild(card);
      return;
    }
    let shortest = cols[0];
    let shortestH = parseFloat(shortest.dataset.h) || 0;
    for (let i = 1; i < cols.length; i++) {
      const h = parseFloat(cols[i].dataset.h) || 0;
      if (h < shortestH) { shortest = cols[i]; shortestH = h; }
    }
    shortest.appendChild(card);
    const ratio = parseFloat(card.dataset.ratio) || 1;
    shortest.dataset.h = String(shortestH + ratio);
  }

  function redistributeGrid(grid) {
    const cards = Array.from(grid.querySelectorAll('.browsable-card'));
    resetColumns(grid);
    for (const card of cards) {
      appendToColumns(grid, card);
    }
  }
  const folderList = container.querySelector('.browsable-folder-list');
  const newFolderBtn = container.querySelector('.browsable-new-folder');
  const folderBack = container.querySelector('.browsable-folder-back');
  const loadingEl = container.querySelector('.browsable-loading');
  const emptyEl = container.querySelector('.browsable-empty:not([data-empty])');
  const favEmptyEl = container.querySelector('[data-empty="favorites"]');

  function selectTab(name) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    panels.forEach((p) => p.toggleAttribute('hidden', p.dataset.tab !== name));
    if (name === 'favorites') refreshFavorites();
    if (name === 'folders') refreshFolders();
  }
  tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

  // ---------- Search (with infinite scroll) ----------
  let lastQuery = '';
  let currentPage = 0;
  let hasMore = false;
  let searching = false;

  async function loadPage({ append }) {
    if (searching) return;
    if (append && !hasMore) return;
    if (append && !lastQuery) return;
    if (!apiKeyConfigured()) {
      emptyEl.hidden = false;
      emptyEl.textContent = apiKeyMissingMessage;
      searchGrid.innerHTML = '';
      return;
    }
    searching = true;
    loadingEl.hidden = false;
    if (!append) emptyEl.hidden = true;
    try {
      const nextPage = append ? currentPage + 1 : 1;
      const res = await searchFn(lastQuery, nextPage);
      const mapped = (res.results || []).map(mapResult);
      currentPage = nextPage;
      hasMore = !!res.hasMore && mapped.length > 0;
      if (!append) resetColumns(searchGrid);
      if (!append && !mapped.length) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'No results.';
        return;
      }
      for (const item of mapped) {
        appendToColumns(searchGrid, renderCard(item, 'search'));
      }
    } catch (err) {
      if (!append) {
        emptyEl.hidden = false;
        emptyEl.textContent = `Search failed: ${err.message}`;
      }
      // For append failures we don't disrupt the existing grid; just stop.
      hasMore = false;
    } finally {
      loadingEl.hidden = true;
      searching = false;
    }
  }

  async function runSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    // Once the user searches, drop the landing layout so the search bar
    // docks at its normal top position.
    searchPanel.style.opacity = '1';
    searchPanel.classList.remove('browsable-landing');
    const landingLoader = container.querySelector('[data-landing-loader]');
    landingLoader?.classList.remove('visible');
    lastQuery = q;
    currentPage = 0;
    hasMore = true;
    await loadPage({ append: false });
  }
  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

  // ---------- Curated landing feed ----------
  async function loadCurated() {
    const landingLoader = container.querySelector('[data-landing-loader]');
    let loaderTimeout = null;
    const showLoader = () => landingLoader?.classList.add('visible');

    if (!apiKeyConfigured()) {
      searchPanel.style.opacity = '1';
      return;
    }

    loaderTimeout = setTimeout(showLoader, 500);

    let results = [];
    try {
      let res;
      if (curatedFn) {
        res = await curatedFn(1);
      } else if (landingQueries.length > 0) {
        const q = landingQueries[Math.floor(Math.random() * landingQueries.length)];
        res = await searchFn(q, 1);
      }
      if (res) {
        results = (res.results || []).map(mapResult);
      }
    } catch {
      // Silently fail for auto-loaded curated preview — don't spam error state.
    }
    if (results.length) {
      searchPanel.classList.add('has-curated');
      resetColumns(searchGrid);
      for (const item of results) {
        const card = renderCard(item, 'search', { eager: true });
        appendToColumns(searchGrid, card);
      }
      // Preload all thumbnail images before revealing so the fade-in is crisp.
      const imgs = searchGrid.querySelectorAll('.browsable-card-img');
      await Promise.all(Array.from(imgs).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }));
    }
    clearTimeout(loaderTimeout);
    landingLoader?.classList.remove('visible');
    searchPanel.style.opacity = '1';
  }

  // Infinite scroll — observe a sentinel below the grid. The scroll container
  // is the plugin window's floating-body (defer lookup; the IntersectionObserver
  // only fires once it's visible, by which time the window is mounted).
  const sentinel = container.querySelector('[data-sentinel="search"]');
  const scrollRoot = container.closest('.floating-body') || null;
  const io = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) loadPage({ append: true });
  }, { root: scrollRoot, rootMargin: '400px 0px' });
  io.observe(sentinel);

  // ---------- Favorites ----------
  async function refreshFavorites() {
    resetColumns(favGrid);
    const favs = await listFavorites(pluginId);
    if (!favs.length) {
      favEmptyEl.hidden = false;
      favGrid.innerHTML = '';
      return;
    }
    favEmptyEl.hidden = true;
    for (const f of favs) {
      const item = { ...f.payload, _favoriteRecordId: f.id };
      appendToColumns(favGrid, renderCard(item, 'favorites'));
    }
  }

  // ---------- Folders ----------
  async function refreshFolders({ renameId } = {}) {
    folderList.innerHTML = '';
    folderGrid.hidden = true;
    folderBack.hidden = true;
    const folders = await listFolders(pluginId);
    if (!folders.length) {
      folderList.innerHTML = '<div class="browsable-empty">No folders yet.</div>';
      return;
    }
    for (const f of folders) {
      const row = document.createElement('div');
      row.className = 'browsable-folder';
      row.dataset.folderId = f.id;
      row.innerHTML = `<i class="fas fa-folder"></i> <span class="browsable-folder-name" tabindex="0">${escapeHtml(f.name)}</span>
        <button class="browsable-folder-del" title="Delete folder"><i class="fas fa-trash"></i></button>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.browsable-folder-del')) return;
        if (e.target.closest('.browsable-folder-name[contenteditable]')) return;
        openFolder(f);
      });
      const nameEl = row.querySelector('.browsable-folder-name');
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        beginRenameFolder(nameEl, f.id);
      });
      row.querySelector('.browsable-folder-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await showConfirm({
          title: 'Delete folder',
          message: `Delete "${f.name}"? Favorites stay — they just leave this folder.`,
          confirmText: 'Delete',
          kind: 'danger',
        });
        if (!ok) return;
        await deleteFolder(f.id);
        refreshFolders();
      });
      folderList.appendChild(row);
    }
    // If we just created a folder, immediately enter rename mode on its name.
    if (renameId) {
      const newRow = folderList.querySelector(`.browsable-folder[data-folder-id="${renameId}"] .browsable-folder-name`);
      if (newRow) beginRenameFolder(newRow, renameId, { selectAll: true });
    }
  }

  function beginRenameFolder(nameEl, folderId, { selectAll = true } = {}) {
    if (nameEl.getAttribute('contenteditable') === 'plaintext-only') return;
    const original = nameEl.textContent;
    nameEl.setAttribute('contenteditable', 'plaintext-only');
    nameEl.classList.add('renaming');
    nameEl.focus();
    if (selectAll) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      nameEl.removeAttribute('contenteditable');
      nameEl.classList.remove('renaming');
      const next = nameEl.textContent.trim();
      if (next && next !== original) {
        await renameFolder(folderId, next);
      } else {
        nameEl.textContent = original;
      }
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      nameEl.removeAttribute('contenteditable');
      nameEl.classList.remove('renaming');
      nameEl.textContent = original;
    };
    nameEl.addEventListener('blur', commit, { once: true });
    nameEl.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); nameEl.blur(); }
    });
  }

  async function openFolder(folder) {
    folderList.innerHTML = '';
    folderBack.hidden = false;
    folderGrid.hidden = false;
    const inFolder = await listFavorites(pluginId, { folderId: folder.id });
    if (!inFolder.length) {
      folderGrid.innerHTML = '<div class="browsable-empty">Empty folder. Drag favorites here.</div>';
    } else {
      resetColumns(folderGrid);
      for (const f of inFolder) {
        const item = { ...f.payload, _favoriteRecordId: f.id };
        appendToColumns(folderGrid, renderCard(item, 'favorites'));
      }
    }
  }

  folderBack.querySelector('button').addEventListener('click', refreshFolders);

  newFolderBtn.addEventListener('click', async () => {
    // Create with a placeholder name, then drop the user straight into rename
    // mode on the new row (no native prompt, no separate "Save" step).
    const folder = await createFolder({ pluginId, name: 'New folder' });
    refreshFolders({ renameId: folder.id });
  });

  // ---------- Card renderer ----------
  function renderCard(item, mode, { eager = false } = {}) {
    const card = document.createElement('div');
    card.className = 'browsable-card';
    card.draggable = true;
    // Native width/height attrs let the browser reserve the right aspect-ratio
    // box before the image loads — no layout shift, no jumpy scroll.
    const ratio = (item.width && item.height) ? (item.height / item.width) : 1;
    card.dataset.ratio = String(ratio);
    const wAttr = item.width ? `width="${item.width}"` : '';
    const hAttr = item.height ? `height="${item.height}"` : '';
    const lazyAttr = eager ? '' : 'loading="lazy"';
    card.innerHTML = `
      <img class="browsable-card-img" src="${escapeAttr(item.thumbUrl)}" ${wAttr} ${hAttr} alt="${escapeAttr(item.attribution || '')}" ${lazyAttr} referrerpolicy="no-referrer" />
      <div class="browsable-card-overlay">
        <button class="browsable-card-add" title="Add to canvas"><i class="fas fa-plus"></i></button>
        <button class="browsable-card-folder" title="Add to folder"><i class="fas fa-folder-plus"></i></button>
        <button class="browsable-card-fav" title="Toggle favorite"><i class="fas fa-heart"></i></button>
      </div>
      <div class="browsable-card-attr">${escapeHtml(item.attribution || '')}</div>
    `;

    // If the thumbnail fails (rate-limited CDN), retry once with the full URL
    // after a short stagger delay so we don't hammer the server again.
    const img = card.querySelector('img');
    if (img && item.thumbUrl !== item.fullUrl) {
      img.addEventListener('error', () => {
        if (!img.dataset.retried) {
          img.dataset.retried = '1';
          setTimeout(() => { img.src = item.fullUrl; }, 800 + Math.random() * 1200);
        }
      }, { once: true });
    }

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/uri-list', item.fullUrl);
      e.dataTransfer.setData('text/plain', item.fullUrl);
      e.dataTransfer.effectAllowed = 'copy';
    });

    card.addEventListener('dblclick', () => importItem(item));
    card.querySelector('.browsable-card-add').addEventListener('click', (e) => {
      e.stopPropagation();
      importItem(item);
    });
    card.querySelector('.browsable-card-fav').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFavorite(item, mode);
      if (mode === 'favorites') refreshFavorites();
    });
    card.querySelector('.browsable-card-folder').addEventListener('click', async (e) => {
      e.stopPropagation();
      await openFolderPicker(item, mode, e.currentTarget);
    });
    return card;
  }

  // ---------- Folder picker (per-card portaled menu) ----------
  // Folder picker shows the user's folders + "New folder" + (if applicable)
  // "Remove from folder". Clicking a folder favorites the image (if not yet)
  // and assigns it to that folder. Mirrors how layer-blend-menus position
  // themselves so the menu doesn't get clipped by the card's overflow:hidden.
  let _openFolderMenu = null;
  function closeFolderMenu() {
    if (_openFolderMenu) {
      _openFolderMenu.remove();
      _openFolderMenu = null;
    }
  }
  document.addEventListener('click', (e) => {
    if (_openFolderMenu && !_openFolderMenu.contains(e.target)) closeFolderMenu();
  }, true);

  async function openFolderPicker(item, mode, anchor) {
    closeFolderMenu();
    const [folders, allFavs] = await Promise.all([
      listFolders(pluginId),
      listFavorites(pluginId),
    ]);
    const existing = allFavs.find((f) => f.payload?.id === item.id) || null;
    const currentFolderId = existing?.folderId || null;

    const menu = document.createElement('div');
    menu.className = 'browsable-folder-menu';
    const r = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    menu.style.left = `${Math.round(r.left - 140)}px`;
    menu.innerHTML = `
      <div class="browsable-folder-menu-label">Add to folder</div>
      ${folders.length
        ? folders.map((f) => `
            <button class="browsable-folder-menu-item ${currentFolderId === f.id ? 'active' : ''}" data-act="pick" data-id="${escapeAttr(f.id)}">
              <i class="fas fa-folder"></i>
              <span>${escapeHtml(f.name)}</span>
              ${currentFolderId === f.id ? '<i class="fas fa-check browsable-folder-menu-check"></i>' : ''}
            </button>`).join('')
        : '<div class="browsable-folder-menu-empty">No folders yet.</div>'}
      <div class="browsable-folder-menu-sep"></div>
      <button class="browsable-folder-menu-item" data-act="new"><i class="fas fa-folder-plus"></i><span>New folder…</span></button>
      ${currentFolderId ? `<button class="browsable-folder-menu-item browsable-folder-menu-remove" data-act="remove"><i class="fas fa-times"></i><span>Remove from folder</span></button>` : ''}
    `;
    document.body.appendChild(menu);
    _openFolderMenu = menu;

    // Clamp to viewport.
    const mr = menu.getBoundingClientRect();
    if (mr.right > window.innerWidth - 8) {
      menu.style.left = `${Math.round(window.innerWidth - mr.width - 8)}px`;
    }
    if (mr.bottom > window.innerHeight - 8) {
      menu.style.top = `${Math.round(r.top - mr.height - 4)}px`;
    }

    menu.addEventListener('click', async (e) => {
      const btn = e.target.closest('button.browsable-folder-menu-item');
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      try {
        if (act === 'pick') {
          await ensureFavoriteAndAssign(item, btn.dataset.id);
        } else if (act === 'new') {
          // Create folder with placeholder name; the Folders tab handles
          // inline rename. Here we pre-name it from the user via showPrompt
          // so the picker stays in flow. Use the in-app prompt helper.
          const { showPrompt } = await import('../../../ui/confirm-prompt.js');
          const name = await showPrompt({
            title: 'New folder',
            defaultValue: 'New folder',
            confirmText: 'Create',
          });
          if (!name) return;
          const folder = await createFolder({ pluginId, name });
          await ensureFavoriteAndAssign(item, folder.id);
        } else if (act === 'remove') {
          if (existing) await moveFavoriteToFolder(existing.id, null);
        }
        ctx.notify('Folder updated.');
      } catch (err) {
        ctx.notify(`Folder update failed: ${err.message}`);
      } finally {
        closeFolderMenu();
        if (mode === 'favorites') refreshFavorites();
      }
    });
  }

  async function ensureFavoriteAndAssign(item, folderId) {
    const allFavs = await listFavorites(pluginId);
    const existing = allFavs.find((f) => f.payload?.id === item.id);
    if (existing) {
      await moveFavoriteToFolder(existing.id, folderId);
    } else {
      await addFavorite({ pluginId, payload: item, folderId });
    }
  }

  async function toggleFavorite(item, mode) {
    if (mode === 'favorites' && item._favoriteRecordId) {
      await removeFavorite(item._favoriteRecordId);
      return;
    }
    const existing = await isFavorited(pluginId, (rec) => rec.payload?.id === item.id);
    if (existing) {
      await removeFavorite(existing.id);
      ctx.notify(`Removed from ${pluginId} favorites`);
    } else {
      await addFavorite({ pluginId, payload: item });
      ctx.notify(`Saved to ${pluginId} favorites`);
    }
  }

  async function importItem(item) {
    const name = item.name || `${pluginId} · ${item.attribution || item.id}`;
    try {
      ctx.notify('Importing image…');
      // Strip referrer — some CDNs (Wikimedia, Flickr) reject third-party Referers.
      let res = await fetch(item.fullUrl, { referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      ctx.importImage(blob, name);
      ctx.notify('Imported.');
    } catch (err) {
      // fullUrl may be CORS-blocked (e.g. Flickr CDN). Fall back to the
      // thumbnail URL which often goes through a CORS-friendly proxy.
      if (item.thumbUrl && item.thumbUrl !== item.fullUrl) {
        try {
          const res2 = await fetch(item.thumbUrl, { referrerPolicy: 'no-referrer' });
          if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
          const blob2 = await res2.blob();
          ctx.importImage(blob2, name);
          ctx.notify('Imported (thumbnail — source CDN blocked full-res).');
          return;
        } catch { /* fall through to error */ }
      }
      ctx.notify(`Import failed: ${err.message}`);
    }
  }

  // ---------- Column count knob ----------
  const colKnob = container.querySelector('[data-col-knob]');
  function updateColKnobUI() {
    colKnob?.querySelectorAll('.browsable-col-btn').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.cols, 10) === COLUMN_COUNT);
    });
  }
  function setColumnCount(n) {
    if (n < 1 || n > 5 || n === COLUMN_COUNT) return;
    COLUMN_COUNT = n;
    try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {}
    updateColKnobUI();
    const activeTab = container.querySelector('.browsable-tab.active')?.dataset.tab;
    if (activeTab === 'search') redistributeGrid(searchGrid);
    else if (activeTab === 'favorites') redistributeGrid(favGrid);
    else if (activeTab === 'folders' && !folderGrid.hidden) redistributeGrid(folderGrid);
  }
  colKnob?.querySelectorAll('.browsable-col-btn').forEach((btn) => {
    btn.addEventListener('click', () => setColumnCount(parseInt(btn.dataset.cols, 10)));
  });
  updateColKnobUI();

  // Kick off curated preview feed immediately.
  loadCurated();

  return {
    selectTab,
    refreshFavorites,
    refreshFolders,
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
