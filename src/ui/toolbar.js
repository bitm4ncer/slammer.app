// Toolbar — wires the top-bar buttons.

import { showNotification } from './notifications.js';
import { exportProjectFile, importProjectFile } from '../io/project-file.js';
import { openExportPopup } from './export-popup.js';

export function initToolbar({ document: doc, view, renderer, exportPng, projectStore, projectMenu, openTextLayer }) {
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

  // Single Add Text — text starts in plain "text" mode. The user can convert
  // it into a wrapping text box at any time via Ctrl+Shift+drag on a handle
  // (handled in the renderer's transformer wiring).
  function addText() {
    const layer = doc.addTextLayer({
      text: { value: 'Typo', mode: 'text', boxWidth: 600 },
    });
    openTextLayer?.(layer);
  }
  $('btnAddText').addEventListener('click', addText);

  $('btnNew').addEventListener('click', () => {
    if (doc.layers.length && !confirm('Discard current document and start a new blank?')) return;
    while (doc.layers.length) doc.removeLayer(doc.layers[0].id);
    doc.setName('Untitled');
    showNotification('New blank document');
  });

  $('btnExport').addEventListener('click', (e) => {
    if (e.shiftKey) {
      exportProjectFile({ document: doc });
      showNotification('.slammerproj exported');
    } else if (renderer) {
      openExportPopup({ document: doc, renderer });
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

  // Fullscreen toggle — uses the Fullscreen API; falls back to a no-op
  // on browsers that block it.
  const fsBtn = $('btnFullscreen');
  fsBtn?.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  });
  document.addEventListener('fullscreenchange', () => {
    const inFs = !!document.fullscreenElement;
    const icon = fsBtn?.querySelector('i');
    if (icon) icon.className = inFs ? 'fas fa-compress' : 'fas fa-expand';
  });

  // Tool hotkeys + project shortcuts.
  // Skip when typing into inputs/textareas/contenteditable.
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    const inField = t && t.matches && t.matches('input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Modifier shortcuts (Ctrl/Cmd) — work even from form fields except text editing fields.
    if (mod && !e.altKey) {
      if (key === 's' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        $('btnSave')?.click();
        return;
      }
      if (key === 'e' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        $('btnExport')?.click();
        return;
      }
      if (key === 'n' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        $('btnNew')?.click();
        return;
      }
      if (key === 'o' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        $('btnOpen')?.click();
        return;
      }
    }

    // Plain-letter tool hotkeys.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inField) return;
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
