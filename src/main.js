// CRUSH v1 — bootstrap.

import './style/variables.css';
import './style/layout.css';
import './style/components.css';
import './style/effects.css';

import { createDocument } from './core/document.js';
import { createRenderer } from './core/renderer.js';
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

  // Autosave (debounced)
  let saveTimer = null;
  doc.subscribe(() => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      projectStore.autosave({ document: doc }).catch(() => {});
    }, 800);
  });

  console.log('[CRUSH v1] app loaded');
});
