// Toolbar — wires the top-bar buttons.

import { showNotification } from './notifications.js';
import { toggleColorHub } from './color-hub.js';
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

// ── Z-order: move every layer in `selSet` one step (or to the extreme).
// Operates on the flat doc.layers array; does NOT reorder group children
// (that's a separate concern handled by the layer panel's drag).
//
//   dir 'up'   + extreme=false → bring forward (one step toward end)
//   dir 'down' + extreme=false → send backward (one step toward start)
//   dir 'up'   + extreme=true  → bring to front (move all to end)
//   dir 'down' + extreme=true  → send to back (move all to start)
//
// Multi-selection preserves relative order within the group.
function reorderZ(doc, selIds, dir, extreme) {
  const layers = doc.layers.slice();
  const selSet = new Set(selIds);
  if (!selSet.size) return;
  if (extreme) {
    const selected = layers.filter((l) => selSet.has(l.id));
    const unselected = layers.filter((l) => !selSet.has(l.id));
    const next = dir === 'up'
      ? [...unselected, ...selected]   // selected to end (top of stack)
      : [...selected, ...unselected];  // selected to start (bottom)
    doc.reorderLayers(next.map((l) => l.id));
    return;
  }
  const arr = layers.slice();
  if (dir === 'up') {
    // Walk end → start so a selected layer can hop over the unselected
    // layer above it without the next iteration also seeing the same
    // unselected layer in the new position.
    for (let i = arr.length - 2; i >= 0; i--) {
      if (selSet.has(arr[i].id) && !selSet.has(arr[i + 1].id)) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (selSet.has(arr[i].id) && !selSet.has(arr[i - 1].id)) {
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
  }
  doc.reorderLayers(arr.map((l) => l.id));
}

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

  // Keyboard zoom helpers — used by Ctrl+= / Ctrl+- / Ctrl+1. Both
  // operate around the viewport CENTER so Ctrl+0 (fit) and the keyboard
  // zoom feel consistent. Differs from wheel-zoom which is around the
  // pointer.
  function zoomByCentered(factor) {
    const stage = view.stage;
    const oldScale = stage.scaleX() || 1;
    const next = Math.max(0.05, Math.min(20, oldScale * factor));
    if (next === oldScale) return;
    const w = stage.width(), h = stage.height();
    const cx = w / 2, cy = h / 2;
    const worldX = (cx - stage.x()) / oldScale;
    const worldY = (cy - stage.y()) / oldScale;
    stage.scale({ x: next, y: next });
    stage.position({ x: cx - worldX * next, y: cy - worldY * next });
    stage.batchDraw();
  }
  function zoomToScale(scale) {
    const stage = view.stage;
    const oldScale = stage.scaleX() || 1;
    const target = Math.max(0.05, Math.min(20, scale));
    if (target === oldScale) return;
    const w = stage.width(), h = stage.height();
    const cx = w / 2, cy = h / 2;
    const worldX = (cx - stage.x()) / oldScale;
    const worldY = (cy - stage.y()) / oldScale;
    stage.scale({ x: target, y: target });
    stage.position({ x: cx - worldX * target, y: cy - worldY * target });
    stage.batchDraw();
  }

  // ---------- Zoom % readout ----------
  // Updates whenever the stage scale changes (wheel zoom, +/-, fit, programmatic).
  // Click → reset to 100% around viewport centre. Double-click → fit-to-view.
  const zoomReadout = $('zoomReadout');
  if (zoomReadout) {
    function syncZoomReadout() {
      const sc = view.stage.scaleX() || 1;
      const pct = Math.round(sc * 100);
      zoomReadout.textContent = `${pct}%`;
    }
    // The stage emits 'scaleXChange' / 'scaleYChange' on every transform.
    view.stage.on('scaleXChange.zoomReadout scaleYChange.zoomReadout', syncZoomReadout);
    syncZoomReadout();

    zoomReadout.addEventListener('click', (e) => {
      // Pure 100% reset around the viewport centre — keep panning x/y so
      // the centre of the viewport stays fixed.
      const stage = view.stage;
      const oldScale = stage.scaleX() || 1;
      const w = stage.width();
      const h = stage.height();
      const cx = w / 2;
      const cy = h / 2;
      // World point currently under the centre.
      const worldX = (cx - stage.x()) / oldScale;
      const worldY = (cy - stage.y()) / oldScale;
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: cx - worldX, y: cy - worldY });
      stage.batchDraw();
      syncZoomReadout();
    });
    zoomReadout.addEventListener('dblclick', (e) => {
      e.preventDefault();
      view.fitTo();
      syncZoomReadout();
    });
  }

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
      // Ctrl+0 — fit content to viewport (Affinity / Figma convention).
      if (key === '0' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        view?.fitTo?.();
        return;
      }
      // Ctrl+1 — zoom to actual size (100 %) around viewport center.
      if (key === '1' && !e.shiftKey) {
        if (inField) return;
        e.preventDefault();
        zoomToScale(1);
        return;
      }
      // Ctrl+= / Ctrl++ — zoom in (around viewport center). Most US/EU
      // keyboards emit '=' for the un-shifted +/= key; Shift+= = '+' is
      // also accepted so num-pad and laptop layouts both work.
      if ((key === '=' || key === '+') && !e.altKey) {
        if (inField) return;
        e.preventDefault();
        zoomByCentered(1.2);
        return;
      }
      // Ctrl+- — zoom out.
      if (key === '-' && !e.shiftKey && !e.altKey) {
        if (inField) return;
        e.preventDefault();
        zoomByCentered(1 / 1.2);
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

    // ── Layer Z-order + stack navigation via arrow + modifier ──────────
    // Ctrl+Up         — bring forward (one step toward top of stack)
    // Ctrl+Down       — send backward (one step toward bottom)
    // Ctrl+Shift+Up   — bring to front (top of stack)
    // Ctrl+Shift+Down — send to back (bottom of stack)
    // Ctrl+Alt+Up     — select next layer up in the stack
    // Ctrl+Alt+Down   — select next layer down
    if (mod && (key === 'arrowup' || key === 'arrowdown')) {
      if (inField) return;
      e.preventDefault();
      const dir = key === 'arrowup' ? 'up' : 'down';
      // Ctrl+Alt+Up/Down — change active selection to neighbouring layer.
      if (e.altKey && !e.shiftKey) {
        const all = doc.layers;
        if (!all.length) return;
        let i = all.findIndex((l) => l.id === doc.activeLayerId);
        if (i < 0) i = dir === 'up' ? -1 : all.length;
        let next = dir === 'up' ? i + 1 : i - 1;
        next = Math.max(0, Math.min(all.length - 1, next));
        const target = all[next];
        if (target && target.id !== doc.activeLayerId) selectOnly(target.id);
        return;
      }
      // Z-order moves require a non-empty selection (or active layer).
      const sel = new Set(getSelectionArray());
      if (!sel.size && doc.activeLayerId) sel.add(doc.activeLayerId);
      if (!sel.size) return;
      reorderZ(doc, [...sel], dir, e.shiftKey);
      return;
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

    // Tab — toggle side panels (more canvas room). Standard
    // Figma / Photoshop behaviour. Skip when a form field has focus
    // so Tab still cycles inputs / textareas as the browser default.
    if (key === 'tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      if (inField) return;
      e.preventDefault();
      window.document.body.classList.toggle('panels-collapsed');
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
    else if (key === 'c') {
      e.preventDefault();
      const dial = document.getElementById('btnColorCircle');
      if (dial) toggleColorHub(dial);
    }
    else if (key === 'x') {
      // X — swap fill ↔ stroke colours (Affinity / Photoshop convention).
      // Synchronous import via static reference at top of file would be
      // ideal, but the toolbar already imports many modules; lazy-load
      // here keeps bundle clean for users who never press X.
      e.preventDefault();
      import('../core/colors.js').then(({ swapFillStroke }) => swapFillStroke());
    }
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
