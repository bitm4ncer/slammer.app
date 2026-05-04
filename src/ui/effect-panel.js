// Effect panel — stack of EffectInstances on the active layer.
// Tools render expanded (one at a time); Filters render compact.

import Sortable from 'sortablejs';
import { listPlugins, getPlugin, makeEffectInstance } from '../plugins/registry.js';

export function initEffectPanel({ stackEl, addToolBtn, addFilterBtn, document }) {
  let sortable = null;

  function activeLayer() { return document.activeLayer; }

  function render() {
    const layer = activeLayer();
    addToolBtn.disabled = !layer;
    addFilterBtn.disabled = !layer;

    if (!layer) {
      stackEl.innerHTML = '<div class="effect-empty">Select a layer to add effects</div>';
      return;
    }
    if (!layer.effects.length) {
      stackEl.innerHTML = '<div class="effect-empty">No effects on this layer</div>';
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

  function renderEffect(layer, eff, plugin) {
    const wrap = window.document.createElement('div');
    wrap.className = `effect-item ${plugin?.type === 'tool' ? 'is-tool' : 'is-filter'} ${eff.expanded ? 'expanded' : ''} ${eff.enabled ? '' : 'disabled'}`;
    wrap.dataset.effectId = eff.id;

    const header = window.document.createElement('div');
    header.className = 'effect-header';
    header.innerHTML = `
      <span class="eff-drag-handle" title="Reorder"><i class="fas fa-grip-vertical"></i></span>
      <i class="effect-icon fas fa-${plugin?.icon || 'puzzle-piece'}"></i>
      <span class="effect-name">${plugin?.name || eff.pluginId}</span>
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
    }

    if (!plugin) return wrap;

    // Body — for filters always render; for tools only when expanded.
    if (plugin.type === 'filter' || eff.expanded) {
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

  // ---------- "Add Tool" / "Add Filter" menus ----------
  function showAddMenu(button, type) {
    closeAnyMenu();
    const layer = activeLayer();
    if (!layer) return;
    const items = listPlugins({ type });
    if (!items.length) return;

    const menu = window.document.createElement('div');
    menu.className = 'add-effect-menu';
    menu.innerHTML = items.map((p) => `
      <button class="add-effect-item" data-id="${p.id}">
        <i class="fas fa-${p.icon || 'puzzle-piece'}"></i>
        <span>${p.name}</span>
      </button>
    `).join('');
    window.document.body.appendChild(menu);

    const r = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${r.left}px`;
    menu.style.zIndex = 200;

    menu.querySelectorAll('.add-effect-item').forEach((el) => {
      el.addEventListener('click', () => {
        const inst = makeEffectInstance(el.dataset.id);
        if (inst) {
          // For tools: collapse others, expand this one.
          if (type === 'tool') {
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

  addToolBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAddMenu(addToolBtn, 'tool');
  });
  addFilterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAddMenu(addFilterBtn, 'filter');
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

  render();
  return { render };
}
