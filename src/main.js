// slammer.app — bootstrap.

import Konva from 'konva';
import './style/variables.css';
import './style/layout.css';
import './style/components.css';
import './style/effects.css';
import './style/typography.css';
import './style/vector.css';
import './style/color-hub.css';

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
import { registerPremiumPluginsForDev } from './plugins/premium-loader.js';

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
// pixelsort moved to src/plugins/premium/ — auto-registered via premium-loader.
// Phase 20 — new effects library (6 free, 4 premium under src/plugins/premium/).
import posterizePlugin from './plugins/filters/posterize/index.js';
import rgbShiftPlugin from './plugins/filters/rgb-shift/index.js';
import dropShadowPlugin from './plugins/filters/drop-shadow/index.js';
import solarizePlugin from './plugins/filters/solarize/index.js';
// datamosh, jpeg-compression, dithering, twirl, ripple, bulge moved to
// src/plugins/premium/ — loaded in dev via premium-loader.js, served via
// Bitmancer Library shop in prod.

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
// stipple + halftone moved to src/plugins/premium/ — loaded via premium-loader.
import spirographVPlugin from './plugins/vector/spirograph/index.js';
import scribbleVPlugin from './plugins/vector/scribble/index.js';
import metaballVPlugin from './plugins/vector/metaball/index.js';

// Phase 16 — panel plugins.
import unsplashPlugin from './plugins/panels/unsplash/index.js';
import pexelsPlugin from './plugins/panels/pexels/index.js';
// Openverse — re-enabled after the multi-proxy fallback chain landed.
// Anonymous tier still rate-limits (~20 req/hour from origins blocked
// from non-localhost), but fetchWithProxy now walks to a CORS-friendly
// proxy when the direct API call 401's. Wikimedia results are no
// longer filtered — the thumbnail-width normalisation in the plugin
// handles the 429 wall on non-standard widths.
import openversePlugin from './plugins/panels/openverse/index.js';
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
import { initColorCircle } from './ui/color-circle.js';
import { initQuickSelectWheel } from './ui/quick-select-wheel.js';
import { initAlignmentControls } from './ui/alignment-controls.js';
import { openExportPopup } from './ui/export-popup.js';
import { initSidebarPlugins } from './ui/sidebar-plugins.js';
import { openShop } from './ui/shop-popup.js';
import { initSnapRulers } from './ui/snap-rulers.js';
import { initCanvasGrid } from './ui/canvas-grid.js';
import { initTransformInspector } from './ui/transform-inspector.js';

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', async () => {
  initSettingsPopup({
    button: document.getElementById('btnSettings'),
    version: '1.0.2',
  });
  // Konva.pixelRatio policy — applied BEFORE any Konva object is created.
  //   • 1x display (Windows / desktop monitors): pixelRatio = 1. No-op.
  //   • 2x retina (most Macs, iPads): pixelRatio = 2. Sharp UI, default.
  //   • 3x+ devices (HDPI phones, 5K monitors): CAPPED at 2 — the visual
  //     difference between 2x and 3x is sub-perceptual but the perf cost
  //     scales with the square, so 3x is ~55% more pixel work than 2x for
  //     no real gain. This matches what Figma / Photopea / Procreate do
  //     implicitly. Saves the 3x-display user from a slideshow.
  //   • Performance mode setting (Canvas tab) forces pixelRatio = 1 across
  //     the board for users who hit perf limits even at 2x — escape hatch
  //     for the slow-Mac + heavy-project case.
  // Toggling the setting requires a reload to fully apply (existing
  // canvases keep their original backing-store size).
  try {
    const settings = getSettings();
    const dpr = window.devicePixelRatio || 1;
    Konva.pixelRatio = settings.performanceMode ? 1 : Math.min(dpr, 2);
  } catch (_) { /* legacy build */ }
  initSidePanelSplit();

  // Register plugins (order = order shown in Add menus, sort of).
  [
    invertPlugin, brightnessPlugin, contrastPlugin, levelsPlugin, blurPlugin,
    huePlugin, colorOverlayPlugin, gradientMapPlugin, curvesPlugin,
    grainPlugin, displacementPlugin,
    posterizePlugin,
    rgbShiftPlugin,
    dropShadowPlugin,
    solarizePlugin,
    // Vector-only plugins.
    zigzagVPlugin, turbulenceVPlugin, roughenVPlugin, puckerVPlugin,
    twistVPlugin, offsetVPlugin, booleanVPlugin, repeaterVPlugin,
    waveDistortVPlugin, calligraphyVPlugin, hatchingVPlugin,
    spirographVPlugin, scribbleVPlugin, metaballVPlugin,
    // Panel plugins (Phase 16). fal.ai pinned first so it leads the
    // Plugin Manager list.
    falaiPlugin, unsplashPlugin, pexelsPlugin, openversePlugin, metPlugin,
  ].forEach(registerPlugin);

  // Local-only: discover premium plugins under src/plugins/premium/ if
  // present. No-op in production; the folder is gitignored so a public
  // clone never sees premium code. See plugins/premium-loader.js.
  registerPremiumPluginsForDev();

  const doc = createDocument();
  const view = initCanvasView({
    container: document.getElementById('stageContainer'),
    document: doc,
    onImageDropped: (file) => addImageFile(file, doc),
  });

  // Phase 21 — Canvas Grid (mounts its Konva.Layer between bgLayer and contentLayer).
  const canvasGrid = initCanvasGrid({
    stage: view.stage,
    getSettings,
    onSettingsChange,
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
  // Phase 23 — colour core API surface for plugins.
  const colorsApi = await import('./core/colors.js').then((m) => ({
    getActive:           m.getActive,            // back-compat — returns fill hex
    setActive:           m.setActive,            // back-compat — writes fill slot
    getActiveFill:       m.getActiveFill,
    getActiveStroke:     m.getActiveStroke,
    getActiveSlots:      m.getActiveSlots,
    setActiveFill:       m.setActiveFill,
    setActiveStroke:     m.setActiveStroke,
    setActiveSlot:       m.setActiveSlot,
    swapFillStroke:      m.swapFillStroke,
    onActiveChange:      m.onActiveChange,
    getVariables:        m.getVariables,
    setVariable:         m.setVariable,
    removeVariable:      m.removeVariable,
    onVariablesChange:   m.onVariablesChange,
    getSwatches:         m.getSwatches,
    addSwatch:           m.addSwatch,
    removeSwatch:        m.removeSwatch,
    onSwatchesChange:    m.onSwatchesChange,
    resolve:             m.resolve,
  }));

  window.__slammer = {
    doc,
    renderer,
    view,
    getSettings,
    setSettings,
    onSettingsChange,
    canvasGrid,
    colors: colorsApi,
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

  // ---------- Bitmancer Shop button ----------
  const btnShop = document.getElementById('btnShop');
  if (btnShop) btnShop.addEventListener('click', () => openShop());

  initDocumentSizePopup({
    document: doc,
    view,
    button: document.getElementById('btnDocSize'),
  });
  initColorCircle({
    buttonEl: document.getElementById('btnColorCircle'),
    swatchEl: document.getElementById('colorCircleSwatch'),
    strokeRingEl: document.getElementById('colorCircleStrokeRing'),
  });
  initQuickSelectWheel({
    document: doc,
    anchorEl: document.getElementById('btnColorCircle'),
  });
  initAlignmentControls({
    document: doc,
    container: document.getElementById('alignmentStrip'),
  });
  initTransformInspector({
    document: doc,
    // Mount inside the footer-right cluster, just before the Rulers
    // button — keeps the canvas-related controls (transform / rulers /
    // grid / snap) visually grouped together.
    container: (() => {
      const right = document.querySelector('.footer-right');
      const slot = document.createElement('div');
      slot.id = 'transformInspectorSlot';
      const beforeEl = document.getElementById('btnRulers');
      if (right && beforeEl) right.insertBefore(slot, beforeEl);
      else right?.prepend(slot);
      return slot;
    })(),
    getStage: () => view.stage,
  });

  initAffinityBridge({ document: doc, renderer });

  // ---------- Phase 21 — Snap + Rulers ----------
  const canvasArea = document.querySelector('.canvas-area');
  const stageContainer = document.getElementById('stageContainer');
  const snapRulers = initSnapRulers({
    stage: view.stage,
    contentLayer: view.contentLayer,
    container: canvasArea,
    document: doc,
    getSettings,
  });
  // Expose on __slammer for canvas-view to call into.
  window.__slammer.snapRulers = snapRulers;

  // Footer toggle buttons.
  const btnSnap = document.getElementById('btnSnap');
  const btnRulers = document.getElementById('btnRulers');
  const btnGrid = document.getElementById('btnGrid');

  function syncSnapBtn() {
    const on = getSettings().snapEnabled !== false;
    btnSnap?.classList.toggle('btn-snap--active', on);
  }
  function syncRulersBtn() {
    const on = !!getSettings().rulersEnabled;
    btnRulers?.classList.toggle('btn-rulers--active', on);
    snapRulers.updateRulers();
  }
  function syncGridBtn() {
    const on = !!getSettings().canvasGridShow;
    btnGrid?.classList.toggle('btn-grid--active', on);
  }

  btnSnap?.addEventListener('click', () => {
    const cur = getSettings().snapEnabled !== false;
    setSettings({ snapEnabled: !cur });
  });
  btnRulers?.addEventListener('click', () => {
    const cur = !!getSettings().rulersEnabled;
    setSettings({ rulersEnabled: !cur });
  });
  btnGrid?.addEventListener('click', () => {
    const cur = !!getSettings().canvasGridShow;
    setSettings({ canvasGridShow: !cur });
  });

  // Keyboard shortcuts:
  //   S        → toggle snap (no modifier — bare S in a non-input context)
  //   Ctrl+R   → toggle rulers (preventDefault stops the browser-reload default)
  //   Ctrl+;   → toggle canvas grid (matches Photoshop)
  window.addEventListener('keydown', (e) => {
    const ae = document.activeElement;
    const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (inField) return;
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod && !e.altKey && (e.key === 's' || e.key === 'S')) {
      const cur = getSettings().snapEnabled !== false;
      setSettings({ snapEnabled: !cur });
    }
    if (isMod && !e.shiftKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      const cur = !!getSettings().rulersEnabled;
      setSettings({ rulersEnabled: !cur });
    }
    if (isMod && !e.shiftKey && !e.altKey && e.key === ';') {
      e.preventDefault();
      const cur = !!getSettings().canvasGridShow;
      setSettings({ canvasGridShow: !cur });
    }
  });

  onSettingsChange(() => { syncSnapBtn(); syncRulersBtn(); syncGridBtn(); });
  syncSnapBtn();
  syncRulersBtn();
  syncGridBtn();

  // Ruler repaint on pan/zoom is handled via window.__slammer.snapRulers.onStageTransform()
  // called from within canvas-view's wheel and mousemove handlers.

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
      // Internal layer-paste takes priority. When the clipboard holds
      // an internal layer (Ctrl+C / Ctrl+X), paste that and prevent
      // default — the browser will NOT fire a `paste` event after this.
      // When layerClipboard is empty, do nothing here; the `paste`
      // listener below picks up image-from-clipboard (screenshots etc.)
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

  // ---------- Ctrl+V — paste image from system clipboard ----------
  // Fires AFTER our keydown handler above. When layerClipboard is set,
  // the keydown preventDefault'd and the browser doesn't fire `paste`
  // — so this handler only runs in the "no internal layer" case (e.g.
  // user just took a screenshot or copied an image elsewhere). Reads
  // clipboardData.items for the first image/* MIME and routes the
  // resulting Blob through addImageFile().
  window.document.addEventListener('paste', async (e) => {
    const ae = window.document.activeElement;
    const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    if (inField) return;          // let normal paste happen in inputs
    if (layerClipboard) return;   // belt-and-braces — keydown should have preventDefault'd
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.kind === 'file' && it.type?.startsWith('image/')) {
        const blob = it.getAsFile();
        if (blob) {
          e.preventDefault();
          const ext = (blob.type.split('/')[1] || 'png').split(';')[0];
          const file = new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type });
          try { await addImageFile(file, doc); } catch (err) { console.warn('[paste] image import failed', err); }
        }
        return;
      }
    }
  });

  // ---------- Autosave with status indicator ----------
  const dot = document.getElementById('autosaveDot');
  let saveTimer = null;
  let dotResetTimer = null;
  let bootRestoreInFlight = true; // suppress autosave for the initial restore-load
  let autosaveMs = getSettings().autosaveMs;
  onSettingsChange((s) => { autosaveMs = s.autosaveMs; });

  // Map autosave dot state → human-readable tooltip. Hovering the dot now
  // tells the user exactly what's happening rather than just saying
  // "Autosave" forever.
  const DOT_TITLES = {
    dirty:  'Unsaved changes — autosave pending',
    saving: 'Autosaving…',
    saved:  'All changes saved',
    error:  'Autosave failed — check console for details',
  };
  function setDotState(state) {
    dot.classList.remove('dirty', 'saving', 'saved', 'error');
    if (state) dot.classList.add(state);
    dot.title = DOT_TITLES[state] || 'Autosave';
    if (dotResetTimer) clearTimeout(dotResetTimer);
    if (state === 'saved') {
      dotResetTimer = setTimeout(() => {
        dot.classList.remove('saved');
        dot.title = 'Autosave';
      }, 1400);
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
        setDotState('error');
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

  // The plastic-texture background is a 1.25 MB JPG — purely decorative.
  // Defer its fetch to idle time so it doesn't compete with the canvas
  // for first-paint bandwidth. CSS no longer references the URL directly
  // (see .plastic-texture in layout.css).
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
  idle(() => {
    document.querySelectorAll('.plastic-texture').forEach((el) => {
      el.style.backgroundImage = 'url("/data/background_01.jpg")';
    });
  });
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
