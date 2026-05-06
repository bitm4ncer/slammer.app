// Drop zone for plugin generators — accepts:
//   • a layer card dragged from the layer panel (mime: application/x-slammer-layer)
//   • a file dropped from disk (image/*)
//   • a layer picked via the dropdown
//
// The zone reports its current selection through `onChange({ source, name, blobPromise })`
// where blobPromise resolves to the actual Blob (lazy — only computed when needed,
// so dragging a layer doesn't trigger rasterisation until the user clicks Generate).

import { getDraggingLayer } from '../../../ui/drag-state.js';

export function createDropZone({ ctx, onChange, label = 'Drop image or layer' }) {
  const root = document.createElement('div');
  root.className = 'plugin-dropzone';
  root.innerHTML = `
    <div class="plugin-dropzone-empty">
      <i class="fas fa-image"></i>
      <div class="plugin-dropzone-title">${escapeHtml(label)}</div>
      <div class="plugin-dropzone-hint">Drag a layer or image here, or pick from the list</div>
      <select class="plugin-dropzone-select"><option value="">— pick a layer —</option></select>
    </div>
    <div class="plugin-dropzone-filled" hidden>
      <img class="plugin-dropzone-preview" alt="" />
      <div class="plugin-dropzone-meta">
        <div class="plugin-dropzone-name"></div>
        <button class="plugin-dropzone-clear" type="button" title="Clear"><i class="fas fa-times"></i></button>
      </div>
    </div>
  `;

  const empty = root.querySelector('.plugin-dropzone-empty');
  const filled = root.querySelector('.plugin-dropzone-filled');
  const previewImg = root.querySelector('.plugin-dropzone-preview');
  const nameEl = root.querySelector('.plugin-dropzone-name');
  const select = root.querySelector('.plugin-dropzone-select');
  const clearBtn = root.querySelector('.plugin-dropzone-clear');

  let current = null;
  let previewURL = null;

  function refreshLayerOptions() {
    if (!ctx?.doc) return;
    const layers = ctx.doc.layers.filter((l) => l.type === 'image' || l.type === 'text' || l.type === 'vector');
    const currentVal = select.value;
    select.innerHTML = '<option value="">— pick a layer —</option>'
      + layers.slice().reverse().map((l) => `<option value="${l.id}">${escapeHtml(l.name || l.type)}</option>`).join('');
    if (layers.find((l) => l.id === currentVal)) select.value = currentVal;
  }

  refreshLayerOptions();
  ctx?.doc?.subscribe?.((e) => {
    if (['layer:added', 'layer:removed', 'layer:reordered', 'layer:propChanged', 'doc:loaded'].includes(e.type)) {
      refreshLayerOptions();
    }
  });

  function setSelection(sel) {
    if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
    current = sel;
    if (!sel) {
      empty.hidden = false;
      filled.hidden = true;
      previewImg.removeAttribute('src');
      nameEl.textContent = '';
      onChange?.(null);
      return;
    }
    empty.hidden = true;
    filled.hidden = false;
    nameEl.textContent = sel.name || (sel.kind === 'layer' ? 'Layer' : 'Image');
    // Show a preview thumb. For layer source, draw the cached dst canvas.
    if (sel.kind === 'layer' && ctx?.renderer) {
      const st = ctx.renderer.layerState.get(sel.layerId);
      if (st?.dstCanvas) {
        try { previewImg.src = st.dstCanvas.toDataURL('image/png'); } catch {}
      }
    } else if (sel.kind === 'file' && sel.file) {
      previewURL = URL.createObjectURL(sel.file);
      previewImg.src = previewURL;
    }
    onChange?.(sel);
  }

  // ---------- Drag & drop ----------
  // CRITICAL: dragover MUST call preventDefault unconditionally — without it
  // the browser rejects the drop and the `drop` event never fires. Earlier
  // version gated this behind a mime check, which broke whenever
  // dataTransfer.types arrived empty (some browsers hide types during drag).
  ['dragenter', 'dragover'].forEach((ev) => {
    root.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      const types = e.dataTransfer?.types || [];
      const wantsLayer = Array.from(types).includes('application/x-slammer-layer');
      const wantsFile = Array.from(types).includes('Files');
      if (e.dataTransfer) e.dataTransfer.dropEffect = (wantsLayer || wantsFile) ? 'copy' : 'none';
      if (wantsLayer || wantsFile) root.classList.add('drag-over');
    });
  });
  root.addEventListener('dragleave', (e) => {
    if (!root.contains(e.relatedTarget)) root.classList.remove('drag-over');
  });
  root.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    root.classList.remove('drag-over');

    const types = Array.from(e.dataTransfer?.types || []);
    const isFileDrop = types.includes('Files');

    // Layer drops first. Read the standard mime, then fall back to the
    // module-scoped drag state — SortableJS can call dataTransfer.clearData()
    // mid-drag, wiping our custom MIME. We only honour the fallback when this
    // ISN'T a file drop, so a stale layer id from an earlier drag can't
    // hijack a fresh file-from-disk drop.
    if (!isFileDrop) {
      const layerId = e.dataTransfer?.getData('application/x-slammer-layer') || getDraggingLayer();
      if (layerId) {
        const layer = ctx.doc.findLayer?.(layerId);
        if (layer) {
          selectLayer(layer.id);
          return;
        }
      }
    }

    const files = Array.from(e.dataTransfer?.files || []);
    const file = files.find((f) => f.type.startsWith('image/'));
    if (file) selectFile(file);
  });

  // ---------- Layer dropdown ----------
  select.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    selectLayer(id);
  });

  // ---------- Clear ----------
  clearBtn.addEventListener('click', () => {
    select.value = '';
    setSelection(null);
  });

  function selectLayer(layerId) {
    const layer = ctx.doc.findLayer(layerId);
    if (!layer) return;
    setSelection({
      kind: 'layer',
      layerId,
      name: layer.name || layer.type,
      blobPromise: () => ctx.renderer.rasterizeLayerToBlob(layerId, { mimeType: 'image/png', maxSide: 2048 }),
    });
  }

  function selectFile(file) {
    setSelection({
      kind: 'file',
      file,
      name: file.name || 'image',
      blobPromise: () => Promise.resolve(file),
    });
  }

  return {
    el: root,
    get value() { return current; },
    clear: () => setSelection(null),
    setLayer: selectLayer,
    setFile: selectFile,
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
