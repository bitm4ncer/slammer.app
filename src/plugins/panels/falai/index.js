// fal.ai panel plugin — model browser + schema-driven forms.
//
// Layout (two-pane):
//   ┌─ search + filters ─────────────────────────────────────────┐
//   │ ┌─ model list (left) ─┬─ model form (right) ──────────────┐│
//   │ │ row                 │ name                              ││
//   │ │ row                 │ description                       ││
//   │ │ row                 │ <auto-rendered fields>            ││
//   │ │ ...                 │ [Generate] [Cancel]               ││
//   │ │                     │ status                            ││
//   │ │                     │ recent strip                      ││
//   │ └─────────────────────┴───────────────────────────────────┘│
//   └────────────────────────────────────────────────────────────┘
//
// Favourites + recent results live in the existing IndexedDB plugin store.

import { CATALOG, CATEGORIES, findModel, formatCost } from './catalog.js';
import { renderForm } from './form-renderer.js';
import { runModel, extractImageUrls, isConfigured, FalConfigError, getBalance } from './fal-client.js';
import { listFavorites, addFavorite, removeFavorite, isFavorited } from '../../../io/plugin-store.js';
import { openSettings, onSettingsChange } from '../../../ui/settings-popup.js';
import './falai.css';

const PLUGIN_ID = 'falai';
const RECENT_KEY_PREFIX = 'slammer:falai:recent:'; // localStorage, per-model id

// Module-scoped settings-change unsubscriber. Plugin is single-window, so we
// only ever need one. Registered when the window opens, fired by onClose so
// the listener doesn't leak across open/close cycles.
let unsubscribeSettings = null;

// Inline fal.ai logo (official mark). Uses currentColor so the host's
// --ctx-accent paints it; the original SVG's hard-coded #ec0648 is dropped.
const FALAI_ICON_HTML = `<svg class="falai-mark" width="13" height="13" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" aria-hidden="true"><path transform="scale(32)" d="M10.318 0c.277 0 .5.225.525.501A5.199 5.199 0 0015.5 5.157c.275.027.501.249.501.526v4.634a.542.542 0 01-.501.526 5.199 5.199 0 00-4.657 4.656.542.542 0 01-.525.501H5.683a.542.542 0 01-.526-.501 5.2 5.2 0 00-4.656-4.656.542.542 0 01-.501-.526V5.683c0-.277.225-.499.501-.526A5.2 5.2 0 005.157.501.543.543 0 015.684 0h4.634zM3.213 7.987v.002c0 2.642 2.173 4.816 4.815 4.818 2.642-.002 4.815-2.176 4.815-4.818v-.002a4.817 4.817 0 00-4.815-4.82c-2.643.001-4.817 2.177-4.815 4.82z"/></svg>`;

export default {
  id: PLUGIN_ID,
  name: 'fal.ai',
  type: 'panel',
  iconHTML: FALAI_ICON_HTML,
  accent: '#ec0648',
  description: 'Browse and run image-to-image models from fal.ai.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 880, h: 640 }; },
  onClose() {
    if (unsubscribeSettings) { try { unsubscribeSettings(); } catch {} unsubscribeSettings = null; }
  },
  computeStatus(settings) {
    if (!settings.falaiApiKey) return { kind: 'warn', text: 'Needs fal.ai API key' };
    return null;
  },

  renderUI(container, ctx) {
    container.classList.add('falai-panel');
    container.innerHTML = `
      <div class="falai-topbar">
        <input type="text" class="falai-search" placeholder="Search models…" />
        <div class="falai-filters export-pillgroup" data-key="category">
          <button class="effect-pill active" data-v="">All</button>
          ${CATEGORIES.map((c) => `<button class="effect-pill" data-v="${c}">${c}</button>`).join('')}
        </div>
        <button class="falai-fav-toggle" title="Favorites only" aria-pressed="false"><i class="fas fa-heart"></i></button>
        <button class="falai-balance" data-slot="balance" title="fal.ai credits — click to top up">
          <i class="fas fa-coins"></i>
          <span class="falai-balance-value" data-slot="balance-value">—</span>
        </button>
      </div>

      <div class="falai-body">
        <div class="falai-list" data-slot="list"></div>
        <div class="falai-detail" data-slot="detail">
          <div class="falai-empty" data-slot="empty">
            <div class="falai-empty-title">fal.ai</div>
            <div class="falai-empty-hint">Pick a model on the left.</div>
            <div class="falai-featured" data-slot="featured">
              <div class="falai-featured-label">Featured</div>
              <div class="falai-featured-grid"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const searchInput = container.querySelector('.falai-search');
    const filterGroup = container.querySelector('.falai-filters');
    const favToggle = container.querySelector('.falai-fav-toggle');
    const listEl = container.querySelector('[data-slot="list"]');
    const detailEl = container.querySelector('[data-slot="detail"]');
    const emptyEl = container.querySelector('[data-slot="empty"]');
    const featuredGrid = container.querySelector('.falai-featured-grid');

    let category = '';
    let query = '';
    let favOnly = false;
    let selectedId = null;
    let favoriteIds = new Set();

    refreshFavorites();
    renderList();
    renderFeatured();

    // ---------- Balance chip ----------
    // Always rendered with a placeholder ("—") so the topbar doesn't reflow
    // when the fetch resolves. Value gets dropped in once getBalance comes back.
    const balanceBtn = container.querySelector('[data-slot="balance"]');
    const balanceValue = container.querySelector('[data-slot="balance-value"]');
    async function refreshBalance() {
      if (!isConfigured()) {
        balanceValue.textContent = '—';
        balanceBtn.classList.remove('falai-balance--ok');
        return;
      }
      // Keep current value visible while we re-fetch; only swap on success.
      const n = await getBalance();
      if (typeof n === 'number') {
        balanceValue.textContent = n.toFixed(2);
        balanceBtn.classList.add('falai-balance--ok');
      } else {
        balanceValue.textContent = '—';
        balanceBtn.classList.remove('falai-balance--ok');
      }
    }
    balanceBtn.addEventListener('click', () => {
      window.open('https://fal.ai/dashboard/usage-billing/credits', '_blank', 'noopener,noreferrer');
    });
    refreshBalance();

    // Sync every Configure-in-Settings CTA inside this window when the user
    // changes their key. Without this the orange banner sticks around even
    // after the key is set. Cleared in onClose to avoid leaks.
    if (unsubscribeSettings) { try { unsubscribeSettings(); } catch {} }
    unsubscribeSettings = onSettingsChange(() => {
      container.querySelectorAll('.plugin-config-cta').forEach((el) => {
        el.hidden = isConfigured();
      });
      refreshBalance();
    });

    searchInput.addEventListener('input', (e) => { query = e.target.value.toLowerCase().trim(); renderList(); });
    filterGroup.querySelectorAll('.effect-pill').forEach((b) => {
      b.addEventListener('click', () => {
        category = b.dataset.v;
        filterGroup.querySelectorAll('.effect-pill').forEach((x) => x.classList.toggle('active', x === b));
        renderList();
      });
    });
    favToggle.addEventListener('click', () => {
      favOnly = !favOnly;
      favToggle.setAttribute('aria-pressed', String(favOnly));
      favToggle.classList.toggle('active', favOnly);
      renderList();
    });

    async function refreshFavorites() {
      const favs = await listFavorites(PLUGIN_ID);
      favoriteIds = new Set(favs.map((f) => f.payload?.modelId).filter(Boolean));
    }

    function renderList() {
      const items = CATALOG.filter((m) => {
        if (category && m.category !== category) return false;
        if (favOnly && !favoriteIds.has(m.id)) return false;
        if (query) {
          const hay = `${m.id} ${m.name} ${m.description}`.toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      });

      // Pin favourites to top.
      items.sort((a, b) => {
        const af = favoriteIds.has(a.id) ? 0 : 1;
        const bf = favoriteIds.has(b.id) ? 0 : 1;
        if (af !== bf) return af - bf;
        return 0;
      });

      if (!items.length) {
        listEl.innerHTML = '<div class="falai-list-empty">No matches.</div>';
        return;
      }

      listEl.innerHTML = items.map((m) => `
        <button class="falai-list-row ${selectedId === m.id ? 'active' : ''}" data-id="${escapeAttr(m.id)}">
          <div class="falai-list-row-main">
            <div class="falai-list-row-name">${escapeHtml(m.name)}</div>
            <div class="falai-list-row-meta">
              <span class="falai-list-row-cat">${escapeHtml(m.category)}</span>
              <span class="falai-list-row-spacer"></span>
              ${formatCost(m.cost) ? `<span class="falai-list-row-cost">${escapeHtml(formatCost(m.cost))}</span>` : ''}
              ${favoriteIds.has(m.id) ? '<i class="fas fa-heart falai-list-row-fav"></i>' : ''}
            </div>
          </div>
        </button>
      `).join('');

      listEl.querySelectorAll('.falai-list-row').forEach((row) => {
        row.addEventListener('click', () => selectModel(row.dataset.id));
      });
    }

    function renderFeatured() {
      // First three "edit" models = featured.
      const featured = CATALOG.filter((m) => m.category === 'edit').slice(0, 3);
      featuredGrid.innerHTML = featured.map((m) => `
        <button class="falai-featured-card" data-id="${escapeAttr(m.id)}">
          <div class="falai-featured-name">${escapeHtml(m.name)}</div>
          <div class="falai-featured-cat">${escapeHtml(m.category)}</div>
        </button>
      `).join('');
      featuredGrid.querySelectorAll('.falai-featured-card').forEach((c) => {
        c.addEventListener('click', () => selectModel(c.dataset.id));
      });
    }

    function selectModel(id) {
      const model = findModel(id);
      if (!model) return;
      selectedId = id;
      listEl.querySelectorAll('.falai-list-row').forEach((r) => r.classList.toggle('active', r.dataset.id === id));
      renderDetail(model);
    }

    let currentForm = null;
    let currentAborter = null;

    function renderDetail(model) {
      // Tear down previous form's drag-target listeners by replacing the node.
      detailEl.innerHTML = '';

      const head = document.createElement('div');
      head.className = 'falai-detail-head';
      head.innerHTML = `
        <div class="falai-detail-titlerow">
          <div>
            <div class="falai-detail-title">${escapeHtml(model.name)}</div>
            <div class="falai-detail-cat">
              ${escapeHtml(model.category)} · <code>${escapeHtml(model.endpoint || model.id)}</code>
              ${formatCost(model.cost) ? ` · <span class="falai-detail-cost">${escapeHtml(formatCost(model.cost))} / image</span>` : ''}
            </div>
          </div>
          <div class="falai-detail-actions">
            <button class="falai-icon-btn" data-act="fav" title="Toggle favorite"><i class="${favoriteIds.has(model.id) ? 'fas' : 'far'} fa-heart"></i></button>
            <a class="falai-icon-btn" href="https://fal.ai/models/${encodeURI(model.endpoint || model.id)}" target="_blank" rel="noopener" title="Open on fal.ai"><i class="fas fa-arrow-up-right-from-square"></i></a>
          </div>
        </div>
        <div class="falai-detail-desc">${escapeHtml(model.description || '')}</div>
      `;
      detailEl.appendChild(head);

      head.querySelector('[data-act="fav"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(model);
      });

      const form = renderForm({ model, ctx });
      currentForm = form;
      detailEl.appendChild(form.el);

      const actions = document.createElement('div');
      actions.className = 'plugin-section plugin-actions';
      actions.innerHTML = `
        <button class="export-go" data-act="run"><i class="fas fa-bolt"></i> Generate</button>
        <button class="settings-clear" data-act="cancel" hidden>Cancel</button>
      `;
      detailEl.appendChild(actions);

      // Progress bar — hidden until a job is in-flight.
      const progressBar = document.createElement('div');
      progressBar.className = 'falai-progress-bar';
      progressBar.hidden = true;
      progressBar.innerHTML = `<div class="falai-progress-track"><div class="falai-progress-fill"></div></div>`;
      detailEl.appendChild(progressBar);

      const status = document.createElement('div');
      status.className = 'plugin-section plugin-status';
      status.hidden = true;
      detailEl.appendChild(status);

      const cta = document.createElement('div');
      cta.className = 'plugin-section plugin-config-cta';
      cta.hidden = isConfigured();
      cta.innerHTML = `
        <div class="plugin-config-cta-text">fal.ai API key missing.</div>
        <button class="settings-apply" data-act="open-settings">Configure in Settings</button>
      `;
      cta.querySelector('[data-act="open-settings"]').addEventListener('click', () => openSettings('apikeys'));
      detailEl.appendChild(cta);

      const recent = document.createElement('div');
      recent.className = 'plugin-section falai-recent';
      detailEl.appendChild(recent);
      renderRecent(model.id, recent);

      const runBtn = actions.querySelector('[data-act="run"]');
      const cancelBtn = actions.querySelector('[data-act="cancel"]');

      function setStatus(msg, kind = 'info') {
        if (!msg) { status.hidden = true; status.textContent = ''; return; }
        status.hidden = false;
        status.textContent = msg;
        status.dataset.kind = kind;
      }

      cancelBtn.addEventListener('click', () => currentAborter?.abort());

      function setRunning(running) {
        runBtn.disabled = running;
        cancelBtn.hidden = !running;
        progressBar.hidden = !running;
        if (running) {
          runBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Generating…';
        } else {
          runBtn.innerHTML = '<i class="fas fa-bolt"></i> Generate';
        }
      }

      runBtn.addEventListener('click', async () => {
        cta.hidden = isConfigured();
        if (!isConfigured()) { openSettings('apikeys'); return; }

        const missing = form.getRequiredMissing();
        if (missing.length) { setStatus(`Missing: ${missing.join(', ')}`, 'warn'); return; }

        setRunning(true);
        currentAborter = new AbortController();
        try {
          setStatus('Preparing input…');
          const input = await form.getValues();
          setStatus('Submitting…');
          const finalInput = typeof model.prepareInput === 'function' ? model.prepareInput(input) : input;
          // prepareInput may return __endpoint to override the model endpoint
          // (e.g. switching from txt2img to img2img based on whether an image was provided).
          const endpointOverride = finalInput.__endpoint;
          if (endpointOverride) delete finalInput.__endpoint;
          const result = await runModel({
            modelId: endpointOverride || model.endpoint || model.id,
            input: finalInput,
            signal: currentAborter.signal,
            onQueueUpdate: (update) => {
              const pos = update.queue_position;
              const s = update.status === 'IN_QUEUE'
                ? `Queued${pos != null ? ` · ${pos} ahead` : ''}…`
                : update.status === 'IN_PROGRESS' ? 'Generating…'
                : (update.status?.toLowerCase() || 'Working') + '…';
              setStatus(s);
            },
          });

          const urls = extractImageUrls(result, model.outputPath || 'images[].url');
          if (!urls.length) throw new Error('No images returned');

          const promptSnippet = (input.prompt || '').slice(0, 28);
          for (let i = 0; i < urls.length; i++) {
            const name = `${model.name}${promptSnippet ? ` · ${promptSnippet}` : ''}${urls.length > 1 ? ` ${i + 1}` : ''}`;
            await ctx.importImage(urls[i], name);
          }
          pushRecent(model.id, urls);
          renderRecent(model.id, recent);
          setStatus(`Done — ${urls.length} layer${urls.length > 1 ? 's' : ''} added.`, 'ok');
          refreshBalance();
        } catch (err) {
          if (err.name === 'AbortError') {
            setStatus('Cancelled.', 'warn');
          } else if (err instanceof FalConfigError) {
            cta.hidden = false;
            setStatus(err.message, 'warn');
          } else {
            console.error('[fal.ai]', err);
            setStatus(`Failed: ${err.message || err}`, 'error');
          }
        } finally {
          setRunning(false);
          currentAborter = null;
        }
      });
    }

    async function toggleFavorite(model) {
      const existing = await isFavorited(PLUGIN_ID, (rec) => rec.payload?.modelId === model.id);
      if (existing) {
        await removeFavorite(existing.id);
        ctx.notify(`Removed ${model.name} from favorites`);
      } else {
        await addFavorite({ pluginId: PLUGIN_ID, payload: { modelId: model.id } });
        ctx.notify(`Saved ${model.name} to favorites`);
      }
      await refreshFavorites();
      // Re-render only the bits that show heart state.
      renderList();
      const heartIcon = container.querySelector('.falai-detail-actions [data-act="fav"] i');
      if (heartIcon) heartIcon.className = `${favoriteIds.has(model.id) ? 'fas' : 'far'} fa-heart`;
    }

    function renderRecent(modelId, host) {
      const urls = readRecent(modelId);
      if (!urls.length) {
        host.innerHTML = '';
        return;
      }
      host.innerHTML = `
        <div class="settings-label">Recent</div>
        <div class="falai-recent-strip">
          ${urls.map((u) => `<button class="falai-recent-thumb" data-url="${escapeAttr(u)}" title="Re-import"><img src="${escapeAttr(u)}" alt="" /></button>`).join('')}
        </div>
      `;
      host.querySelectorAll('.falai-recent-thumb').forEach((b) => {
        b.addEventListener('click', async () => {
          await ctx.importImage(b.dataset.url, `${findModel(modelId)?.name || 'fal.ai'} (recent)`);
        });
      });
    }
  },
};

// ---------- Recent strip — small localStorage cache, per model ----------
const RECENT_MAX = 8;
function readRecent(modelId) {
  try {
    const raw = localStorage.getItem(RECENT_KEY_PREFIX + modelId);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function pushRecent(modelId, urls) {
  const existing = readRecent(modelId);
  const next = [...urls, ...existing].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY_PREFIX + modelId, JSON.stringify(next)); } catch {}
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
