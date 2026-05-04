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

  // Add Text — clicking uses the last-picked mode; hover the slot to choose.
  const TEXT_MODE_KEY = 'slammer:lastTextMode';
  function getLastTextMode() {
    const v = localStorage.getItem(TEXT_MODE_KEY);
    return v === 'textBox' ? 'textBox' : 'text';
  }
  function setLastTextMode(m) { try { localStorage.setItem(TEXT_MODE_KEY, m); } catch {} }

  function addText(mode) {
    const m = mode === 'textBox' ? 'textBox' : 'text';
    setLastTextMode(m);
    const layer = doc.addTextLayer({
      text: { value: 'Typo', mode: m, boxWidth: 600 },
    });
    openTextLayer?.(layer);
  }

  $('btnAddText').addEventListener('click', () => addText(getLastTextMode()));

  // Slot hover → reveal flyout; clicking an item picks a mode AND adds the layer.
  const slot = $('addTextSlot');
  const flyout = $('addTextFlyout');
  if (slot && flyout) {
    let hideTimer = null;
    const show = () => {
      clearTimeout(hideTimer);
      flyout.hidden = false;
      requestAnimationFrame(() => flyout.classList.add('open'));
      // Mark which mode is "last used" so it's visually highlighted.
      const last = getLastTextMode();
      flyout.querySelectorAll('.tool-flyout-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.mode === last);
      });
    };
    const hide = (delay = 180) => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        flyout.classList.remove('open');
        setTimeout(() => { if (!flyout.classList.contains('open')) flyout.hidden = true; }, 180);
      }, delay);
    };
    slot.addEventListener('mouseenter', show);
    slot.addEventListener('mouseleave', () => hide());
    flyout.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    flyout.addEventListener('mouseleave', () => hide());
    flyout.querySelectorAll('.tool-flyout-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        addText(el.dataset.mode);
        hide(0);
      });
    });
  }

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
