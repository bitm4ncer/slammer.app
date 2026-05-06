// Plugin host — opens panel-plugin windows. Re-clicking the same plugin while
// it's open just focuses the existing window (matches the "VST" mental model).

import { getPlugin } from '../plugins/registry.js';
import { createFloatingWindow } from './floating-window.js';

const openInstances = new Map(); // pluginId → handle

export function openPluginWindow(pluginId) {
  const existing = openInstances.get(pluginId);
  if (existing) { existing.focus(); return existing; }

  const plugin = getPlugin(pluginId);
  if (!plugin || plugin.type !== 'panel') {
    console.warn(`[plugin-host] no panel plugin "${pluginId}"`);
    return null;
  }

  const ctx = window.__slammer;
  if (!ctx) {
    console.error('[plugin-host] window.__slammer not initialised yet');
    return null;
  }

  const defaultGeometry = (typeof plugin.defaultGeometry === 'function')
    ? plugin.defaultGeometry()
    : { w: 520, h: 640 };

  const handle = createFloatingWindow({
    id: `plugin-${pluginId}`,
    title: plugin.name,
    iconHTML: pluginIconHTML(plugin),
    accent: plugin.accent,
    defaultGeometry,
    minSize: { w: 320, h: 280 },
    className: `plugin-window plugin-window--${pluginId}`,
  });

  openInstances.set(pluginId, handle);
  handle.onClose(() => {
    openInstances.delete(pluginId);
    if (typeof plugin.onClose === 'function') {
      try { plugin.onClose(); } catch (err) { console.warn(`[plugin "${pluginId}"] onClose threw`, err); }
    }
  });

  try {
    plugin.renderUI(handle.body, ctx);
  } catch (err) {
    console.error(`[plugin "${pluginId}"] renderUI threw`, err);
    handle.body.innerHTML = `<div style="padding:20px;color:var(--text-secondary);font-size:11px">Plugin failed to load: ${escapeHtml(err.message || String(err))}</div>`;
  }

  return handle;
}

export function closePluginWindow(pluginId) {
  const h = openInstances.get(pluginId);
  if (h) h.close();
}

export function isPluginOpen(pluginId) {
  return openInstances.has(pluginId);
}

function pluginIconHTML(plugin) {
  if (plugin.iconHTML) return plugin.iconHTML;
  if (plugin.icon && plugin.icon.startsWith('fa-')) return `<i class="fas ${plugin.icon}"></i>`;
  if (plugin.icon) return `<i class="fas fa-${plugin.icon}"></i>`;
  return '<i class="fas fa-puzzle-piece"></i>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
