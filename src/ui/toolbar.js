// Toolbar — wires the top-bar buttons.

import { showNotification } from './notifications.js';
import { exportSlmr, importSlmr, importProjectFile } from '../io/project-file.js';
import { openExportPopup } from './export-popup.js';
import { setTool, getTool, getLastShape, onToolChange } from './vector-tools/active-tool.js';
import { importSvgFile } from './vector-tools/svg-import.js';
import { getPencilSmoothness, setPencilSmoothness } from './vector-tools/pencil-tool.js';

// Hexagon for "polygon" via inline SVG (FA 6.4 lacks a clean hexagon glyph).
const HEX_SVG = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M 8 1 L 14.5 4.5 L 14.5 11.5 L 8 15 L 1.5 11.5 L 1.5 4.5 Z" fill="currentColor"/></svg>';
const SHAPE_OPTIONS = [
  { id: 'rect',    label: 'Rectangle', icon: 'fa-square' },
  { id: 'ellipse', label: 'Ellipse',   icon: 'fa-circle' },
  { id: 'polygon', label: 'Polygon',   svg: HEX_SVG },
  { id: 'star',    label: 'Star',      icon: 'fa-star' },
  { id: 'line',    label: 'Line',      icon: 'fa-minus' },
];

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
    // Ensure the default Google font (Inter) is loaded so the first paint
    // renders in the correct face — otherwise the canvas falls back to
    // system sans until the user opens the picker.
    import('./typography/font-loader.js').then(async ({ loadFont }) => {
      const { findFont } = await import('./typography/font-sources.js');
      const meta = findFont(layer.text.font, layer.text.provider);
      if (meta) {
        await loadFont(meta);
        try { await document.fonts.load(`${layer.text.weight || 400} ${layer.text.size || 96}px "${meta.cssFamily || meta.family}"`); } catch {}
        // Force a re-rasterise so the freshly-loaded font appears.
        doc.setTextProp(layer.id, 'value', layer.text.value);
      }
    });
    openTextLayer?.(layer);
  }
  $('btnAddText').addEventListener('click', addText);

  // ---------- Vector tools ----------
  // Select / Direct Selection / Pen / Pencil — set the active tool when
  // clicked. Pen + Pencil are 13b; the buttons are present but inactive.
  $('btnSelect')?.addEventListener('click', () => setTool('select'));
  $('btnDirectSelect')?.addEventListener('click', () => setTool('directSelect'));
  $('btnPen')?.addEventListener('click', () => setTool('pen'));
  $('btnPencil')?.addEventListener('click', () => setTool('pencil'));

  // Pencil smoothness slider in the footer — hidden unless pencil is the
  // active tool. Persists through getPencilSmoothness / setPencilSmoothness.
  const smoothWrap   = $('pencilSmoothness');
  const smoothSlider = $('pencilSmoothnessSlider');
  const smoothRead   = $('pencilSmoothnessReadout');
  if (smoothWrap && smoothSlider && smoothRead) {
    const cur = getPencilSmoothness();
    smoothSlider.value = String(cur);
    smoothRead.textContent = cur.toFixed(1);
    smoothSlider.addEventListener('input', () => {
      const v = parseFloat(smoothSlider.value);
      setPencilSmoothness(v);
      smoothRead.textContent = v.toFixed(1);
    });
    onToolChange((tool) => {
      smoothWrap.hidden = tool !== 'pencil';
    });
    smoothWrap.hidden = getTool() !== 'pencil';
  }

  // Shape button — single-click activates the last-used shape;
  // long-press / right-click opens the flyout.
  const shapeBtn = $('btnShape');
  if (shapeBtn) {
    let pressTimer = null;
    let opened = false;
    shapeBtn.addEventListener('click', () => {
      if (opened) { opened = false; return; }
      setTool(getLastShape());
    });
    shapeBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openShapeFlyout(shapeBtn);
      opened = true;
      setTimeout(() => { opened = false; }, 50);
    });
    shapeBtn.addEventListener('mousedown', () => {
      pressTimer = setTimeout(() => {
        openShapeFlyout(shapeBtn);
        opened = true;
      }, 350);
    });
    shapeBtn.addEventListener('mouseup', () => clearTimeout(pressTimer));
    shapeBtn.addEventListener('mouseleave', () => clearTimeout(pressTimer));
  }

  function openShapeFlyout(anchor) {
    closeShapeFlyout();
    const fly = window.document.createElement('div');
    fly.className = 'tool-flyout open';
    for (const opt of SHAPE_OPTIONS) {
      const item = window.document.createElement('button');
      item.className = 'tool-flyout-item';
      const iconHtml = opt.svg ? opt.svg : `<i class="fas ${opt.icon}"></i>`;
      item.innerHTML = `${iconHtml}<span>${opt.label}</span>`;
      item.addEventListener('click', () => {
        setTool(`shape:${opt.id}`);
        closeShapeFlyout();
      });
      fly.appendChild(item);
    }
    const r = anchor.getBoundingClientRect();
    fly.style.left = `${r.right + 6}px`;
    fly.style.top = `${r.top}px`;
    fly.style.position = 'fixed';
    fly.style.zIndex = '500';
    window.document.body.appendChild(fly);
    // Capture-phase outside-click handler — but ignore mousedowns landing
    // inside the flyout itself, otherwise the close fires before the item's
    // click handler can pick a shape.
    setTimeout(() => {
      const handler = (e) => {
        if (e.target.closest('.tool-flyout')) return;
        closeShapeFlyout();
        window.removeEventListener('mousedown', handler, true);
      };
      window.addEventListener('mousedown', handler, true);
    });
  }
  function closeShapeFlyout() {
    window.document.querySelectorAll('.tool-flyout.open').forEach((el) => el.remove());
  }

  // Reflect active-tool state on the buttons (aria-pressed for highlight).
  function syncToolButtons() {
    const cur = getTool();
    const map = {
      btnSelect: 'select',
      btnDirectSelect: 'directSelect',
      btnPen: 'pen',
      btnPencil: 'pencil',
    };
    for (const [id, tool] of Object.entries(map)) {
      const b = $(id);
      if (b) b.setAttribute('aria-pressed', cur === tool ? 'true' : 'false');
    }
    if (shapeBtn) {
      const isShape = cur.startsWith('shape:');
      shapeBtn.setAttribute('aria-pressed', isShape ? 'true' : 'false');
      // Update the icon to match the chosen shape.
      const last = getLastShape().slice('shape:'.length);
      const opt = SHAPE_OPTIONS.find((s) => s.id === last);
      if (opt) shapeBtn.innerHTML = opt.svg || `<i class="fas ${opt.icon}"></i>`;
    }
  }
  onToolChange(syncToolButtons);
  syncToolButtons();

  $('btnNew').addEventListener('click', () => {
    if (doc.layers.length && !confirm('Discard current document and start a new blank?')) return;
    while (doc.layers.length) doc.removeLayer(doc.layers[0].id);
    doc.setName('Untitled');
    showNotification('New blank document');
  });

  $('btnExport').addEventListener('click', (e) => {
    if (e.shiftKey) {
      exportSlmr({ document: doc, name: doc.state.name });
      showNotification('.slmr exported');
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

  // Drop a .slmr, .slammerproj (or legacy .crushproj) file anywhere on the canvas to import it.
  view.stage.container().addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer?.files || []);
    const slmr = files.find((x) => x.name?.endsWith('.slmr'));
    const legacy = files.find((x) =>
      x.name?.endsWith('.slammerproj') || x.name?.endsWith('.crushproj')
    );
    const f = slmr || legacy;
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      if (slmr) {
        await importSlmr(f, doc);
      } else {
        await importProjectFile(f, doc);
        // Re-Blob any data-URL sources for uniform pipeline.
        for (const l of doc.layers) {
          if (typeof l.source === 'string' && l.source.startsWith('data:')) {
            const blob = await fetch(l.source).then((r) => r.blob());
            doc.setLayerSource(l.id, blob);
          }
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
    else if (key === 'v') { e.preventDefault(); setTool('select'); }
    else if (key === 'a') { e.preventDefault(); setTool('directSelect'); }
    else if (key === 'p') { e.preventDefault(); setTool('pen'); }
    else if (key === 'b') { e.preventDefault(); setTool('pencil'); }
    else if (key === 'r') {
      e.preventDefault();
      // R cycles through shapes if pressed repeatedly while a shape is active.
      if (getTool().startsWith('shape:')) {
        const idx = SHAPE_OPTIONS.findIndex((s) => `shape:${s.id}` === getTool());
        const next = SHAPE_OPTIONS[(idx + 1) % SHAPE_OPTIONS.length];
        setTool(`shape:${next.id}`);
      } else {
        setTool(getLastShape());
      }
    }
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
