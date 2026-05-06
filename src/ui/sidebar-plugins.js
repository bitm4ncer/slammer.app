// Sidebar PLUGINS section — pinned plugins persist in localStorage
// 'slammer:pinnedPlugins'. Click a button → opens that plugin's window.
// '+' button opens the Plugin Manager popup.

import { getPlugin, listPlugins } from '../plugins/registry.js';
import { openPluginWindow } from './plugin-host.js';
import { openPluginManager } from './plugin-manager-popup.js';

const PIN_KEY = 'slammer:pinnedPlugins';

export function getPinned() {
  try {
    const arr = JSON.parse(localStorage.getItem(PIN_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function setPinned(ids) {
  localStorage.setItem(PIN_KEY, JSON.stringify(Array.from(new Set(ids))));
  window.dispatchEvent(new CustomEvent('pluginPinsChanged'));
}

export function pin(id) {
  const list = getPinned();
  if (!list.includes(id)) list.push(id);
  setPinned(list);
}

export function unpin(id) {
  setPinned(getPinned().filter((x) => x !== id));
}

export function isPinned(id) {
  return getPinned().includes(id);
}

export function initSidebarPlugins() {
  const list = document.getElementById('toolPluginList');
  const btnManager = document.getElementById('btnPluginManager');
  if (!list || !btnManager) return;

  function render() {
    const pinned = getPinned();
    list.innerHTML = '';
    for (const id of pinned) {
      const p = getPlugin(id);
      if (!p || p.type !== 'panel') continue;
      const btn = document.createElement('button');
      btn.className = 'tool-btn tool-btn--plugin';
      btn.dataset.pluginId = id;
      btn.title = p.name;
      btn.setAttribute('aria-label', p.name);
      if (p.accent) btn.style.setProperty('--ctx-accent', p.accent);
      btn.innerHTML = pluginIconHTML(p);
      btn.addEventListener('click', () => openPluginWindow(id));
      list.appendChild(btn);
    }
  }

  btnManager.addEventListener('click', () => openPluginManager());
  window.addEventListener('pluginPinsChanged', render);

  // Re-render once registries finish loading (plugins register synchronously in
  // main.js before this is called, but the listPlugins call is async-safe).
  render();
}

function pluginIconHTML(p) {
  if (p.iconHTML) return p.iconHTML;
  if (p.icon && p.icon.startsWith('fa-')) return `<i class="fas ${p.icon}"></i>`;
  if (p.icon) return `<i class="fas fa-${p.icon}"></i>`;
  return '<i class="fas fa-puzzle-piece"></i>';
}

// Re-export for plugin-manager.
export { listPlugins };
