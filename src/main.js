// slammer.app — bootstrap.

import './style/variables.css';
import './style/layout.css';
import './style/components.css';
import './style/effects.css';

import { createDocument } from './core/document.js';
import { createRenderer } from './core/renderer.js';
import { createHistory } from './core/history.js';
import { initCanvasView } from './ui/canvas-view.js';
import { initLayerPanel } from './ui/layer-panel.js';
import { initEffectPanel } from './ui/effect-panel.js';
import { initToolbar, addImageFile } from './ui/toolbar.js';
import { initTextTool } from './ui/text-tool.js';
import { showNotification } from './ui/notifications.js';
import { registerPlugin } from './plugins/registry.js';

// Plugins (Phase 4a foundation: Invert. Others registered as they land.)
import invertPlugin from './plugins/filters/invert/index.js';
import brightnessPlugin from './plugins/filters/brightness/index.js';
import contrastPlugin from './plugins/filters/contrast/index.js';
import levelsPlugin from './plugins/filters/levels/index.js';
import blurPlugin from './plugins/filters/blur/index.js';
import ditheringPlugin from './plugins/tools/dithering/index.js';
import pixelsortPlugin from './plugins/tools/pixelsort/index.js';
import jpegPlugin from './plugins/tools/jpeg-compression/index.js';

import { exportVisibleAsPng } from './io/export-png.js';
import { initProjectStore } from './io/project-store.js';
import { initProjectMenu } from './ui/project-menu.js';
import { initAffinityBridge } from './integrations/affinity/index.js';

// ---------- Theme color ----------
function initThemeColor() {
  const picker = document.getElementById('themeColorPicker');
  if (!picker) return;
  const initial = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  if (initial) picker.value = initial;
  const update = (hex) => {
    document.documentElement.style.setProperty('--primary', hex);
    document.documentElement.style.setProperty('--primary-hover', darken(hex, 0.15));
    const { r, g, b } = hexToRgb(hex);
    document.documentElement.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
  };
  picker.addEventListener('input', (e) => update(e.target.value));
  picker.addEventListener('change', () => showNotification('UI theme color updated'));
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function darken(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - percent;
  const to2 = (n) => Math.max(0, Math.floor(n * f)).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', async () => {
  initThemeColor();

  // Register plugins (order = order shown in Add menus, sort of).
  [
    invertPlugin, brightnessPlugin, contrastPlugin, levelsPlugin, blurPlugin,
    ditheringPlugin, pixelsortPlugin, jpegPlugin,
  ].forEach(registerPlugin);

  const doc = createDocument();
  const view = initCanvasView({
    container: document.getElementById('stageContainer'),
    document: doc,
    onImageDropped: (file) => addImageFile(file, doc),
  });
  const renderer = createRenderer({
    stage: view.stage,
    contentLayer: view.contentLayer,
    document: doc,
    getStage: view.getStage,
  });

  initLayerPanel({
    container: document.getElementById('layerList'),
    document: doc,
    renderer,
  });
  initEffectPanel({
    stackEl: document.getElementById('effectStack'),
    addToolBtn: document.getElementById('btnAddTool'),
    addFilterBtn: document.getElementById('btnAddFilter'),
    document: doc,
  });

  const textTool = initTextTool({ document: doc });

  const projectStore = initProjectStore();
  const projectMenu = initProjectMenu({ document: doc, projectStore, view });

  initToolbar({
    document: doc,
    view,
    exportPng: () => exportVisibleAsPng({ renderer, document: doc }),
    projectStore,
    projectMenu,
    openTextLayer: (layer) => textTool.focus(layer),
  });

  initAffinityBridge({ document: doc, renderer });

  // ---------- History (undo/redo) ----------
  const history = createHistory(doc);
  const undoBtn = document.getElementById('btnUndo');
  const redoBtn = document.getElementById('btnRedo');
  history.subscribe(({ canUndo, canRedo }) => {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
  });
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  window.addEventListener('keydown', (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod) return;
    const ae = document.activeElement;
    const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (inField) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      history.redo();
    }
  });

  // ---------- Autosave with status indicator ----------
  const dot = document.getElementById('autosaveDot');
  let saveTimer = null;
  let dotResetTimer = null;
  let bootRestoreInFlight = true; // suppress autosave for the initial restore-load
  function setDotState(state) {
    dot.classList.remove('dirty', 'saving', 'saved');
    if (state) dot.classList.add(state);
    if (dotResetTimer) clearTimeout(dotResetTimer);
    if (state === 'saved') {
      dotResetTimer = setTimeout(() => dot.classList.remove('saved'), 1400);
    }
  }
  doc.subscribe((e) => {
    if (bootRestoreInFlight) return;
    setDotState('dirty');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      setDotState('saving');
      try {
        await projectStore.autosave({ document: doc });
        setDotState('saved');
      } catch {
        setDotState(null);
      }
    }, 800);
  });

  // ---------- Restore last open project on reload ----------
  await restoreLastSession({ doc, projectStore });
  bootRestoreInFlight = false;

  console.log('[slammer.app] loaded');
});

async function restoreLastSession({ doc, projectStore }) {
  const id = projectStore.getCurrent();
  if (!id) return;
  try {
    const projDoc = await projectStore.loadProject(id);
    if (!projDoc || !projDoc.layers?.length) return;
    // Convert any data-URL sources back to Blobs so the renderer treats them uniformly.
    for (const l of projDoc.layers) {
      if (typeof l.source === 'string' && l.source.startsWith('data:')) {
        l.source = await fetch(l.source).then((r) => r.blob());
      }
    }
    doc.load(projDoc);
  } catch (err) {
    console.warn('[slammer.app] restore failed', err);
  }
}
