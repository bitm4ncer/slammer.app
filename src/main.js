// slammer.app — bootstrap.

import './style/variables.css';
import './style/layout.css';
import './style/components.css';
import './style/effects.css';
import './style/typography.css';
import './style/vector.css';

import { createDocument } from './core/document.js';
import { createRenderer } from './core/renderer.js';
import { createHistory } from './core/history.js';
import { initCanvasView } from './ui/canvas-view.js';
import { initLayerPanel } from './ui/layer-panel.js';
import { initEffectPanel } from './ui/effect-panel.js';
import { initToolbar, addImageFile } from './ui/toolbar.js';
import { initTextTool } from './ui/text-tool.js';
import { initVectorTool } from './ui/vector-tool.js';
import { preloadFontsForDoc } from './ui/typography/font-loader.js';
import { bootUploadedFonts } from './ui/typography/uploaded-fonts.js';
import { loadSystemFonts, wasPreviouslyGranted, isSupported as localFontsSupported } from './ui/typography/local-system-fonts.js';
import { showNotification } from './ui/notifications.js';
import { registerPlugin } from './plugins/registry.js';

// Plugins (Phase 4a foundation: Invert. Others registered as they land.)
import invertPlugin from './plugins/filters/invert/index.js';
import brightnessPlugin from './plugins/filters/brightness/index.js';
import contrastPlugin from './plugins/filters/contrast/index.js';
import levelsPlugin from './plugins/filters/levels/index.js';
import blurPlugin from './plugins/filters/blur/index.js';
import huePlugin from './plugins/filters/hue/index.js';
import colorOverlayPlugin from './plugins/filters/color-overlay/index.js';
import gradientMapPlugin from './plugins/filters/gradient-map/index.js';
import curvesPlugin from './plugins/filters/curves/index.js';
import grainPlugin from './plugins/filters/grain/index.js';
import displacementPlugin from './plugins/filters/displacement/index.js';
import ditheringPlugin from './plugins/tools/dithering/index.js';
import pixelsortPlugin from './plugins/tools/pixelsort/index.js';
import jpegPlugin from './plugins/tools/jpeg-compression/index.js';
import datamoshPlugin from './plugins/tools/datamosh/index.js';

import { exportVisibleAsPng } from './io/export-png.js';
import { initProjectStore } from './io/project-store.js';
import { initProjectMenu } from './ui/project-menu.js';
import { initAffinityBridge } from './integrations/affinity/index.js';
import { initSettingsPopup, getSettings, onSettingsChange } from './ui/settings-popup.js';
import { initSidePanelSplit } from './ui/side-panel-split.js';
import { initLayerStackAdd } from './ui/layer-stack-add.js';
import { initDocumentSizePopup } from './ui/document-size-popup.js';
import { initAlignmentControls } from './ui/alignment-controls.js';
import { openExportPopup } from './ui/export-popup.js';

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
    huePlugin, colorOverlayPlugin, gradientMapPlugin, curvesPlugin,
    grainPlugin, displacementPlugin,
    ditheringPlugin, pixelsortPlugin, jpegPlugin, datamoshPlugin,
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
  initVectorTool({ document: doc });

  const projectStore = initProjectStore();
  const projectMenu = initProjectMenu({ document: doc, projectStore, view });

  initToolbar({
    document: doc,
    view,
    renderer,
    exportPng: () => exportVisibleAsPng({ renderer, document: doc }),
    projectStore,
    projectMenu,
    openTextLayer: (layer) => textTool.focus(layer),
  });

  initLayerStackAdd({
    document: doc,
    openTextLayer: (layer) => textTool.focus(layer),
  });

  initDocumentSizePopup({
    document: doc,
    view,
    button: document.getElementById('btnDocSize'),
  });
  initAlignmentControls({
    document: doc,
    container: document.getElementById('alignmentStrip'),
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
  const undoBtns = document.querySelectorAll('.tb-undo');
  const redoBtns = document.querySelectorAll('.tb-redo');
  history.subscribe(({ canUndo, canRedo }) => {
    undoBtns.forEach((b) => { b.disabled = !canUndo; });
    redoBtns.forEach((b) => { b.disabled = !canRedo; });
  });
  undoBtns.forEach((b) => b.addEventListener('click', () => history.undo()));
  redoBtns.forEach((b) => b.addEventListener('click', () => history.redo()));
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
      } catch (err) {
        // No more silent failures — surface so we can debug.
        console.error('[slammer.app] autosave failed:', err);
        setDotState(null);
      }
    }, autosaveMs);
  });

  // ---------- Restore last open project on reload ----------
  // Guard the boot restore with a timeout — if IDB hangs (e.g. an upgrade is
  // blocked by another tab), we DO NOT want bootRestoreInFlight stuck at true,
  // because that silently eats every autosave event. After 5 s we wake it up.
  const restoreSafetyTimer = setTimeout(() => {
    if (bootRestoreInFlight) {
      console.warn('[slammer.app] restore took >5 s — forcing autosave to resume');
      bootRestoreInFlight = false;
    }
  }, 5000);
  try {
    // Register all uploaded fonts into document.fonts BEFORE restoring the
    // doc — otherwise text layers using uploads would render with fallback.
    await bootUploadedFonts();
    // If the user previously granted Local Font Access, silently re-load
    // installed system fonts so the picker reflects them on every visit.
    if (localFontsSupported() && wasPreviouslyGranted()) {
      loadSystemFonts({ requestPermission: false }).catch(() => {});
    }
    await restoreLastSession({ doc, projectStore });
  } finally {
    clearTimeout(restoreSafetyTimer);
    bootRestoreInFlight = false;
  }

  console.log('[slammer.app] loaded — autosave armed (delay ' + autosaveMs + ' ms)');
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
    // Preload Google fonts for any text layers BEFORE the renderer rasterises,
    // so canvas fillText doesn't fall back to sans-serif on first paint after reload.
    // Capped at 2 s so a slow font CDN doesn't block restore.
    try {
      await Promise.race([
        preloadFontsForDoc(projDoc),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch (err) {
      console.warn('[slammer.app] font preload skipped:', err);
    }
    doc.load(projDoc);
  } catch (err) {
    console.warn('[slammer.app] restore failed', err);
  }
}
