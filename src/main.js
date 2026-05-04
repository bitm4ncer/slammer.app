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
import { initSettingsPopup, getSettings, onSettingsChange } from './ui/settings-popup.js';
import { initSidePanelSplit } from './ui/side-panel-split.js';

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', async () => {
  initSettingsPopup({
    button: document.getElementById('btnSettings'),
    version: 'v1.0.0-alpha',
  });
  initSidePanelSplit();

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
    addBtn: document.getElementById('btnAddEffect'),
    groupEl: document.getElementById('effectsGroup'),
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

  // ---------- Active-layer accent → CSS variable ----------
  // Drives effects/typography panels + slider thumbs to match the active layer's colour.
  // Gated by the "Custom layer colours" setting — when off, --ctx-accent stays unset
  // (CSS falls back to var(--primary)).
  function syncCtxAccent() {
    const root = document.documentElement;
    const enabled = getSettings().customLayerColors !== false;
    const layer = doc.activeLayer;
    if (enabled && layer?.accentColor) root.style.setProperty('--ctx-accent', layer.accentColor);
    else root.style.removeProperty('--ctx-accent');
    // Re-tint the Konva transformer from the new --ctx-accent.
    if (layer) {
      const st = renderer.layerState.get(layer.id);
      if (st) renderer.attachTransformer(st.group);
    }
  }
  doc.subscribe((e) => {
    if (e.type === 'layer:active' || e.type === 'doc:loaded') syncCtxAccent();
    if (e.type === 'layer:propChanged' && e.prop === 'accentColor' && doc.activeLayerId === e.id) syncCtxAccent();
  });
  onSettingsChange(syncCtxAccent);
  syncCtxAccent();

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
  let autosaveMs = getSettings().autosaveMs;
  onSettingsChange((s) => { autosaveMs = s.autosaveMs; });

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
    }, autosaveMs);
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
