// Toolbar — wires the top-bar buttons.

import { showNotification } from './notifications.js';
import { exportSlmr, importSlmr } from '../io/project-file.js';
import { openExportPopup } from './export-popup.js';
import { setTool, getTool, getLastShape, onToolChange } from './vector-tools/active-tool.js';
import { importSvgFile } from './vector-tools/svg-import.js';
import { getPencilSmoothness, setPencilSmoothness } from './vector-tools/pencil-tool.js';
import { translatePathD } from '../core/vector-renderer.js';
import {
  getSelection, getSelectionArray, setSelection, selectOnly, clearSelection,
} from './selection-state.js';

// Hexagon for "polygon" via inline SVG (FA 6.4 lacks a clean hexagon glyph).
const HEX_SVG = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M 8 1 L 14.5 4.5 L 14.5 11.5 L 8 15 L 1.5 11.5 L 1.5 4.5 Z" fill="currentColor"/></svg>';
const SHAPE_OPTIONS = [
  { id: 'rect',    label: 'Rectangle', icon: 'fa-square' },
  { id: 'ellipse', label: 'Ellipse',   icon: 'fa-circle' },
  { id: 'polygon', label: 'Polygon',   svg: HEX_SVG },
  { id: 'star',    label: 'Star',      icon: 'fa-star' },
  { id: 'line',    label: 'Line',      icon: 'fa-minus' },
];

// Helper: return the given layer IDs ordered by their position in the
// document's flat layer list (top-of-stack first). Used so a Ctrl+G
// group's childIds matches the visual order the user just selected.
function topLevelOrder(doc, ids) {
  const set = new Set(ids);
  const ordered = [];
  // Iterate top-of-stack first (doc.layers stores bottom-first).
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (set.has(l.id)) ordered.push(l.id);
  }
  return ordered;
}

// Duplicate every selected layer. Delegates to `doc.duplicateLayer`
// which handles the JSON clone + group-descendant recursion + parent
// group re-attach in the model layer. Visual offset is +20,+20 — for
// vector layers that means the rotation anchor moves but the path
// d-coords stay (path d-coords are world-space; see vector-renderer
// COORDINATE CONVENTION). We translate the top-level vector clone's
// paths here to keep the visual offset consistent.
function duplicateSelection(doc, ids) {
  if (!ids || !ids.length) return [];
  const newIds = [];
  const dx = 20, dy = 20;
  for (const srcId of ids) {
    const src = doc.findLayer(srcId);
    if (!src) continue;
    if (src.type === 'fx') continue;       // Adjustment layers — skip dup.
    if (src.parentGroupId) continue;       // Skip children — copied via parent group.
    const clone = doc.duplicateLayer(srcId, { offsetXY: { x: dx, y: dy } });
    if (!clone) continue;
    // Vector top-level: translate path coords to match the anchor bump.
    // Vector children inside groups don't need this — the parent
    // group's transform cascades through Konva and the renderer's
    // image.position formula compensates correctly per child.
    if (clone.type === 'vector' && clone.vector?.paths?.length) {
      const newPaths = clone.vector.paths.map((p) => ({ ...p, d: translatePathD(p.d, dx, dy) }));
      doc.setVectorPaths(clone.id, newPaths);
    }
    newIds.push(clone.id);
  }
  return newIds;
}
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
    projectStore.clearCurrent();
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

  // Drop a .slmr file anywhere on the canvas to import it.
  view.stage.container().addEventListener('drop', async (e) => {
    const f = Array.from(e.dataTransfer?.files || []).find((x) =>
      x.name?.endsWith('.slmr')
    );
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      await importSlmr(f, doc);
      projectStore.clearCurrent();
      await projectStore.saveCurrent({ document: doc, view });
      showNotification(`Loaded "${doc.state.name}"`);
    } catch (err) {
      showNotification(`Import failed: ${err.message || err}`);
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

      // Selection / group shortcuts (Phase D).
      if (key === 'g' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        const sel = getSelectionArray().filter((id) => {
          const l = doc.findLayer(id);
          return l && l.type !== 'fx';
        });
        if (sel.length < 2) return;
        const ordered = topLevelOrder(doc, sel);
        const grp = doc.addGroupLayer({ name: 'Group', childIds: ordered });
        if (grp) selectOnly(grp.id);
        return;
      }
      if (key === 'g' && e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        // Find a group to dissolve — prefer the active layer if it IS
        // a group, otherwise its parent group.
        const active = doc.activeLayer;
        let target = null;
        if (active && active.type === 'group') target = active;
        else if (active && active.parentGroupId) target = doc.findLayer(active.parentGroupId);
        if (target) {
          const childIds = (target.childIds || []).slice();
          doc.dissolveGroup(target.id);
          // Re-select what used to be inside.
          if (childIds.length) setSelection(childIds, childIds[0]);
        }
        return;
      }
      if (key === 'a' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        // Select all top-level layers (groups counted as one each).
        const ids = doc.layers.filter((l) => !l.parentGroupId).map((l) => l.id);
        setSelection(ids, ids[ids.length - 1] || null);
        return;
      }
      if (key === 'd' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        const ids = getSelectionArray();
        if (!ids.length && doc.activeLayerId) ids.push(doc.activeLayerId);
        const newIds = duplicateSelection(doc, ids);
        if (Array.isArray(newIds) && newIds.length) {
          setSelection(newIds, newIds[0]);
        }
        return;
      }
      if (key === 'l' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        const sel = getSelectionArray();
        if (!sel.length) return;
        // Toggle based on the FIRST selected layer's current state.
        const first = doc.findLayer(sel[0]);
        if (!first) return;
        const next = !first.locked;
        for (const id of sel) doc.setLayerLocked(id, next);
        return;
      }
    }

    // Plain Esc → reduce multi-selection to active layer only.
    if (key === 'escape' && !mod && !e.altKey && !e.shiftKey) {
      if (inField) return;
      const sel = getSelection();
      if (sel.size > 1) {
        const active = doc.activeLayerId;
        if (active) selectOnly(active);
        else clearSelection();
        e.preventDefault();
        return;
      }
    }

    // Arrow-key nudge for selected layers (Select tool only).
    if ((key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown')
        && !mod && !e.altKey) {
      if (inField) return;
      if (getTool() !== 'select') return;
      const ids = getSelectionArray();
      // Empty selection but an active layer? Nudge that.
      const targets = ids.length ? ids : (doc.activeLayerId ? [doc.activeLayerId] : []);
      if (!targets.length) return;
      // Drop nested-under-selected-group children so they don't move
      // twice (the group transform cascades to children via Konva).
      const set = new Set(targets);
      const top = targets.filter((id) => {
        let cur = doc.findLayer(id)?.parentGroupId;
        while (cur) {
          if (set.has(cur)) return false;
          cur = doc.findLayer(cur)?.parentGroupId || null;
        }
        return true;
      });
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (key === 'arrowleft')  dx = -step;
      if (key === 'arrowright') dx =  step;
      if (key === 'arrowup')    dy = -step;
      if (key === 'arrowdown')  dy =  step;
      e.preventDefault();
      for (const id of top) {
        const layer = doc.findLayer(id);
        if (!layer || layer.locked || layer.type === 'fx') continue;
        const cur = layer.transform || { x: 0, y: 0 };
        doc.setLayerTransform(id, { x: (cur.x || 0) + dx, y: (cur.y || 0) + dy });
        // Vector layers: path d-coords are world-space (see
        // vector-renderer). Translating only the transform anchor
        // leaves the visual unchanged — translate the paths too.
        if (layer.type === 'vector' && layer.vector?.paths?.length) {
          const newPaths = layer.vector.paths.map((rec) => ({
            ...rec,
            d: translatePathD(rec.d, dx, dy),
          }));
          doc.setVectorPaths(id, newPaths);
        }
      }
      return;
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
