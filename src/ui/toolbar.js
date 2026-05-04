// Toolbar — wires the top-bar buttons.

import { showNotification } from './notifications.js';
import { exportProjectFile, importProjectFile } from '../io/project-file.js';

export function initToolbar({ document: doc, view, exportPng, projectStore, projectMenu, openTextLayer }) {
  const $ = (id) => window.document.getElementById(id);

  $('btnAddImage').addEventListener('click', () => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      files.forEach((f) => addImageFile(f, doc));
    };
    input.click();
  });

  $('btnAddText').addEventListener('click', () => {
    const layer = doc.addTextLayer({ text: { value: 'slammer' } });
    openTextLayer?.(layer);
  });

  $('btnNew').addEventListener('click', () => {
    if (doc.layers.length && !confirm('Discard current document and start a new blank?')) return;
    while (doc.layers.length) doc.removeLayer(doc.layers[0].id);
    doc.setName('Untitled');
    showNotification('New blank document');
  });

  $('btnClear').addEventListener('click', () => {
    if (!doc.layers.length) return;
    if (!confirm('Clear all layers?')) return;
    while (doc.layers.length) doc.removeLayer(doc.layers[0].id);
  });

  $('btnExport').addEventListener('click', (e) => {
    if (e.shiftKey) {
      exportProjectFile({ document: doc });
      showNotification('.slammerproj exported');
    } else {
      exportPng?.();
    }
  });

  $('btnSave').addEventListener('click', async () => {
    if (!projectStore) return;
    await projectStore.saveCurrent({ document: doc, view });
    showNotification(`Saved "${doc.state.name}"`);
  });

  $('btnOpen').addEventListener('click', () => {
    projectMenu?.open();
  });

  // Drop a .slammerproj (or legacy .crushproj) file anywhere on the canvas to import it.
  view.stage.container().addEventListener('drop', async (e) => {
    const f = Array.from(e.dataTransfer?.files || []).find((x) =>
      x.name?.endsWith('.slammerproj') || x.name?.endsWith('.crushproj')
    );
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      await importProjectFile(f, doc);
      // Re-Blob any data-URL sources for uniform pipeline.
      for (const l of doc.layers) {
        if (typeof l.source === 'string' && l.source.startsWith('data:')) {
          const blob = await fetch(l.source).then((r) => r.blob());
          doc.setLayerSource(l.id, blob);
        }
      }
      showNotification(`Loaded "${doc.state.name}"`);
    } catch (err) {
      showNotification('Failed to import project file');
      console.error(err);
    }
  }, true);

  $('zoomIn').addEventListener('click', () => view.zoomBy(1.25));
  $('zoomOut').addEventListener('click', () => view.zoomBy(0.8));
  $('zoomFit').addEventListener('click', () => view.fitTo());

  // Tool hotkeys (Photoshop-style): I = Image, T = Text.
  // Skip when typing into inputs/textareas/contenteditable, or when modifier keys are held.
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('input, textarea, [contenteditable=""], [contenteditable="true"]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'i') { e.preventDefault(); $('btnAddImage')?.click(); }
    else if (key === 't') { e.preventDefault(); $('btnAddText')?.click(); }
  });

  // Update canvas hint visibility based on layer presence.
  function syncHint() {
    const hint = $('canvasHint');
    if (!hint) return;
    hint.classList.toggle('hidden', doc.layers.length > 0);
  }
  doc.subscribe((e) => {
    if (e.type === 'layer:added' || e.type === 'layer:removed' || e.type === 'doc:loaded') syncHint();
  });
  syncHint();
}

export function addImageFile(file, doc) {
  doc.addImageLayer({ name: file.name || 'Image', source: file });
}
