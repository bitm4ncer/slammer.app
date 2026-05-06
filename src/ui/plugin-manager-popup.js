// Plugin Manager — centred modal listing all panel plugins. Each card has
// an "Add to sidebar" toggle and an "Open" button. Toggle pins/unpins via
// sidebar-plugins, which broadcasts a `pluginPinsChanged` event.

import { listPlugins } from '../plugins/registry.js';
import { getPinned, pin, unpin } from './sidebar-plugins.js';
import { openPluginWindow } from './plugin-host.js';
import { getSettings, openSettings } from './settings-popup.js';

let backdrop = null;

export function openPluginManager() {
  if (backdrop) return;

  const plugins = listPlugins({ type: 'panel' });
  const settings = getSettings();
  const pinned = new Set(getPinned());

  backdrop = document.createElement('div');
  backdrop.className = 'settings-backdrop';
  backdrop.innerHTML = `
    <div class="settings-modal plugin-manager-modal" role="dialog" aria-label="Plugin Manager">
      <div class="settings-header">
        <span><i class="fas fa-puzzle-piece"></i> Plugins</span>
        <div class="plugin-manager-header-actions">
          <button class="settings-clear" id="pmOpenSettings" title="API Keys"><i class="fas fa-key"></i> API Keys</button>
          <button class="settings-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>
      </div>

      <div class="settings-section plugin-manager-list">
        ${plugins.length === 0
          ? '<div class="plugin-manager-empty">No panel plugins registered.</div>'
          : plugins.map((p) => renderCard(p, pinned, settings)).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
  });
  backdrop.querySelector('#pmOpenSettings').addEventListener('click', () => {
    close();
    openSettings('apikeys');
  });

  backdrop.querySelectorAll('.plugin-card').forEach((card) => {
    const id = card.dataset.pluginId;
    const toggle = card.querySelector('input[type="checkbox"]');
    toggle.addEventListener('change', (e) => {
      if (e.target.checked) pin(id); else unpin(id);
    });
    card.querySelector('[data-act="open"]').addEventListener('click', () => {
      if (!pinned.has(id)) {
        pin(id);
        toggle.checked = true;
      }
      openPluginWindow(id);
      close();
    });
  });

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop._onKey = onKey;
}

function close() {
  if (!backdrop) return;
  document.removeEventListener('keydown', backdrop._onKey);
  backdrop.remove();
  backdrop = null;
}

function renderCard(p, pinned, settings) {
  const isPinned = pinned.has(p.id);
  const status = computeStatus(p, settings);
  const accentStyle = p.accent ? `style="--ctx-accent:${p.accent}"` : '';
  const iconHTML = p.iconHTML
    || (p.icon?.startsWith('fa-') ? `<i class="fas ${p.icon}"></i>`
      : (p.icon ? `<i class="fas fa-${p.icon}"></i>` : '<i class="fas fa-puzzle-piece"></i>'));
  return `
    <div class="plugin-card" data-plugin-id="${p.id}" ${accentStyle}>
      <div class="plugin-card-icon">${iconHTML}</div>
      <div class="plugin-card-body">
        <div class="plugin-card-title">${escapeHtml(p.name)}</div>
        <div class="plugin-card-desc">${escapeHtml(p.description || '')}</div>
        ${status ? `<div class="plugin-card-status plugin-card-status--${status.kind}">${escapeHtml(status.text)}</div>` : ''}
      </div>
      <div class="plugin-card-actions">
        <label class="effect-toggle-row plugin-card-toggle" title="Pin to sidebar">
          <input type="checkbox" ${isPinned ? 'checked' : ''} />
          <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
        </label>
        <button class="plugin-card-open settings-apply" data-act="open">Open</button>
      </div>
    </div>
  `;
}

function computeStatus(p, settings) {
  if (typeof p.computeStatus === 'function') {
    try { return p.computeStatus(settings) || null; } catch { return null; }
  }
  return null;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
