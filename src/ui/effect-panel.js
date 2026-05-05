// Effect panel — stack of EffectInstances on the active layer.
// Tools render expanded (one at a time); Filters render compact.
// Hidden entirely when no layer is selected.

import Sortable from 'sortablejs';
import { listPlugins, getPlugin, makeEffectInstance } from '../plugins/registry.js';
import { getSettings, onSettingsChange } from './settings-popup.js';

export function initEffectPanel({ stackEl, addBtn, groupEl, document }) {
  let sortable = null;

  function activeLayer() { return document.activeLayer; }

  function render() {
    const layer = activeLayer();
    // Hide the whole panel when there's no active layer — keeps the UI uncluttered.
    if (groupEl) groupEl.style.display = layer ? '' : 'none';
    if (addBtn) addBtn.disabled = !layer;

    if (!layer) {
      stackEl.innerHTML = '';
      destroySortable();
      return;
    }
    if (!layer.effects.length) {
      stackEl.innerHTML = '<div class="effect-empty">No effects yet — click + to add</div>';
      destroySortable();
      return;
    }
    stackEl.innerHTML = '';
    for (const eff of layer.effects) {
      const plugin = getPlugin(eff.pluginId);
      const node = renderEffect(layer, eff, plugin);
      stackEl.appendChild(node);
    }
    setupSortable(layer);
  }

  function destroySortable() {
    if (sortable) { sortable.destroy(); sortable = null; }
  }

  function setupSortable(layer) {
    destroySortable();
    sortable = Sortable.create(stackEl, {
      animation: 140,
      handle: '.eff-drag-handle',
      filter: '.effect-empty',
      onEnd: () => {
        const ids = Array.from(stackEl.querySelectorAll('.effect-item')).map((el) => el.dataset.effectId);
        document.reorderEffects(layer.id, ids);
      },
    });
  }

  function isExpanded(eff, plugin) {
    if (plugin?.type === 'tool') return !!eff.expanded;
    // Filters: open if user expanded it, OR setting "keep all open" is on.
    // Disabled effects collapse like enabled ones — user can still click to open.
    if (getSettings().keepEffectsOpen) return true;
    return !!eff.expanded;
  }

  function renderEffect(layer, eff, plugin) {
    const expanded = isExpanded(eff, plugin);
    const wrap = window.document.createElement('div');
    wrap.className = `effect-item ${plugin?.type === 'tool' ? 'is-tool' : 'is-filter'} ${expanded ? 'expanded' : ''} ${eff.enabled ? '' : 'disabled'}`;
    wrap.dataset.effectId = eff.id;

    const header = window.document.createElement('div');
    header.className = 'effect-header';
    const showCaret = plugin?.type === 'filter' && !getSettings().keepEffectsOpen;
    header.innerHTML = `
      <span class="eff-drag-handle" title="Reorder"><i class="fas fa-grip-vertical"></i></span>
      <i class="effect-icon fas fa-${plugin?.icon || 'puzzle-piece'}"></i>
      <span class="effect-name">${plugin?.name || eff.pluginId}</span>
      ${showCaret ? `<i class="effect-caret fas fa-chevron-${expanded ? 'up' : 'down'}"></i>` : ''}
      <button class="effect-icon-btn act-toggle" title="${eff.enabled ? 'Disable' : 'Enable'}">
        <i class="fas fa-${eff.enabled ? 'circle-check' : 'circle'}"></i>
      </button>
      <button class="effect-icon-btn act-del" title="Remove"><i class="fas fa-times"></i></button>
    `;
    wrap.appendChild(header);

    header.querySelector('.act-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      document.setEffectProp(layer.id, eff.id, 'enabled', !eff.enabled);
      render();
    });
    header.querySelector('.act-del').addEventListener('click', (e) => {
      e.stopPropagation();
      document.removeEffect(layer.id, eff.id);
    });

    if (plugin?.type === 'tool') {
      // Toggle expanded state on click of name area; only one tool expanded at a time.
      header.addEventListener('click', () => {
        const willExpand = !eff.expanded;
        // Collapse all other tools on this layer.
        for (const e2 of layer.effects) {
          if (e2 !== eff && getPlugin(e2.pluginId)?.type === 'tool') {
            document.setEffectProp(layer.id, e2.id, 'expanded', false);
          }
        }
        document.setEffectProp(layer.id, eff.id, 'expanded', willExpand);
        render();
      });
    } else {
      // Filters: click header (not the action icons) to expand/collapse.
      // Disabled effects can still be opened to tweak before re-enabling.
      // Only the "keep all effects open" setting locks the body open.
      header.addEventListener('click', (e) => {
        if (e.target.closest('.effect-icon-btn')) return;
        if (getSettings().keepEffectsOpen) return;
        document.setEffectProp(layer.id, eff.id, 'expanded', !eff.expanded);
        render();
      });
      header.style.cursor = getSettings().keepEffectsOpen ? 'default' : 'pointer';
    }

    if (!plugin) return wrap;

    // Body — only render when expanded (per isExpanded() rules above).
    if (expanded) {
      const body = window.document.createElement('div');
      body.className = 'effect-body';
      const ui = plugin.renderUI(eff.params, (patch) => {
        document.setEffectParams(layer.id, eff.id, patch);
      });
      body.appendChild(ui);
      wrap.appendChild(body);
    }

    return wrap;
  }

  // ---------- Single merged Add menu ----------
  // Category order + display labels. Categories not listed here fall through to
  // "Other" at the end. Empty categories are skipped — so "color" stays hidden
  // until a Gradient Map / Color Overlay plugin lands.
  const CATEGORY_ORDER = ['image', 'glitch', 'color'];
  const CATEGORY_LABELS = { image: 'Image', glitch: 'Glitch', color: 'Color', other: 'Other' };

  function showAddMenu(button) {
    closeAnyMenu();
    const layer = activeLayer();
    if (!layer) return;
    const items = [...listPlugins({ type: 'filter' }), ...listPlugins({ type: 'tool' })];
    if (!items.length) return;

    // Group by category, alphabetise within each group.
    const buckets = new Map();
    for (const p of items) {
      const cat = CATEGORY_ORDER.includes(p.category) ? p.category : 'other';
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat).push(p);
    }
    for (const arr of buckets.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

    const orderedCats = [...CATEGORY_ORDER, 'other'].filter((c) => buckets.has(c));

    const menu = window.document.createElement('div');
    menu.className = 'add-effect-menu';
    menu.innerHTML = orderedCats.map((cat) => `
      <div class="add-effect-section-label">${CATEGORY_LABELS[cat] || cat}</div>
      ${buckets.get(cat).map((p) => `
        <button class="add-effect-item" data-id="${p.id}">
          <i class="fas fa-${p.icon || 'puzzle-piece'}"></i>
          <span>${p.name}</span>
        </button>
      `).join('')}
    `).join('');
    window.document.body.appendChild(menu);

    // Position below the button, right-aligned to its right edge.
    const r = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${Math.max(8, r.right - 200)}px`;
    menu.style.zIndex = 200;

    menu.querySelectorAll('.add-effect-item').forEach((el) => {
      el.addEventListener('click', () => {
        const inst = makeEffectInstance(el.dataset.id);
        if (inst) {
          const plugin = getPlugin(el.dataset.id);
          // For tools: collapse others, expand this one.
          if (plugin?.type === 'tool') {
            for (const e2 of layer.effects) {
              if (getPlugin(e2.pluginId)?.type === 'tool') {
                document.setEffectProp(layer.id, e2.id, 'expanded', false);
              }
            }
            inst.expanded = true;
          }
          document.addEffect(layer.id, inst);
        }
        closeAnyMenu();
      });
    });

    setTimeout(() => {
      window.addEventListener('click', closeAnyMenu, { once: true });
    });
  }

  function closeAnyMenu() {
    window.document.querySelectorAll('.add-effect-menu').forEach((m) => m.remove());
  }

  addBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showAddMenu(addBtn);
  });

  document.subscribe((e) => {
    // Structural events trigger a full rebuild.
    const structural = [
      'layer:active', 'layer:added', 'layer:removed',
      'effect:added', 'effect:removed', 'effect:reordered',
      'doc:loaded',
    ].includes(e.type);
    // Re-render also on enabled/expanded changes so the visual state updates.
    // CRITICAL: do NOT rebuild on prop=params — that would destroy the user's slider mid-drag.
    const visualToggle = e.type === 'effect:propChanged' && (e.prop === 'enabled' || e.prop === 'expanded');
    if (structural || visualToggle) render();
  });

  // Re-render whenever the user flips the "Keep effects open" setting.
  onSettingsChange(() => render());

  render();
  return { render };
}
