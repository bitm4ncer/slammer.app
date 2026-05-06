// Right-side Layer panel — list driven by Document, drag-reorder via SortableJS.

import Sortable from 'sortablejs';
import { getSettings, onSettingsChange } from './settings-popup.js';
import { createKnob } from '../plugins/shared/knob.js';
import { createNumericInput } from '../plugins/shared/numeric-input.js';
import { BLEND_MODES } from '../core/layer.js';
import { translatePathD } from '../core/vector-renderer.js';
import { setDraggingLayer } from './drag-state.js';
import {
  getSelection, getSelectionArray, setSelection, selectOnly, toggleInSelection, selectRange, onSelectionChange,
} from './selection-state.js';
import { openContextMenu } from './context-menu.js';

export function initLayerPanel({ container, document, renderer }) {
  const sortableInstances = [];
  let customLayerColors = getSettings().customLayerColors !== false;

  // Combine button — visible when ≥2 top-level layers are selected.
  const combineBtn = window.document.getElementById('btnCombineLayers');
  if (combineBtn) {
    combineBtn.addEventListener('click', () => {
      const sel = getSelection();
      if (sel.size < 2) return;
      const childIds = [...sel].filter((id) => {
        const l = document.findLayer(id);
        // Don't accept FX layers as group children — they're pseudo-layers
        // that compose-below; nesting them in a group breaks that semantic.
        return l && l.type !== 'fx';
      });
      if (childIds.length < 2) return;
      // Order children top→bottom in panel order so the group's childIds
      // matches what the user sees.
      const ordered = Array.from(container.querySelectorAll('.layer-item'))
        .map((el) => el.dataset.layerId)
        .filter((id) => childIds.includes(id));
      const grp = document.addGroupLayer({ name: 'Group', childIds: ordered });
      if (grp) {
        // Selection collapses to the new group; setActiveLayer fires too.
        selectOnly(grp.id);
      }
    });
    onSelectionChange((sel) => {
      const eligible = [...sel].filter((id) => {
        const l = document.findLayer(id);
        return l && l.type !== 'fx';
      });
      combineBtn.hidden = eligible.length < 2;
    });
  }
  onSettingsChange((s) => {
    const next = s.customLayerColors !== false;
    if (next !== customLayerColors) {
      customLayerColors = next;
      scheduleRender();
    }
  });

  function closeAllBlendMenus() {
    window.document.querySelectorAll('.layer-blend-menu--portaled').forEach((m) => { m.style.display = 'none'; });
  }
  window.document.addEventListener('click', (e) => {
    if (!e.target.closest('.layer-blend-dropdown')) closeAllBlendMenus();
  });

  // Document.duplicateLayer offsets transform.x/y by +20,+20. For
  // vector layers that's only the rotation anchor — path d-coords live
  // in WORLD space so they need a matching translation to produce a
  // visible offset (see vector-renderer COORDINATE CONVENTION).
  function duplicateLayerWithVisualOffset(srcId) {
    const clone = document.duplicateLayer(srcId, { offsetXY: { x: 20, y: 20 } });
    if (!clone) return null;
    if (clone.type === 'vector' && clone.vector?.paths?.length) {
      const newPaths = clone.vector.paths.map((p) => ({ ...p, d: translatePathD(p.d, 20, 20) }));
      document.setVectorPaths(clone.id, newPaths);
    }
    selectOnly(clone.id);
    return clone;
  }

  function thumbForLayer(layer) {
    const st = renderer.layerState.get(layer.id);
    if (!st || !st.dstCanvas) return '';
    try {
      return st.dstCanvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  const BLEND_SHORT = {
    'source-over': 'Normal', multiply: 'Mult', screen: 'Scrn', overlay: 'Ovly',
    darken: 'Drkn', lighten: 'Lght', 'color-dodge': 'CDge', 'color-burn': 'CBrn',
    'hard-light': 'Hard', 'soft-light': 'Soft', difference: 'Diff', exclusion: 'Excl',
  };
  const BLEND_FULL = {
    'source-over': 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay',
    darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'Color Dodge', 'color-burn': 'Color Burn',
    'hard-light': 'Hard Light', 'soft-light': 'Soft Light', difference: 'Difference', exclusion: 'Exclusion',
  };
  function blendShort(mode) { return BLEND_SHORT[mode] || 'Normal'; }
  function blendFull(mode) { return BLEND_FULL[mode] || mode; }

  // ---- Markup helpers (extracted from the old flat render) ----

  function rowMarkup(layer) {
    const accent = customLayerColors ? (layer.accentColor || '#8aff8c') : 'var(--primary)';
    const sel = getSelection();
    const multi = sel.has(layer.id) && sel.size > 1;
    const classes = [
      'layer-item',
      layer.type === 'fx' ? 'layer-item--fx' : '',
      layer.type === 'group' ? 'layer-item--group' : '',
      document.activeLayerId === layer.id ? 'active' : '',
      multi ? 'multi-selected' : '',
      layer.locked ? 'locked' : '',
      !layer.visible ? 'hidden' : '',
    ].filter(Boolean).join(' ');
    const swatchMarkup = customLayerColors ? `
      <label class="layer-accent-swatch" title="Layer accent colour">
        <input type="color" value="${layer.accentColor || '#8aff8c'}" class="layer-accent-input" />
        <span class="layer-accent-dot" style="background:${layer.accentColor || '#8aff8c'}"></span>
      </label>` : '';

    const lockBtn = `
      <button class="layer-icon-btn act-lock" title="${layer.locked ? 'Unlock layer' : 'Lock layer'}">
        <i class="fas fa-${layer.locked ? 'lock' : 'lock-open'}"></i>
      </button>`;
    const visBtn = `
      <button class="layer-icon-btn act-vis" title="Toggle visibility">
        <i class="fas fa-${layer.visible ? 'eye' : 'eye-slash'}"></i>
      </button>`;
    const dupBtn = `<button class="layer-icon-btn act-dup" title="Duplicate layer (Ctrl+D)"><i class="fas fa-clone"></i></button>`;
    const delBtn = `<button class="layer-icon-btn act-del" title="Delete layer"><i class="fas fa-trash"></i></button>`;

    if (layer.type === 'group') {
      const chev = layer.expanded === false ? 'right' : 'down';
      return `
        <div class="${classes}"
             data-layer-id="${layer.id}"
             style="--layer-accent:${accent}">
          <div class="layer-drag-handle"><i class="fas fa-grip-vertical"></i></div>
          <button class="layer-chevron" title="${layer.expanded === false ? 'Expand' : 'Collapse'}">
            <i class="fas fa-chevron-${chev}"></i>
          </button>
          ${swatchMarkup}
          <i class="fas fa-folder${layer.expanded === false ? '' : '-open'} layer-type-icon layer-group-icon"></i>
          <div class="layer-meta">
            <div class="layer-name" title="${escape(layer.name)}" tabindex="0">${escape(layer.name)}</div>
            <div class="layer-blend-opacity-row">
              <div class="layer-blend-dropdown">
                <button class="layer-blend-trigger" title="Blend mode" data-mode="${layer.blendMode || 'source-over'}">${blendShort(layer.blendMode || 'source-over')}</button>
              </div>
              <div class="layer-opacity-row" data-opacity="${Math.round((layer.opacity ?? 1) * 100)}">
                <span class="layer-opacity-knob"></span>
                <span class="layer-opacity-num"></span>
              </div>
            </div>
          </div>
          <div class="layer-actions">
            ${lockBtn}
            ${visBtn}
            ${dupBtn}
            ${delBtn}
          </div>
        </div>`;
    }

    if (layer.type === 'fx') {
      return `
        <div class="${classes}"
             data-layer-id="${layer.id}"
             style="--layer-accent:${accent}">
          <div class="layer-drag-handle"><i class="fas fa-grip-vertical"></i></div>
          ${swatchMarkup}
          <i class="fas fa-sliders-h layer-fx-icon"></i>
          <div class="layer-meta">
            <div class="layer-name" title="${escape(layer.name)}" tabindex="0">${escape(layer.name)}</div>
            <div class="layer-blend-opacity-row">
              <div class="layer-blend-dropdown">
                <button class="layer-blend-trigger" title="Blend mode" data-mode="${layer.blendMode || 'source-over'}">${blendShort(layer.blendMode || 'source-over')}</button>
              </div>
              <div class="layer-opacity-row" data-opacity="${Math.round((layer.opacity ?? 1) * 100)}">
                <span class="layer-opacity-knob"></span>
                <span class="layer-opacity-num"></span>
              </div>
            </div>
          </div>
          <div class="layer-actions">
            ${lockBtn}
            ${visBtn}
            ${dupBtn}
            ${delBtn}
          </div>
        </div>`;
    }

    return `
      <div class="${classes}"
           data-layer-id="${layer.id}"
           style="--layer-accent:${accent}">
        <div class="layer-drag-handle"><i class="fas fa-grip-vertical"></i></div>
        ${swatchMarkup}
        <div class="layer-thumb" style="background-image:url('${thumbForLayer(layer)}')">
          ${layer.type === 'text' ? '<span class="layer-type-icon">T</span>' : `<i class="fas fa-${typeIcon(layer.type)} layer-type-icon"></i>`}
        </div>
        <div class="layer-meta">
          <div class="layer-name" title="${escape(layer.name)}" tabindex="0">${escape(layer.name)}</div>
          <div class="layer-blend-opacity-row">
            <div class="layer-blend-dropdown">
              <button class="layer-blend-trigger" title="Blend mode" data-mode="${layer.blendMode || 'source-over'}">${blendShort(layer.blendMode || 'source-over')}</button>
            </div>
            <div class="layer-opacity-row" data-opacity="${Math.round((layer.opacity ?? 1) * 100)}">
              <span class="layer-opacity-knob"></span>
              <span class="layer-opacity-num"></span>
            </div>
          </div>
        </div>
        <div class="layer-actions">
          ${lockBtn}
          ${visBtn}
          ${dupBtn}
          ${delBtn}
        </div>
      </div>`;
  }

  // Recursive: every layer becomes a `.layer-tree-node` wrapper, which
  // is what SortableJS treats as the draggable item. The wrapper holds
  // the visible row and (for groups) a child-container for nested
  // descendants. Wrapping is what keeps a group + its expanded children
  // moving together when the user drags the group's handle.
  function nodeMarkup(layer) {
    const own = rowMarkup(layer);
    if (layer.type !== 'group') {
      return `<div class="layer-tree-node" data-layer-id="${layer.id}">${own}</div>`;
    }
    const children = (layer.childIds || [])
      .slice().reverse()
      .map((cid) => document.findLayer(cid))
      .filter(Boolean);
    const hidden = layer.expanded === false ? 'hidden' : '';
    return `
      <div class="layer-tree-node" data-layer-id="${layer.id}">
        ${own}
        <div class="layer-children" data-group-id="${layer.id}" ${hidden}>
          ${children.map(nodeMarkup).join('')}
        </div>
      </div>`;
  }

  function render() {
    if (!document.layers.length) {
      container.innerHTML = '<div class="layer-empty">No layers yet</div>';
      return;
    }
    // Top-level layers only — children are emitted recursively via nodeMarkup.
    const topLevel = document.layers.filter((l) => !l.parentGroupId).slice().reverse();
    if (!topLevel.length) {
      container.innerHTML = '<div class="layer-empty">No layers yet</div>';
      return;
    }
    container.innerHTML = topLevel.map(nodeMarkup).join('');

    container.querySelectorAll('.layer-item').forEach((row) => {
      const id = row.dataset.layerId;
      const layer = document.findLayer(id);
      if (!layer) return;

      // Native drag-out (Phase 16) — lets plugin drop zones receive a layer
      // reference. Sortable's reorder uses the explicit grip handle, so this
      // doesn't conflict.
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        if (e.target.closest('.layer-drag-handle')) {
          // The grip handle owns the in-list reorder gesture; suppress native drag.
          e.preventDefault();
          return;
        }
        if (e.dataTransfer) {
          e.dataTransfer.setData('application/x-slammer-layer', id);
          e.dataTransfer.setData('text/plain', layer.name || 'layer');
          e.dataTransfer.effectAllowed = 'copy';
        }
        // Fallback: store the id in module scope. SortableJS can call
        // `dataTransfer.clearData()` between dragstart and drop, wiping our
        // custom MIME. drop-zone reads this fallback when getData is empty.
        // We don't clear on `dragend` — the id is overwritten on the next
        // dragstart, and drop-zone gates on dataTransfer.types so a stale id
        // can't get misinterpreted as a layer drop during a later file drop.
        setDraggingLayer(id);
      });

      row.addEventListener('click', (e) => {
        if (e.target.closest('.layer-actions') || e.target.closest('.layer-blend-dropdown')
            || e.target.closest('.layer-opacity-row') || e.target.closest('.layer-accent-swatch')
            || e.target.closest('.layer-name[contenteditable]')) return;
        const meta = e.metaKey || e.ctrlKey;
        const shift = e.shiftKey;
        if (shift) {
          // Range select using current panel order (top-of-list first).
          const ordered = Array.from(container.querySelectorAll('.layer-item'))
            .map((el) => el.dataset.layerId);
          selectRange(id, ordered);
        } else if (meta) {
          toggleInSelection(id);
        } else {
          selectOnly(id);
        }
        // Active layer always follows the most recent click so panels
        // (Vector/Effects/etc.) target the layer the user just touched.
        document.setActiveLayer(id);
      });

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // If the right-clicked row isn't part of the selection, treat
        // it as a single-target click first (same as Finder / Figma).
        if (!getSelection().has(id)) selectOnly(id);
        openContextMenu({
          x: e.clientX, y: e.clientY,
          items: panelContextMenuItems(layer),
        });
      });
      row.querySelector('.act-vis').addEventListener('click', (e) => {
        e.stopPropagation();
        document.setLayerProp(id, 'visible', !layer.visible);
      });
      row.querySelector('.act-del').addEventListener('click', (e) => {
        e.stopPropagation();
        document.removeLayer(id);
      });
      row.querySelector('.act-dup').addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateLayerWithVisualOffset(id);
      });

      // Blend mode trigger
      const blendTrigger = row.querySelector('.layer-blend-trigger');
      if (blendTrigger) {
        blendTrigger.addEventListener('click', (e) => {
          e.stopPropagation();
          showBlendMenu(blendTrigger, layer);
        });
        blendTrigger.addEventListener('wheel', (e) => {
          e.preventDefault();
          const idx = BLEND_MODES.indexOf(layer.blendMode || 'source-over');
          const next = BLEND_MODES[(idx + (e.deltaY > 0 ? 1 : BLEND_MODES.length - 1)) % BLEND_MODES.length];
          document.setLayerProp(id, 'blendMode', next);
        });
      }

      // Opacity knob + numeric input
      const opRow = row.querySelector('.layer-opacity-row');
      if (opRow) {
        const opacityPercent = Math.round((layer.opacity ?? 1) * 100);
        const knob = createKnob({ size: 28, min: 0, max: 100, step: 1, value: opacityPercent, defaultValue: 100,
          onChange: (v) => {
            document.setLayerProp(id, 'opacity', v / 100);
            if (num) num.setValue(v);
          }
        });
        const num = createNumericInput({ min: 0, max: 100, step: 1, value: opacityPercent, suffix: '%',
          onChange: (v) => {
            document.setLayerProp(id, 'opacity', v / 100);
            if (knob) knob.setValue(v);
          }
        });
        opRow.querySelector('.layer-opacity-knob').appendChild(knob);
        opRow.querySelector('.layer-opacity-num').appendChild(num);
        opRow._knob = knob;
        opRow._num = num;
      }

      const accentInput = row.querySelector('.layer-accent-input');
      if (accentInput) {
        accentInput.addEventListener('input', (e) => {
          const hex = e.target.value;
          document.setLayerProp(id, 'accentColor', hex);
          row.style.setProperty('--layer-accent', hex);
          row.querySelector('.layer-accent-dot').style.background = hex;
        });
      }

      const nameEl = row.querySelector('.layer-name');
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        beginRename(nameEl, id);
      });

      // Double-click on the thumbnail toggles visibility — quick way to
      // hide / unhide a layer without aiming for the small eye icon.
      const thumbEl = row.querySelector('.layer-thumb');
      if (thumbEl) {
        thumbEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          document.setLayerProp(id, 'visible', !layer.visible);
        });
      }
    });

    // Attach chevron + lock handlers (defined inside the per-row loop
    // below would require duplication for child rows; do it here once
    // for every .layer-item the recursive renderer just emitted).
    container.querySelectorAll('.layer-chevron').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.layer-item');
        const id = row?.dataset.layerId;
        const layer = id && document.findLayer(id);
        if (!layer || layer.type !== 'group') return;
        document.setLayerProp(id, 'expanded', layer.expanded === false);
        scheduleRender();
      });
    });
    container.querySelectorAll('.act-lock').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.layer-item');
        const id = row?.dataset.layerId;
        const layer = id && document.findLayer(id);
        if (!layer) return;
        document.setLayerLocked(id, !layer.locked);
      });
    });

    // Sortable wiring — top-level + a per-group instance for each
    // expanded group's child container. All share `group: 'layers'` so
    // dragging a node between them moves it into / out of a group.
    // `draggable: '.layer-tree-node'` ensures only the wrappers are
    // dragged (rows inside the wrappers ride along).
    if (sortableInstances.length) {
      sortableInstances.forEach((s) => { try { s.destroy(); } catch {} });
      sortableInstances.length = 0;
    }
    sortableInstances.push(Sortable.create(container, {
      animation: 140,
      handle: '.layer-drag-handle',
      draggable: '.layer-tree-node',
      group: { name: 'layers', pull: true, put: true },
      onEnd: handleSortEnd,
    }));
    container.querySelectorAll('.layer-children').forEach((kidsEl) => {
      sortableInstances.push(Sortable.create(kidsEl, {
        animation: 140,
        handle: '.layer-drag-handle',
        draggable: '.layer-tree-node',
        group: { name: 'layers', pull: true, put: true },
        onEnd: handleSortEnd,
      }));
    });
  }

  // After ANY drag ends, walk the panel DOM and rebuild parentage +
  // global z-order from the new structure. Works whether the drag
  // re-ordered within one list or moved a node between top-level and
  // a group's children.
  function handleSortEnd() {
    // 1. Reset every parentGroupId — they'll be re-set by walking the
    //    DOM below.
    for (const l of document.layers) {
      if (l.parentGroupId && l.type !== 'group') l.parentGroupId = null;
    }
    // 2. Walk every .layer-children container; assign children + parent
    //    refs based on DOM order (panel top-of-list = bottom of childIds
    //    storage, hence the reverse).
    container.querySelectorAll('.layer-children').forEach((kidsEl) => {
      const groupId = kidsEl.dataset.groupId;
      const group = document.findLayer(groupId);
      if (!group || group.type !== 'group') return;
      const childWrappers = Array.from(kidsEl.children)
        .filter((el) => el.classList?.contains('layer-tree-node'));
      const ids = childWrappers.map((el) => el.dataset.layerId);
      group.childIds = ids.slice().reverse();
      for (const cid of ids) {
        const child = document.findLayer(cid);
        if (child) child.parentGroupId = groupId;
      }
    });
    // 3. Rebuild the flat document.layers order. Top-level wrappers
    //    appear in panel order; their group children get appended right
    //    after them (so the flat list stays grouped logically).
    const topWrappers = Array.from(container.children)
      .filter((el) => el.classList?.contains('layer-tree-node'));
    const allInOrder = [];
    const visit = (id) => {
      const layer = document.findLayer(id);
      if (!layer) return;
      allInOrder.push(id);
      if (layer.type === 'group') {
        for (const cid of (layer.childIds || []).slice().reverse()) {
          if (!allInOrder.includes(cid)) visit(cid);
        }
      }
    };
    for (const wrapper of topWrappers) visit(wrapper.dataset.layerId);
    // Defensive: append any layers we missed (e.g. orphans).
    for (const l of document.layers) {
      if (!allInOrder.includes(l.id)) allInOrder.push(l.id);
    }
    document.reorderLayers(allInOrder.slice().reverse());
    // The panel re-renders on layer:reordered (subscriber).
  }

  function showBlendMenu(trigger, layer) {
    closeAllBlendMenus();
    const menu = window.document.createElement('div');
    menu.className = 'layer-blend-menu layer-blend-menu--portaled';
    menu.innerHTML = BLEND_MODES.map((mode) => `
      <button class="layer-blend-option ${layer.blendMode === mode ? 'active' : ''}" data-mode="${mode}">${blendFull(mode)}</button>
    `).join('');
    window.document.body.appendChild(menu);

    const r = trigger.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${r.left}px`;
    menu.style.zIndex = '200';

    const options = menu.querySelectorAll('.layer-blend-option');
    options.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        document.setLayerProp(layer.id, 'blendMode', el.dataset.mode);
      });
      el.addEventListener('click', () => {
        document.setLayerProp(layer.id, 'blendMode', el.dataset.mode);
        closeAllBlendMenus();
      });
    });

    setTimeout(() => {
      window.addEventListener('click', closeAllBlendMenus, { once: true });
    });
  }

  // Build the right-click menu items for a layer-panel row. Visible
  // items adapt to the layer type + current multi-selection size.
  function panelContextMenuItems(layer) {
    const sel = getSelectionArray();
    const multi = sel.length > 1;
    const isGroup = layer.type === 'group';
    const inGroup = !!layer.parentGroupId;
    const items = [];

    items.push({
      label: multi ? `Group ${sel.length} layers` : 'Group',
      icon: 'object-group',
      shortcut: 'Ctrl+G',
      disabled: !multi,
      onClick: () => {
        const ordered = Array.from(container.querySelectorAll('.layer-item'))
          .map((el) => el.dataset.layerId)
          .filter((id) => sel.includes(id));
        const grp = document.addGroupLayer({ name: 'Group', childIds: ordered });
        if (grp) selectOnly(grp.id);
      },
    });

    if (isGroup) {
      items.push({
        label: 'Ungroup',
        icon: 'object-ungroup',
        shortcut: 'Ctrl+Shift+G',
        onClick: () => {
          const childIds = (layer.childIds || []).slice();
          document.dissolveGroup(layer.id);
          if (childIds.length) setSelection(childIds, childIds[0]);
        },
      });
    }
    if (inGroup) {
      items.push({
        label: 'Remove from group',
        icon: 'sign-out-alt',
        onClick: () => document.removeFromGroup(layer.parentGroupId, layer.id),
      });
    }
    items.push({ separator: true });
    items.push({
      label: layer.locked ? 'Unlock' : 'Lock',
      icon: layer.locked ? 'lock-open' : 'lock',
      shortcut: 'Ctrl+L',
      onClick: () => document.setLayerLocked(layer.id, !layer.locked),
    });
    items.push({
      label: layer.visible ? 'Hide' : 'Show',
      icon: layer.visible ? 'eye-slash' : 'eye',
      onClick: () => document.setLayerProp(layer.id, 'visible', !layer.visible),
    });
    items.push({ separator: true });
    items.push({
      label: 'Bring to front',
      icon: 'angle-double-up',
      onClick: () => moveLayerZ(layer.id, +Infinity),
    });
    items.push({
      label: 'Send to back',
      icon: 'angle-double-down',
      onClick: () => moveLayerZ(layer.id, -Infinity),
    });
    items.push({
      label: 'Bring forward',
      icon: 'angle-up',
      onClick: () => moveLayerZ(layer.id, +1),
    });
    items.push({
      label: 'Send backward',
      icon: 'angle-down',
      onClick: () => moveLayerZ(layer.id, -1),
    });
    items.push({ separator: true });
    items.push({
      label: 'Rename',
      icon: 'edit',
      onClick: () => {
        const row = container.querySelector(`.layer-item[data-layer-id="${layer.id}"] .layer-name`);
        if (row) beginRename(row, layer.id);
      },
    });
    items.push({
      label: 'Delete',
      icon: 'trash',
      shortcut: 'Del',
      danger: true,
      onClick: () => {
        for (const id of sel) document.removeLayer(id);
      },
    });
    return items;
  }

  // Reorder a single layer in the doc.layers array by `delta` (or to the
  // top/bottom when ±Infinity). Operates on the bottom-up flat list
  // because that's what the doc model stores.
  function moveLayerZ(id, delta) {
    const cur = document.layers.findIndex((l) => l.id === id);
    if (cur < 0) return;
    let target = cur + delta;
    if (delta === +Infinity) target = document.layers.length - 1;
    if (delta === -Infinity) target = 0;
    target = Math.max(0, Math.min(document.layers.length - 1, target));
    if (target === cur) return;
    const next = document.layers.slice();
    const [item] = next.splice(cur, 1);
    next.splice(target, 0, item);
    document.reorderLayers(next.map((l) => l.id));
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function typeIcon(type) {
    return ({ image: 'image', text: 'font', vector: 'draw-polygon', brush: 'pencil', fx: 'sliders-h' })[type] || 'layer-group';
  }

  function beginRename(nameEl, id) {
    const layer = document.findLayer(id);
    if (!layer) return;
    nameEl.setAttribute('contenteditable', 'plaintext-only');
    nameEl.classList.add('renaming');
    nameEl.focus();
    const sel = window.getSelection();
    const range = window.document.createRange();
    range.selectNodeContents(nameEl);
    sel.removeAllRanges();
    sel.addRange(range);
    const commit = () => {
      nameEl.removeAttribute('contenteditable');
      nameEl.classList.remove('renaming');
      const next = nameEl.textContent.trim() || layer.name;
      if (next !== layer.name) {
        // User typed a new name — disable auto-rename so it stays.
        document.setLayerProp(id, '_autoNamed', false);
        document.setLayerProp(id, 'name', next);
      } else nameEl.textContent = layer.name;
    };
    const cancel = () => {
      nameEl.removeAttribute('contenteditable');
      nameEl.classList.remove('renaming');
      nameEl.textContent = layer.name;
    };
    nameEl.addEventListener('blur', commit, { once: true });
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); nameEl.blur(); }
    });
  }

  // Selection / active-layer changes only flip CSS classes on the
  // already-rendered rows — full HTML rebuild + RAF wait would otherwise
  // add a perceptible lag to every click. Targeted DOM update keeps the
  // selection feedback synchronous with the click.
  function syncSelectionClasses() {
    const sel = getSelection();
    const multi = sel.size > 1;
    const activeId = document.activeLayerId;
    // Build the "selection hierarchy" sets:
    //   • inSelectedGroup: layers whose ancestor chain includes a
    //     selected group → subtle "part of group selection" hint.
    //   • ancestorOfSelected: groups whose descendant tree contains a
    //     selected leaf → subtle "contains selection" hint.
    const inSelectedGroup = new Set();
    const ancestorOfSelected = new Set();
    for (const id of sel) {
      const l = document.findLayer(id);
      if (!l) continue;
      // Mark every descendant if a group is selected.
      if (l.type === 'group') {
        for (const desc of (document.descendantsOf?.(id) || [])) {
          inSelectedGroup.add(desc.id);
        }
      }
      // Walk up the parent chain marking ancestors.
      let cur = l.parentGroupId ? document.findLayer(l.parentGroupId) : null;
      while (cur) {
        ancestorOfSelected.add(cur.id);
        cur = cur.parentGroupId ? document.findLayer(cur.parentGroupId) : null;
      }
    }
    let activeRow = null;
    container.querySelectorAll('.layer-item').forEach((row) => {
      const id = row.dataset.layerId;
      const isActive = id === activeId;
      const isMulti = multi && sel.has(id);
      row.classList.toggle('active', isActive);
      row.classList.toggle('multi-selected', isMulti);
      row.classList.toggle('in-selected-group', inSelectedGroup.has(id));
      row.classList.toggle('ancestor-of-selected', ancestorOfSelected.has(id));
      if (isActive) activeRow = row;
    });
    // Reveal the active row when it sits outside the visible scroll
    // region. `nearest` keeps in-viewport rows still — only off-screen
    // selections cause a scroll, no thrashing during normal panel use.
    if (activeRow) {
      try { activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
    }
  }
  onSelectionChange(syncSelectionClasses);

  document.subscribe((e) => {
    // Active-layer change is selection-class-only — no structural HTML
    // rebuild needed. Same path as onSelectionChange.
    if (e.type === 'layer:active') {
      syncSelectionClasses();
      return;
    }
    const structural = [
      'layer:added', 'layer:removed', 'layer:reordered',
      'doc:loaded',
      'group:childrenChanged', 'group:dissolved',
    ].includes(e.type);
    if (structural) {
      scheduleRender();
      // Layer creation is async (image decode + first paint happens
      // AFTER layer:added fires). The initial render captures a thumb
      // from a still-empty dstCanvas → blank tile. scheduleThumbRefresh
      // has a built-in 220 ms delay which gives the paint time to land,
      // then re-fetches the dstCanvas.toDataURL.
      if (e.type === 'layer:added' && e.layer?.id) {
        scheduleThumbRefresh(e.layer.id);
      }
      if (e.type === 'doc:loaded') {
        // Refresh every layer's thumb after the load sequence finishes
        // so reopened projects show actual previews instead of blanks.
        for (const l of document.layers) scheduleThumbRefresh(l.id);
      }
      return;
    }
    if (e.type === 'layer:propChanged') {
      updateRow(e.id);
      return;
    }
    if ([
      'effect:propChanged', 'effect:added', 'effect:removed', 'effect:reordered',
      'layer:sourceChanged', 'layer:textChanged',
    ].includes(e.type)) {
      scheduleThumbRefresh(e.layerId || e.id);
    }
  });

  let pending = null;
  function scheduleRender() {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = null; render(); });
  }

  const thumbTimers = new Map();
  function scheduleThumbRefresh(layerId) {
    if (!layerId) return;
    if (thumbTimers.has(layerId)) clearTimeout(thumbTimers.get(layerId));
    thumbTimers.set(layerId, setTimeout(() => {
      thumbTimers.delete(layerId);
      const row = container.querySelector(`.layer-item[data-layer-id="${layerId}"] .layer-thumb`);
      const layer = document.findLayer(layerId);
      if (!row || !layer) return;
      row.style.backgroundImage = `url('${thumbForLayer(layer)}')`;
    }, 220));
  }

  function updateRow(layerId) {
    const layer = document.findLayer(layerId);
    if (!layer) return;
    const row = container.querySelector(`.layer-item[data-layer-id="${layerId}"]`);
    if (!row) return;
    const visIcon = row.querySelector('.act-vis i');
    if (visIcon) visIcon.className = `fas fa-${layer.visible ? 'eye' : 'eye-slash'}`;
    // Hidden + locked state classes drive the row's faded/locked
    // styling — keep them in sync without re-rendering the whole panel.
    row.classList.toggle('hidden', !layer.visible);
    row.classList.toggle('locked', !!layer.locked);
    const lockIcon = row.querySelector('.act-lock i');
    if (lockIcon) lockIcon.className = `fas fa-${layer.locked ? 'lock' : 'lock-open'}`;
    const lockBtn = row.querySelector('.act-lock');
    if (lockBtn) lockBtn.title = layer.locked ? 'Unlock layer' : 'Lock layer';
    const opRow = row.querySelector('.layer-opacity-row');
    if (opRow) {
      const opKnob = opRow._knob;
      const opNum = opRow._num;
      const opacityPercent = Math.round(layer.opacity * 100);
      if (opKnob && document.activeElement !== opKnob && document.activeElement !== opNum?.querySelector('input')) {
        opKnob.setValue(opacityPercent);
      }
      if (opNum && document.activeElement !== opNum.querySelector('input')) {
        opNum.setValue(opacityPercent);
      }
    }
    const nameEl = row.querySelector('.layer-name');
    if (nameEl && !nameEl.classList.contains('renaming') && nameEl.textContent !== layer.name) {
      nameEl.textContent = layer.name;
      nameEl.title = layer.name;
    }
    if (customLayerColors) {
      const accent = layer.accentColor || '#8aff8c';
      if (row.style.getPropertyValue('--layer-accent') !== accent) {
        row.style.setProperty('--layer-accent', accent);
        const dot = row.querySelector('.layer-accent-dot');
        if (dot) dot.style.background = accent;
        const pick = row.querySelector('.layer-accent-input');
        if (pick && pick.value.toLowerCase() !== accent.toLowerCase()) pick.value = accent;
      }
    }
    const blendTrigger = row.querySelector('.layer-blend-trigger');
    if (blendTrigger) {
      const currentShort = blendShort(layer.blendMode || 'source-over');
      if (blendTrigger.textContent !== currentShort) blendTrigger.textContent = currentShort;
      blendTrigger.dataset.mode = layer.blendMode || 'source-over';
    }
  }

  render();
  return { render: scheduleRender };
}
