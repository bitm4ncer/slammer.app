// Right-side Layer panel — list driven by Document, drag-reorder via SortableJS.

import Sortable from 'sortablejs';

export function initLayerPanel({ container, document, renderer }) {
  let sortable = null;

  function thumbForLayer(layer) {
    const st = renderer.layerState.get(layer.id);
    if (!st || !st.dstCanvas) return '';
    try {
      // Small thumbnails kept light: just reuse the dstCanvas as a scaled CSS background.
      return st.dstCanvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  function render() {
    const layers = document.layers.slice().reverse(); // top of stack first in panel
    if (!layers.length) {
      container.innerHTML = '<div class="layer-empty">No layers yet</div>';
      return;
    }
    container.innerHTML = layers.map((layer) => {
      const accent = layer.accentColor || '#8aff8c';
      return `
      <div class="layer-item ${document.activeLayerId === layer.id ? 'active' : ''}"
           data-layer-id="${layer.id}"
           style="--layer-accent:${accent}">
        <div class="layer-drag-handle"><i class="fas fa-grip-vertical"></i></div>
        <label class="layer-accent-swatch" title="Layer accent colour">
          <input type="color" value="${accent}" class="layer-accent-input" />
          <span class="layer-accent-dot" style="background:${accent}"></span>
        </label>
        <div class="layer-thumb" style="background-image:url('${thumbForLayer(layer)}')">
          <i class="fas fa-${typeIcon(layer.type)} layer-type-icon"></i>
        </div>
        <div class="layer-meta">
          <div class="layer-name" title="${escape(layer.name)}" tabindex="0">${escape(layer.name)}</div>
          <input type="range" class="layer-opacity" min="0" max="1" step="0.01" value="${layer.opacity}" />
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
      row.addEventListener('click', (e) => {
        if (e.target.closest('.layer-actions') || e.target.closest('.layer-opacity')
            || e.target.closest('.layer-accent-swatch') || e.target.closest('.layer-name[contenteditable]')) return;
        document.setActiveLayer(id);
      });
      row.querySelector('.act-vis').addEventListener('click', (e) => {
        e.stopPropagation();
        const layer = document.findLayer(id);
        if (layer) document.setLayerProp(id, 'visible', !layer.visible);
      });
      row.querySelector('.act-del').addEventListener('click', (e) => {
        e.stopPropagation();
        document.removeLayer(id);
      });
      row.querySelector('.layer-opacity').addEventListener('input', (e) => {
        document.setLayerProp(id, 'opacity', parseFloat(e.target.value));
      });
      row.querySelector('.layer-accent-input').addEventListener('input', (e) => {
        const hex = e.target.value;
        document.setLayerProp(id, 'accentColor', hex);
        row.style.setProperty('--layer-accent', hex);
        row.querySelector('.layer-accent-dot').style.background = hex;
      });
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
        // Panel shows top-of-stack first → document is bottom-up, so reverse.
        document.reorderLayers(ids.slice().reverse());
      },
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
    // Structural changes need a full DOM rebuild.
    const structural = [
      'layer:added', 'layer:removed', 'layer:reordered',
      'layer:active', 'doc:loaded',
    ].includes(e.type);
    // For prop changes (visibility/opacity) update only the affected row inline so the
    // user's drag-on-opacity-slider isn't interrupted.
    if (structural) {
      scheduleRender();
      return;
    }
    if (e.type === 'layer:propChanged') {
      updateRow(e.id);
      // If only visibility changed, the thumb doesn't need refreshing.
      return;
    }
    // Effect / source / text changes affect thumbnails — refresh them lazily.
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

  // Thumb refresh is expensive (toDataURL). Debounce per-layer with idle timing.
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
    const op = row.querySelector('.layer-opacity');
    if (op && window.document.activeElement !== op && parseFloat(op.value) !== layer.opacity) op.value = String(layer.opacity);
    const nameEl = row.querySelector('.layer-name');
    if (nameEl && !nameEl.classList.contains('renaming') && nameEl.textContent !== layer.name) {
      nameEl.textContent = layer.name;
      nameEl.title = layer.name;
    }
    const accent = layer.accentColor || '#8aff8c';
    if (row.style.getPropertyValue('--layer-accent') !== accent) {
      row.style.setProperty('--layer-accent', accent);
      const dot = row.querySelector('.layer-accent-dot');
      if (dot) dot.style.background = accent;
      const pick = row.querySelector('.layer-accent-input');
      if (pick && pick.value.toLowerCase() !== accent.toLowerCase()) pick.value = accent;
    }
  }

  render();
  return { render: scheduleRender };
}
