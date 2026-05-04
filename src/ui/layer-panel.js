// Right-side Layer panel — list driven by Document, drag-reorder via SortableJS.

import Sortable from 'sortablejs';
import { getSettings, onSettingsChange } from './settings-popup.js';
import { createKnob } from '../plugins/shared/knob.js';
import { createNumericInput } from '../plugins/shared/numeric-input.js';
import { BLEND_MODES } from '../core/layer.js';

export function initLayerPanel({ container, document, renderer }) {
  let sortable = null;
  let customLayerColors = getSettings().customLayerColors !== false;
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

  function render() {
    const layers = document.layers.slice().reverse();
    if (!layers.length) {
      container.innerHTML = '<div class="layer-empty">No layers yet</div>';
      return;
    }
    container.innerHTML = layers.map((layer) => {
      const accent = customLayerColors ? (layer.accentColor || '#8aff8c') : 'var(--primary)';
      const swatchMarkup = customLayerColors ? `
        <label class="layer-accent-swatch" title="Layer accent colour">
          <input type="color" value="${layer.accentColor || '#8aff8c'}" class="layer-accent-input" />
          <span class="layer-accent-dot" style="background:${layer.accentColor || '#8aff8c'}"></span>
        </label>` : '';
      return `
      <div class="layer-item ${document.activeLayerId === layer.id ? 'active' : ''}"
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
          <button class="layer-icon-btn act-vis" title="Toggle visibility">
            <i class="fas fa-${layer.visible ? 'eye' : 'eye-slash'}"></i>
          </button>
          <button class="layer-icon-btn act-del" title="Delete layer"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.layer-item').forEach((row) => {
      const id = row.dataset.layerId;
      const layer = document.findLayer(id);
      if (!layer) return;

      row.addEventListener('click', (e) => {
        if (e.target.closest('.layer-actions') || e.target.closest('.layer-blend-dropdown')
            || e.target.closest('.layer-opacity-row') || e.target.closest('.layer-accent-swatch')
            || e.target.closest('.layer-name[contenteditable]')) return;
        document.setActiveLayer(id);
      });

      row.querySelector('.act-vis').addEventListener('click', (e) => {
        e.stopPropagation();
        document.setLayerProp(id, 'visible', !layer.visible);
      });
      row.querySelector('.act-del').addEventListener('click', (e) => {
        e.stopPropagation();
        document.removeLayer(id);
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
    });

    if (sortable) sortable.destroy();
    sortable = Sortable.create(container, {
      animation: 140,
      handle: '.layer-drag-handle',
      onEnd: () => {
        const ids = Array.from(container.querySelectorAll('.layer-item')).map((el) => el.dataset.layerId);
        document.reorderLayers(ids.slice().reverse());
      },
    });
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
      if (next !== layer.name) document.setLayerProp(id, 'name', next);
      else nameEl.textContent = layer.name;
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

  document.subscribe((e) => {
    const structural = [
      'layer:added', 'layer:removed', 'layer:reordered',
      'layer:active', 'doc:loaded',
    ].includes(e.type);
    if (structural) {
      scheduleRender();
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
