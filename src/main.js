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
import { translatePathD } from './core/vector-renderer.js';
import { getSelectionArray, selectOnly } from './ui/selection-state.js';
import { initCanvasView } from './ui/canvas-view.js';
import { initLayerPanel } from './ui/layer-panel.js';
import { initEffectPanel } from './ui/effect-panel.js';
import { initToolbar, addImageFile } from './ui/toolbar.js';
import { initTextTool } from './ui/text-tool.js';
import { initVectorTool } from './ui/vector-tool.js';
import { initVectorEffectsPanel } from './ui/vector-effects-panel.js';
import { initAnchorOverlay } from './ui/vector-tools/anchor-overlay.js';
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

// Vector-only plugins (run inside vector-renderer pre-rasterise).
import zigzagVPlugin from './plugins/vector/zigzag/index.js';
import turbulenceVPlugin from './plugins/vector/turbulence/index.js';
import roughenVPlugin from './plugins/vector/roughen/index.js';
import puckerVPlugin from './plugins/vector/pucker-bloat/index.js';
import twistVPlugin from './plugins/vector/twist/index.js';
import offsetVPlugin from './plugins/vector/offset-path/index.js';
import booleanVPlugin from './plugins/vector/boolean/index.js';
import repeaterVPlugin from './plugins/vector/repeater/index.js';
import waveDistortVPlugin from './plugins/vector/wave-distort/index.js';
import calligraphyVPlugin from './plugins/vector/calligraphy/index.js';
import hatchingVPlugin from './plugins/vector/hatching/index.js';
import stippleVPlugin from './plugins/vector/stipple/index.js';
import halftoneVPlugin from './plugins/vector/halftone/index.js';
import spirographVPlugin from './plugins/vector/spirograph/index.js';
import scribbleVPlugin from './plugins/vector/scribble/index.js';
import metaballVPlugin from './plugins/vector/metaball/index.js';

// Phase 16 — panel plugins.
import unsplashPlugin from './plugins/panels/unsplash/index.js';
import pexelsPlugin from './plugins/panels/pexels/index.js';
// Openverse anonymous tier returns 401 from third-party origins (works
// from localhost, blocked from gh-pages). Their auth flow needs email
// verification so we can't register-and-go from the browser. Plugin
// kept on disk for future re-enable behind a proxy or pre-issued token.
// import openversePlugin from './plugins/panels/openverse/index.js';
import metPlugin from './plugins/panels/met/index.js';
import falaiPlugin from './plugins/panels/falai/index.js';

import { exportVisibleAsPng } from './io/export-png.js';
import { initProjectStore } from './io/project-store.js';
import { initProjectMenu } from './ui/project-menu.js';
import { initAffinityBridge } from './integrations/affinity/index.js';
import { initSettingsPopup, getSettings, setSettings, onSettingsChange } from './ui/settings-popup.js';
import { initSidePanelSplit } from './ui/side-panel-split.js';
import { initLayerStackAdd } from './ui/layer-stack-add.js';
import { initDocumentSizePopup } from './ui/document-size-popup.js';
import { initAlignmentControls } from './ui/alignment-controls.js';
import { openExportPopup } from './ui/export-popup.js';
import { initSidebarPlugins } from './ui/sidebar-plugins.js';

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', async () => {
  initSettingsPopup({
    button: document.getElementById('btnSettings'),
    version: 'v1.0.1',
  });
  initSidePanelSplit();

  // Register plugins (order = order shown in Add menus, sort of).
  [
    invertPlugin, brightnessPlugin, contrastPlugin, levelsPlugin, blurPlugin,
    huePlugin, colorOverlayPlugin, gradientMapPlugin, curvesPlugin,
    grainPlugin, displacementPlugin,
    ditheringPlugin, pixelsortPlugin, jpegPlugin, datamoshPlugin,
    // Vector-only plugins.
    zigzagVPlugin, turbulenceVPlugin, roughenVPlugin, puckerVPlugin,
    twistVPlugin, offsetVPlugin, booleanVPlugin, repeaterVPlugin,
    waveDistortVPlugin, calligraphyVPlugin, hatchingVPlugin, stippleVPlugin,
    halftoneVPlugin, spirographVPlugin, scribbleVPlugin, metaballVPlugin,
    // Panel plugins (Phase 16). fal.ai pinned first so it leads the
    // Plugin Manager list.
    falaiPlugin, unsplashPlugin, pexelsPlugin, metPlugin,
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
  // Mount the vector-effects card next to the regular Effects card
  // (same parent so the visual order matches the Vector / Effects pair).
  const fxGroupEl = document.getElementById('effectsGroup');
  initVectorEffectsPanel({
    document: doc,
    host: fxGroupEl?.parentNode || document.querySelector('.side-panel-bottom') || document.querySelector('.side-panel'),
  });
  initAnchorOverlay({
    stage: view.stage,
    contentLayer: view.contentLayer,
    document: doc,
  });

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

  // ---------- Phase 16 — plugin runtime ----------
  // Single global app context for panel plugins. We expose only what plugins
  // actually need, behind a small façade (no direct closures from this scope).
  window.__slammer = {
    doc,
    renderer,
    getSettings,
    setSettings,
    onSettingsChange,
    notify: (msg, _kind = 'info') => showNotification(msg),
    importImage: async (sourceOrUrl, name = 'Imported image') => {
      try {
        if (typeof sourceOrUrl === 'string') {
          const res = await fetch(sourceOrUrl, { referrerPolicy: 'no-referrer' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return doc.addImageLayer({ name, source: blob });
        }
        return doc.addImageLayer({ name, source: sourceOrUrl });
      } catch (err) {
        showNotification(`Import failed: ${err.message}`);
        throw err;
      }
    },
  };
  initSidebarPlugins();

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
    // Fit the viewport whenever a project is loaded so content is always visible.
    if (e.type === 'doc:loaded') {
      // Use setTimeout(0) so Konva groups have a chance to mount before fitTo
      // calculates bounding rects.
      setTimeout(() => view.fitTo(), 0);
    }
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

  // ---------- Layer clipboard (Ctrl+C / Ctrl+V / Ctrl+X) ----------
  // Ctrl+D (duplicate) and arrow-nudge already live in toolbar.js — those
  // are global keymap concerns. C/V/X are net-new and live here.
  // Clipboard is a single-layer in-memory snapshot; Blob sources are
  // preserved by reference (Blobs are immutable).
  let layerClipboard = null;

  function snapshotLayer(layer) {
    const { source, naturalSize, ...rest } = layer;
    const snap = JSON.parse(JSON.stringify(rest));
    if (source !== undefined) snap.source = source;
    if (naturalSize !== undefined) snap.naturalSize = JSON.parse(JSON.stringify(naturalSize));
    return snap;
  }

  function pasteFromClipboard() {
    if (!layerClipboard) return;
    // Build a fresh top-level layer with new ids. Group descendants are
    // dropped for v1 (paste-as-group is a follow-up — full subtree clone
    // already exists in toolbar's duplicate path).
    const fresh = JSON.parse(JSON.stringify(layerClipboard));
    fresh.id = crypto.randomUUID();
    fresh.parentGroupId = null;
    // Re-attach Blob source.
    if (layerClipboard.source instanceof Blob) fresh.source = layerClipboard.source;
    if (Array.isArray(fresh.effects)) fresh.effects.forEach((e) => { e.id = crypto.randomUUID(); });
    if (Array.isArray(fresh.vectorEffects)) fresh.vectorEffects.forEach((e) => { e.id = crypto.randomUUID(); });
    if (fresh.type === 'group') fresh.childIds = [];
    // Offset +20,+20 so the paste is visible.
    if (fresh.transform && fresh.type !== 'fx') {
      fresh.transform.x = (fresh.transform.x || 0) + 20;
      fresh.transform.y = (fresh.transform.y || 0) + 20;
    }
    const layer = doc._addLayerRaw(fresh);
    if (!layer) return;
    doc.setActiveLayer(layer.id);
    selectOnly(layer.id);
    if (layer.type === 'vector' && layer.vector?.paths?.length) {
      const newPaths = layer.vector.paths.map((p) => ({ ...p, d: translatePathD(p.d, 20, 20) }));
      doc.setVectorPaths(layer.id, newPaths);
    }
  }

  window.addEventListener('keydown', (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod || e.shiftKey || e.altKey) return;
    const ae = document.activeElement;
    const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (inField) return;
    const k = e.key.toLowerCase();
    if (k !== 'c' && k !== 'v' && k !== 'x') return;

    const sel = getSelectionArray();
    const activeId = doc.activeLayerId;

    if (k === 'c') {
      const layer = activeId && doc.findLayer(activeId);
      if (!layer) return;
      e.preventDefault();
      layerClipboard = snapshotLayer(layer);
    } else if (k === 'v') {
      if (!layerClipboard) return;
      e.preventDefault();
      pasteFromClipboard();
    } else if (k === 'x') {
      const targets = sel.length ? sel : (activeId ? [activeId] : []);
      if (!targets.length) return;
      e.preventDefault();
      // Snapshot the most-recent target so Ctrl+V after Ctrl+X behaves
      // like a true cut.
      const lastLayer = doc.findLayer(targets[targets.length - 1]);
      if (lastLayer) layerClipboard = snapshotLayer(lastLayer);
      for (const id of targets) doc.removeLayer(id);
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
