// Gradient Library — PREMIUM panel plugin · Infinity Gradients Pack
// Browse 80+ curated gradient presets; click or drag to apply to any gradient picker.
// Phase 20 · third item in the Infinity Gradients Pack.

import './library.css';
import catalog from './catalog.json';
import { addFavorite, listFavorites, removeFavorite } from '../../../io/plugin-store.js';

const PLUGIN_ID = 'gradient-library';

// ---------- helpers ----------

function stopsToCss(stops) {
  const sorted = stops.slice().sort((a, b) => a.at - b.at);
  return `linear-gradient(to right, ${sorted.map((s) => `${s.color} ${(s.at * 100).toFixed(1)}%`).join(', ')})`;
}

function validateStops(data) {
  if (!Array.isArray(data) || data.length < 2) return null;
  for (const s of data) {
    if (typeof s.at !== 'number' || typeof s.color !== 'string') return null;
    if (s.at < 0 || s.at > 1) return null;
  }
  return data;
}

function showContextMenu(x, y, items) {
  // Remove any existing ctx menu
  document.querySelectorAll('.gl-ctx-menu').forEach((m) => m.remove());
  const menu = document.createElement('div');
  menu.className = 'gl-ctx-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'gl-ctx-item';
    btn.type = 'button';
    btn.textContent = item.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      item.onClick();
    });
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = menu.offsetWidth || 160;
  const mh = menu.offsetHeight || 80;
  if (x + mw > vw - 8) menu.style.left = `${Math.max(8, vw - mw - 8)}px`;
  if (y + mh > vh - 8) menu.style.top = `${Math.max(8, vh - mh - 8)}px`;
  // Dismiss on outside click
  const dismiss = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss, { capture: true });
    }
  };
  document.addEventListener('mousedown', dismiss, { capture: true });
  return menu;
}

// ---------- Main renderUI ----------

function renderUI(container, _ctx) {
  container.classList.add('gl-panel');

  // State
  let activeCategory = 'all';
  let activeCountFilter = 'all'; // 'all' | 2 | 3 | 4 | '5+'
  let searchQuery = '';
  let lastAppliedId = null;
  let customOpen = true;

  // Compute visible gradients
  function filteredGradients() {
    let items = catalog.gradients;
    if (activeCategory !== 'all') {
      items = items.filter((g) => g.category === activeCategory);
    }
    if (activeCountFilter !== 'all') {
      if (activeCountFilter === '5+') {
        items = items.filter((g) => g.stops.length >= 5);
      } else {
        items = items.filter((g) => g.stops.length === activeCountFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((g) =>
        g.name.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
        (g.tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    return items;
  }

  // Shared apply function — sends gradient to the last focused picker
  // OR, when no picker is focused, to the active vector layer's fill so
  // clicking a card in the library "just works" without first opening
  // a gradient editor.
  function applyGradient(stops) {
    const target = window.__slammer?._lastFocusedGradient;
    if (target && typeof target.applyGradient === 'function') {
      target.applyGradient(stops);
      return;
    }
    // Fallback: write to the active vector layer's fill.
    const doc = window.__slammer?.doc;
    const layer = doc?.activeLayer;
    if (layer?.type === 'vector' && layer.vector?.paths?.length) {
      const pathIdx = 0;
      const cur = layer.vector.paths[pathIdx].fill || {};
      doc.setVectorFill(layer.id, pathIdx, {
        ...cur,
        type: 'gradient',
        gradientType: cur.gradientType || 'linear',
        stops: stops.map((s) => ({ at: s.at, color: s.color })),
        from: cur.from || { x: 0, y: 0.5 },
        to:   cur.to   || { x: 1, y: 0.5 },
      });
      window.__slammer?.notify?.('Applied gradient to fill');
      return;
    }
    window.__slammer?.notify?.('Open a gradient picker or select a vector layer first', { kind: 'warn' });
  }

  // ── Live hover preview ────────────────────────────────────────────────
  // Hover a tile → the active vector layer briefly previews the gradient.
  // Leave → revert. Click → commit normally via applyGradient().
  // Reuses setVectorPathEphemeral so the change doesn't enter undo history
  // (same pattern as the simplify slider). Mirrors the live-font-preview
  // feature from Phase 19 G — Settings → Workflow toggle below.
  let previewSnapshot = null;     // { layerId, pathIdx, fill: deep-clone }
  let revertTimer = null;
  function previewLayerInfo() {
    const doc = window.__slammer?.doc;
    const layer = doc?.activeLayer;
    if (layer?.type !== 'vector' || !layer.vector?.paths?.length) return null;
    return { doc, layer, pathIdx: 0 };
  }
  function snapshotCurrentFill() {
    if (previewSnapshot) return;          // already snapshotted
    const info = previewLayerInfo();
    if (!info) return;
    const cur = info.layer.vector.paths[info.pathIdx].fill;
    previewSnapshot = {
      layerId: info.layer.id,
      pathIdx: info.pathIdx,
      // Deep clone via JSON so later ephemeral mutations don't alias
      // back into the snapshot (they'd otherwise share `stops` array
      // references with the live path).
      fill: cur ? JSON.parse(JSON.stringify(cur)) : null,
    };
  }
  function applyPreview(stops) {
    const info = previewLayerInfo();
    if (!info) return;
    const cur = info.layer.vector.paths[info.pathIdx].fill || {};
    info.doc.setVectorPathEphemeral(info.layer.id, info.pathIdx, {
      fill: {
        ...cur,
        type: 'gradient',
        gradientType: cur.gradientType || 'linear',
        stops: stops.map((s) => ({ at: s.at, color: s.color })),
        from: cur.from || { x: 0, y: 0.5 },
        to:   cur.to   || { x: 1, y: 0.5 },
      },
    });
  }
  function revertPreview() {
    if (!previewSnapshot) return;
    const doc = window.__slammer?.doc;
    if (doc) {
      doc.setVectorPathEphemeral(previewSnapshot.layerId, previewSnapshot.pathIdx, {
        fill: previewSnapshot.fill,
      });
    }
    previewSnapshot = null;
  }
  function startHoverPreview(stops) {
    if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
    snapshotCurrentFill();
    if (!previewSnapshot) return;         // no vector layer active → no-op
    applyPreview(stops);
  }
  function endHoverPreview() {
    if (revertTimer) clearTimeout(revertTimer);
    // Small delay so tile-to-tile movement doesn't flicker through the
    // snapshot — the next mouseenter cancels this timer.
    revertTimer = setTimeout(() => { revertPreview(); revertTimer = null; }, 80);
  }
  function cancelHoverPreview() {
    // Called after a real click commits — abandon the preview state
    // without reverting, since the click already wrote the final fill.
    if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
    previewSnapshot = null;
  }

  // ---------- TOPBAR ----------
  const topbar = document.createElement('div');
  topbar.className = 'gl-topbar';

  const topbarRow1 = document.createElement('div');
  topbarRow1.className = 'gl-topbar-row1';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'gl-search';
  searchInput.placeholder = 'Search gradients…';
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    rebuildGrid();
  });
  topbarRow1.appendChild(searchInput);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'gl-save-btn';
  saveBtn.innerHTML = '<i class="fas fa-bookmark"></i> Save current';
  saveBtn.title = 'Save the currently focused gradient picker\'s stops to Custom';
  saveBtn.addEventListener('click', () => {
    const target = window.__slammer?._lastFocusedGradient;
    if (!target) {
      window.__slammer?.notify?.('Focus a gradient picker first', { kind: 'warn' });
      return;
    }
    const stops = target.getStops?.();
    if (!stops || !stops.length) {
      window.__slammer?.notify?.('No gradient stops to save', { kind: 'warn' });
      return;
    }
    saveCustomGradient(stops, 'Custom Gradient');
  });
  topbarRow1.appendChild(saveBtn);
  topbar.appendChild(topbarRow1);

  // Category chips row
  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'gl-chips';

  const allCategories = ['all', ...catalog.categories.filter((c) => c !== 'custom')];
  for (const cat of allCategories) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `gl-chip${cat === activeCategory ? ' active' : ''}`;
    chip.textContent = cat === 'all' ? 'All' : cat;
    chip.dataset.cat = cat;
    chip.addEventListener('click', () => {
      activeCategory = cat;
      chipsWrap.querySelectorAll('.gl-chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === cat));
      rebuildGrid();
    });
    chipsWrap.appendChild(chip);
  }
  topbar.appendChild(chipsWrap);

  // Stop count filter row
  const countRow = document.createElement('div');
  countRow.style.display = 'flex';
  countRow.style.alignItems = 'center';
  countRow.style.gap = '4px';

  const countLabel = document.createElement('span');
  countLabel.className = 'gl-count-filter-label';
  countLabel.textContent = 'Stops:';
  countRow.appendChild(countLabel);

  const countOpts = [
    { label: 'All', value: 'all' },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
    { label: '5+', value: '5+' },
  ];
  for (const opt of countOpts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `gl-count-btn${opt.value === activeCountFilter ? ' active' : ''}`;
    btn.textContent = opt.label;
    btn.dataset.val = opt.value;
    btn.addEventListener('click', () => {
      activeCountFilter = opt.value;
      countRow.querySelectorAll('.gl-count-btn').forEach((b) => b.classList.toggle('active', b.dataset.val === String(opt.value)));
      rebuildGrid();
    });
    countRow.appendChild(btn);
  }
  topbar.appendChild(countRow);
  container.appendChild(topbar);

  // ---------- RESULTS BAR ----------
  const resultsBar = document.createElement('div');
  resultsBar.className = 'gl-results-bar';
  container.appendChild(resultsBar);

  // ---------- BODY (grid + custom section) ----------
  const body = document.createElement('div');
  body.className = 'gl-body';

  const gridWrap = document.createElement('div');
  gridWrap.className = 'gl-grid-wrap';

  const grid = document.createElement('div');
  grid.className = 'gl-grid';
  gridWrap.appendChild(grid);
  body.appendChild(gridWrap);

  // ---------- CUSTOM SECTION ----------
  const customSection = document.createElement('div');
  customSection.className = 'gl-custom-section';

  const customHeader = document.createElement('div');
  customHeader.className = 'gl-custom-header';
  customHeader.innerHTML = `
    <span class="gl-custom-header-label"><i class="fas fa-folder-open"></i> My Gradients</span>
    <i class="fas fa-chevron-down gl-custom-toggle-icon"></i>
  `;
  customHeader.addEventListener('click', () => {
    customOpen = !customOpen;
    customSection.classList.toggle('collapsed', !customOpen);
  });
  customSection.appendChild(customHeader);

  const customBody = document.createElement('div');
  customBody.className = 'gl-custom-body';

  const customGrid = document.createElement('div');
  customGrid.className = 'gl-custom-grid';
  customBody.appendChild(customGrid);
  customSection.appendChild(customBody);
  body.appendChild(customSection);

  container.appendChild(body);

  // ---------- TILE BUILDER ----------
  function buildTile(gradient) {
    const tile = document.createElement('div');
    tile.className = 'gl-tile';
    if (gradient.id === lastAppliedId) tile.classList.add('gl-tile--applied');
    tile.draggable = true;

    // Swatch
    const swatch = document.createElement('div');
    swatch.className = 'gl-tile-swatch';
    swatch.style.background = stopsToCss(gradient.stops);
    tile.appendChild(swatch);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'gl-tile-footer';

    const name = document.createElement('div');
    name.className = 'gl-tile-name';
    name.textContent = gradient.name;
    footer.appendChild(name);

    const dots = document.createElement('div');
    dots.className = 'gl-tile-dots';
    for (const stop of gradient.stops) {
      const dot = document.createElement('span');
      dot.className = 'gl-stop-dot';
      dot.style.background = stop.color;
      dot.title = `${stop.color} @ ${Math.round(stop.at * 100)}%`;
      dots.appendChild(dot);
    }
    footer.appendChild(dots);
    tile.appendChild(footer);

    // Hover bookmark — click adds to My Gradients without affecting the
    // tile's apply behaviour. Stops propagation so the tile click handler
    // doesn't also fire.
    const bookmark = document.createElement('button');
    bookmark.type = 'button';
    bookmark.className = 'gl-tile-bookmark';
    bookmark.innerHTML = '<i class="fas fa-bookmark"></i>';
    bookmark.title = 'Save to My Gradients';
    bookmark.addEventListener('click', (e) => {
      e.stopPropagation();
      saveCustomGradient(gradient.stops, gradient.name);
      bookmark.classList.add('is-saved');
    });
    bookmark.addEventListener('mousedown', (e) => e.stopPropagation()); // don't start a drag
    tile.appendChild(bookmark);

    // Hover → ephemeral preview on the active vector layer.
    tile.addEventListener('mouseenter', () => startHoverPreview(gradient.stops));
    tile.addEventListener('mouseleave', () => endHoverPreview());

    // Click → apply
    tile.addEventListener('click', () => {
      lastAppliedId = gradient.id;
      grid.querySelectorAll('.gl-tile').forEach((t) => t.classList.remove('gl-tile--applied'));
      tile.classList.add('gl-tile--applied');
      // Cancel the pending hover-revert + clear snapshot — the upcoming
      // setVectorFill in applyGradient() commits the final fill, and the
      // snapshot taken at hover-time is now stale.
      cancelHoverPreview();
      applyGradient(gradient.stops);
    });

    // Drag → set mime data
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-slammer-gradient', JSON.stringify(gradient.stops));
      // Visual drag image: create a wider snapshot of the swatch
      const img = document.createElement('canvas');
      img.width = 180;
      img.height = 48;
      const ctx = img.getContext('2d');
      const grd = ctx.createLinearGradient(0, 0, 180, 0);
      const sorted = gradient.stops.slice().sort((a, b) => a.at - b.at);
      for (const s of sorted) grd.addColorStop(s.at, s.color);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 180, 48);
      e.dataTransfer.setDragImage(img, 90, 24);
    });

    // Right-click context menu
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        {
          label: 'Apply to focused picker',
          onClick: () => applyGradient(gradient.stops),
        },
        {
          label: 'Save copy to My Gradients',
          onClick: () => saveCustomGradient(gradient.stops, gradient.name),
        },
        {
          label: 'Export JSON',
          onClick: () => {
            const blob = new Blob([JSON.stringify(gradient.stops, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${gradient.id}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          },
        },
      ]);
    });

    return tile;
  }

  // ---------- GRID REBUILD ----------
  function rebuildGrid() {
    const items = filteredGradients();
    resultsBar.textContent = `${items.length} gradient${items.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'gl-empty';
      empty.innerHTML = '<i class="fas fa-swatchbook"></i>No gradients match your filters.';
      grid.appendChild(empty);
      return;
    }
    for (const g of items) {
      grid.appendChild(buildTile(g));
    }
  }

  // ---------- CUSTOM GRADIENTS (IndexedDB) ----------
  async function loadCustomGradients() {
    try {
      const recs = await listFavorites(PLUGIN_ID);
      customGrid.innerHTML = '';
      if (!recs.length) {
        const empty = document.createElement('div');
        empty.className = 'gl-custom-empty';
        empty.textContent = 'No saved gradients yet. Click "Save current" to add one.';
        customGrid.appendChild(empty);
        return;
      }
      for (const rec of recs) {
        const stops = rec.payload?.stops;
        if (!stops) continue;
        const chip = document.createElement('div');
        chip.className = 'gl-custom-chip';
        chip.title = rec.payload?.name || 'Custom gradient';

        const mini = document.createElement('span');
        mini.className = 'gl-custom-swatch-mini';
        mini.style.background = stopsToCss(stops);
        chip.appendChild(mini);

        const label = document.createElement('span');
        label.textContent = rec.payload?.name || 'Gradient';
        chip.appendChild(label);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'gl-custom-del';
        del.innerHTML = '<i class="fas fa-times"></i>';
        del.title = 'Remove from My Gradients';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          await removeFavorite(rec.id);
          await loadCustomGradients();
        });
        chip.appendChild(del);

        chip.addEventListener('click', () => applyGradient(stops));
        chip.draggable = true;
        chip.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('application/x-slammer-gradient', JSON.stringify(stops));
        });
        chip.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showContextMenu(e.clientX, e.clientY, [
            { label: 'Apply', onClick: () => applyGradient(stops) },
            {
              label: 'Export JSON',
              onClick: () => {
                const blob = new Blob([JSON.stringify(stops, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `custom-gradient.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              },
            },
            {
              label: 'Delete',
              onClick: async () => {
                await removeFavorite(rec.id);
                await loadCustomGradients();
              },
            },
          ]);
        });
        customGrid.appendChild(chip);
      }
    } catch (err) {
      console.warn('[gradient-library] loadCustomGradients failed:', err);
    }
  }

  async function saveCustomGradient(stops, name = 'Custom Gradient') {
    try {
      await addFavorite({ pluginId: PLUGIN_ID, payload: { stops, name } });
      window.__slammer?.notify?.(`Saved "${name}" to My Gradients`);
      await loadCustomGradients();
    } catch (err) {
      console.warn('[gradient-library] saveCustomGradient failed:', err);
    }
  }

  // Listen for slammer:open-gradient-library event so the "Browse presets…" button
  // in gradientStopsRow can open this panel and wire the callback.
  function onOpenLibrary(e) {
    const { applyGradient: cb, getStops } = e.detail || {};
    // Register the callback globally so tile clicks can reach it.
    if (window.__slammer) {
      window.__slammer._lastFocusedGradient = {
        applyGradient: cb || (() => {}),
        getStops: getStops || (() => []),
      };
    }
  }
  document.addEventListener('slammer:open-gradient-library', onOpenLibrary);

  // If the active layer changes while we're hovering, revert any pending
  // preview against the OLD layer so it doesn't get stranded as an
  // ephemeral state that can't be undone. The snapshot is now stale.
  let unsubLayerActive = null;
  if (window.__slammer?.doc?.subscribe) {
    unsubLayerActive = window.__slammer.doc.subscribe((e) => {
      if (e.type === 'layer:active') {
        if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
        revertPreview();
      }
    });
  }

  // Teardown
  const mo = new MutationObserver(() => {
    if (!container.isConnected) {
      document.removeEventListener('slammer:open-gradient-library', onOpenLibrary);
      // Revert any pending hover preview so the canvas doesn't end up
      // stranded on an ephemeral fill the user never committed.
      if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
      revertPreview();
      try { unsubLayerActive?.(); } catch {}
      mo.disconnect();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // Initial render
  rebuildGrid();
  loadCustomGradients();
}

// ---------- Plugin manifest ----------

export default {
  id: PLUGIN_ID,
  name: 'Gradient Library',
  type: 'panel',
  pro: true,
  pack: 'infinity-gradients',
  // Monochrome FA `swatchbook` — reads as a layered swatch / palette
  // library at small sizes and matches the rest of the panel-plugin
  // sidebar icon set (which are all FA icons in `currentColor`).
  icon: 'swatchbook',
  accent: '#c39bff',
  description: 'Curated gradient presets — drag onto any gradient picker.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 480, h: 640 }; },
  computeStatus() { return null; },
  renderUI,
};
