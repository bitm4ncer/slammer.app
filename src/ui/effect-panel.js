// Effect panel — stack of EffectInstances on the active layer.
// Tools render expanded (one at a time); Filters render compact.
// Hidden entirely when no layer is selected.

import Sortable from 'sortablejs';
import { getPlugin, makeEffectInstance } from '../plugins/registry.js';
import { getSettings, onSettingsChange } from './settings-popup.js';

export function initEffectPanel({ stackEl, addBtn, groupEl, document }) {
  let sortable = null;
  let sortableInitToken = 0;

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
    // Defer Sortable.create to idle time so the visible stack renders one
    // frame faster after a layer flip — drag-reorder becomes available a
    // few ms later, well within the user's reaction time.
    const myToken = ++sortableInitToken;
    const init = () => {
      if (myToken !== sortableInitToken) return; // superseded by a later render
      if (!stackEl.isConnected) return;
      sortable = Sortable.create(stackEl, {
        animation: 140,
        handle: '.eff-drag-handle',
        filter: '.effect-empty',
        onEnd: () => {
          const ids = Array.from(stackEl.querySelectorAll('.effect-item')).map((el) => el.dataset.effectId);
          document.reorderEffects(layer.id, ids);
        },
      });
    };
    (window.requestIdleCallback || ((cb) => setTimeout(cb, 16)))(init);
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
      <span class="effect-spinner"></span>
      ${showCaret ? `<i class="effect-caret fas fa-chevron-${expanded ? 'up' : 'down'}"></i>` : ''}
      <button class="effect-icon-btn act-toggle" title="${eff.enabled ? 'Disable effect' : 'Enable effect'}" aria-label="${eff.enabled ? 'Disable effect' : 'Enable effect'}">
        <i class="fas fa-${eff.enabled ? 'circle-check' : 'circle'}"></i>
      </button>
      <button class="effect-icon-btn act-del" title="Remove effect" aria-label="Remove effect"><i class="fas fa-times"></i></button>
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

      // Per-slot dry/wet slider — slim minimalist track at the top of every
      // expanded effect body. Plugins don't need to know about it; the renderer
      // applies mix as a post-process lerp.
      body.appendChild(buildMixSlider(layer, eff));

      const ui = plugin.renderUI(eff.params, (patch) => {
        document.setEffectParams(layer.id, eff.id, patch);
      });
      body.appendChild(ui);
      wrap.appendChild(body);
    }

    return wrap;
  }

  // Slim dry/wet slider — full-width 3 px track that grows on hover and shows
  // a tooltip readout. Bound to `eff.mix` (default 1). Sets the prop via
  // setEffectProp so it goes through the cache-break + history pipeline.
  function buildMixSlider(layer, eff) {
    const wrap = window.document.createElement('div');
    wrap.className = 'effect-mix-slider';
    wrap.setAttribute('role', 'slider');
    wrap.setAttribute('aria-label', 'Mix (dry/wet)');
    wrap.setAttribute('aria-valuemin', '0');
    wrap.setAttribute('aria-valuemax', '100');

    const fill = window.document.createElement('span');
    fill.className = 'effect-mix-fill';
    wrap.appendChild(fill);

    const handle = window.document.createElement('span');
    handle.className = 'effect-mix-handle';
    wrap.appendChild(handle);

    const tip = window.document.createElement('span');
    tip.className = 'effect-mix-tip';
    wrap.appendChild(tip);

    let mix = eff.mix ?? 1;
    function paint() {
      const pct = Math.round(mix * 100);
      fill.style.width = `${pct}%`;
      handle.style.left = `${pct}%`;
      tip.textContent = `Mix · ${pct}%`;
      wrap.setAttribute('aria-valuenow', String(pct));
    }
    paint();

    let dragging = false;

    function valueFromPointer(e) {
      const r = wrap.getBoundingClientRect();
      const t = (e.clientX - r.left) / r.width;
      return Math.max(0, Math.min(1, t));
    }

    wrap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dragging = true;
      wrap.setPointerCapture(e.pointerId);
      wrap.classList.add('is-dragging');
      mix = valueFromPointer(e);
      paint();
      document.setEffectProp(layer.id, eff.id, 'mix', mix);
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      mix = valueFromPointer(e);
      paint();
      document.setEffectProp(layer.id, eff.id, 'mix', mix);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove('is-dragging');
      try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);

    wrap.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      mix = 1;
      paint();
      document.setEffectProp(layer.id, eff.id, 'mix', mix);
    });

    return wrap;
  }

  // ---------- Effect Library ----------
  // Opens the full-screen picker (search, filters, grid/list). The library
  // owns its own DOM and lifecycle; we just hand it an onPick callback that
  // performs the same tool-collapse-then-add logic the old inline menu did.
  function openLibrary(button) {
    const layer = activeLayer();
    if (!layer) return;
    import('./effect-library.js').then(({ openEffectLibrary }) => {
      openEffectLibrary({
        mode: 'raster',
        anchor: button,
        doc: document,
        onPick: (plugin) => {
          const cur = activeLayer();
          if (!cur) return;
          const inst = makeEffectInstance(plugin.id);
          if (!inst) return;
          if (plugin.type === 'tool') {
            for (const e2 of cur.effects) {
              if (getPlugin(e2.pluginId)?.type === 'tool') {
                document.setEffectProp(cur.id, e2.id, 'expanded', false);
              }
            }
            inst.expanded = true;
          }
          document.addEffect(cur.id, inst);
        },
      });
    });
  }

  addBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    openLibrary(addBtn);
  });

  document.subscribe((e) => {
    // Structural events trigger a full rebuild.
    const structural = [
      'layer:active', 'layer:added', 'layer:removed',
      'effect:added', 'effect:removed', 'effect:reordered',
      'doc:loaded',
    ].includes(e.type);
    if (structural) { render(); return; }

    // Enabled/expanded toggles are CSS-class flips — no DOM rebuild needed.
    // Previously this fired a full render() which destroyed every effect
    // card's DOM and re-ran plugin.renderUI() (slider DOM, listeners, etc).
    // For a stack with several effects, that's a chunk of work per click.
    if (e.type === 'effect:propChanged' && (e.prop === 'enabled' || e.prop === 'expanded')) {
      const card = stackEl.querySelector(`.effect-item[data-effect-id="${e.effectId}"]`);
      if (!card) { render(); return; }  // card missing → fall back to rebuild
      if (e.prop === 'enabled') {
        card.classList.toggle('disabled', !e.value);
      } else {
        // For tool-type effects we ALWAYS recompute expanded — only one tool
        // is open at a time, so a non-target card may need to fold. Easier
        // to just rebuild in that case (rare path).
        const layer = activeLayer();
        const eff = layer?.effects.find((x) => x.id === e.effectId);
        const plugin = eff && getPlugin(eff.pluginId);
        if (plugin?.type === 'tool') { render(); return; }
        const expanded = !!e.value;
        card.classList.toggle('expanded', expanded);
        const caret = card.querySelector('.effect-caret');
        if (caret) {
          caret.classList.remove('fa-chevron-up', 'fa-chevron-down');
          caret.classList.add(expanded ? 'fa-chevron-up' : 'fa-chevron-down');
        }
      }
      return;
    }

    // Per-effect processing spinner — no re-render, just toggle the class.
    if (e.type === 'effect:processing') {
      const card = stackEl.querySelector(`.effect-item[data-effect-id="${e.effectId}"]`);
      if (card) card.classList.toggle('is-processing', e.state === 'start');
    }
  });

  // Re-render whenever the user flips the "Keep effects open" setting.
  onSettingsChange(() => render());

  render();
  return { render };
}
