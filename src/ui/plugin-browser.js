// Plugin Browser — categorised modal for discovering, configuring, and pinning
// panel plugins. Replaces the earlier flat plugin-manager-popup.js.
//
// Layout: 760×580 modal (matches settings modal). Left sidebar holds category
// filters + a pinned-list summary. Content pane shows a hero strip (driven by
// featured.json), a search bar, and per-category grids. Search collapses the
// grids to a single flat result set.
//
// Inline API key flow: clicking the "Needs key" pill on a card slides down a
// key panel directly under the card. Saving the key flips the pill to "Ready"
// and collapses the panel.

import { listPlugins } from '../plugins/registry.js';
import { getPinned, pin, unpin, isPinned } from './sidebar-plugins.js';
import { openPluginWindow } from './plugin-host.js';
import { getSettings, setSettings, apiKeyRowHTML, escapeAttr } from './settings-popup.js';
import featuredConfig from '../plugins/featured.json';

// Plugin id → category mapping. Manifest `category` wins if present.
const CATEGORY_MAP = {
  falai: 'generative',
  unsplash: 'stock', pexels: 'stock', openverse: 'stock',
  met: 'museums', vam: 'museums', smithsonian: 'museums',
  europeana: 'museums', smk: 'museums', cleveland: 'museums',
  nasa: 'science',
  'gradient-library': 'tools',
};

const CATEGORY_DEFS = [
  { id: 'all',        label: 'All' },
  { id: 'featured',   label: 'Featured' },
  { id: 'generative', label: 'Generative' },
  { id: 'stock',      label: 'Stock photos' },
  { id: 'museums',    label: 'Museums' },
  { id: 'science',    label: 'Science' },
  { id: 'tools',      label: 'Tools' },
];

// Plugin id → settings field for inline key flow.
const KEY_FIELD_BY_PLUGIN = {
  unsplash:   { setting: 'unsplashAccessKey', label: 'Unsplash · Access Key',   signupUrl: 'unsplash.com/oauth/applications', hint: 'Use the Access Key — not Application ID or Secret.' },
  pexels:     { setting: 'pexelsApiKey',      label: 'Pexels · API Key',         signupUrl: 'pexels.com/api/',                 hint: '' },
  falai:      { setting: 'falaiApiKey',       label: 'fal.ai · API Key',         signupUrl: 'fal.ai/dashboard/keys',           hint: 'Format like <code>id:secret</code>. Calls fal directly from your browser.' },
  smithsonian:{ setting: 'smithsonianApiKey', label: 'Smithsonian · API Key',    signupUrl: 'api.data.gov/signup/',            hint: 'Sign up at api.data.gov/signup/ — same key works for Smithsonian, NASA, NPS.' },
  europeana:  { setting: 'europeanaApiKey',   label: 'Europeana · API Key',      signupUrl: 'pro.europeana.eu/get-api',        hint: 'Free instant signup. 50M+ items from 4000+ EU institutions.' },
};

let backdrop = null;

export function openPluginBrowser() {
  if (backdrop) return;

  const plugins = listPlugins({ type: 'panel' });
  const featuredSlots = (featuredConfig?.slots || []).filter(
    (slot) => plugins.some((p) => p.id === slot.pluginId),
  );

  backdrop = document.createElement('div');
  // .pb-backdrop sits ABOVE floating plugin windows (z 1000+) but BELOW the
  // Settings modal (z 9500) — see plugin-browser.css.
  backdrop.className = 'settings-backdrop pb-backdrop';
  backdrop.innerHTML = `
    <div class="settings-modal pb-modal" role="dialog" aria-label="Plugin Browser" aria-modal="true">
      <div class="settings-header">
        <span class="settings-title"><i class="fas fa-puzzle-piece"></i><span class="settings-title-text">Plugins</span></span>
        <button class="settings-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>

      <div class="pb-body">
        <nav class="pb-sidebar" aria-label="Categories">
          ${renderSidebar(plugins, featuredSlots)}
        </nav>
        <div class="pb-content">
          ${renderHero(plugins, featuredSlots)}
          <div class="pb-search-row">
            <i class="fas fa-search pb-search-icon" aria-hidden="true"></i>
            <input type="text" class="pb-search" placeholder="Search plugins…" aria-label="Search plugins" />
          </div>
          <div class="pb-grid-host">
            ${renderSections(plugins)}
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  wireBackdrop(backdrop, plugins, featuredSlots);

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

// ────────────────────────────────────────────────────────────────────────────
// Sidebar
// ────────────────────────────────────────────────────────────────────────────

function renderSidebar(plugins, featuredSlots) {
  const counts = countByCategory(plugins, featuredSlots);
  const cats = CATEGORY_DEFS.filter((c) => {
    if (c.id === 'all') return true;
    if (c.id === 'featured') return featuredSlots.length > 0;
    return counts[c.id] > 0;
  });

  const pinnedIds = getPinned();
  const pinnedPlugins = pinnedIds.map((id) => plugins.find((p) => p.id === id)).filter(Boolean);

  return `
    <div class="pb-cat-list">
      ${cats.map((c) => `
        <button class="pb-cat ${c.id === 'all' ? 'active' : ''}" data-cat="${c.id}" type="button">
          <span class="pb-cat-dot" aria-hidden="true"></span>
          <span class="pb-cat-label">${c.label}</span>
          <span class="pb-cat-count">${c.id === 'all' ? plugins.length : (c.id === 'featured' ? featuredSlots.length : counts[c.id])}</span>
        </button>
      `).join('')}
    </div>
    ${pinnedPlugins.length > 0 ? `
      <div class="pb-sidebar-divider" aria-hidden="true"></div>
      <div class="pb-pinned-block">
        <div class="pb-pinned-head"><i class="fas fa-thumbtack"></i><span>Pinned</span><span class="pb-pinned-count">${pinnedPlugins.length}</span></div>
        <ul class="pb-pinned-list">
          ${pinnedPlugins.map((p) => `<li class="pb-pinned-row" title="${escapeAttr(p.name)}">${escapeHtml(p.name)}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
  `;
}

function countByCategory(plugins) {
  const out = Object.create(null);
  for (const p of plugins) {
    const cat = categoryOf(p);
    out[cat] = (out[cat] || 0) + 1;
  }
  return out;
}

function categoryOf(p) {
  return p.category || CATEGORY_MAP[p.id] || 'tools';
}

// ────────────────────────────────────────────────────────────────────────────
// Hero strip
// ────────────────────────────────────────────────────────────────────────────

function renderHero(plugins, featuredSlots) {
  if (featuredSlots.length === 0) return '';
  return `
    <div class="pb-hero-strip">
      ${featuredSlots.map((slot) => {
        const p = plugins.find((x) => x.id === slot.pluginId);
        if (!p) return '';
        const accent = slot.accentOverride || p.accent || 'var(--primary)';
        return `
          <article class="pb-hero" data-plugin-id="${p.id}" style="--ctx-accent:${accent}">
            <div class="pb-hero-icon">${pluginIconHTML(p)}</div>
            <div class="pb-hero-meta">
              <div class="pb-hero-eyebrow"><i class="fas fa-sparkles"></i> Featured</div>
              <h3 class="pb-hero-title">${escapeHtml(p.name)}</h3>
              <p class="pb-hero-tagline">${escapeHtml(slot.tagline || p.description || '')}</p>
            </div>
            <button class="pb-hero-cta" data-act="hero-open" type="button">Open <i class="fas fa-arrow-right"></i></button>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────────────────
// Sections + cards
// ────────────────────────────────────────────────────────────────────────────

function renderSections(plugins) {
  // Group by category in display order, skipping empty ones.
  const settings = getSettings();
  const buckets = new Map();
  for (const p of plugins) {
    const cat = categoryOf(p);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push(p);
  }
  const order = ['generative', 'stock', 'museums', 'science', 'tools'];
  return order
    .filter((cat) => buckets.has(cat))
    .map((cat) => {
      const def = CATEGORY_DEFS.find((c) => c.id === cat);
      return `
        <section class="pb-section" data-section="${cat}">
          <h4 class="pb-section-head"><span class="pb-section-dot" aria-hidden="true"></span>${def?.label || cat}</h4>
          <div class="pb-section-grid">
            ${buckets.get(cat).map((p) => renderCard(p, settings)).join('')}
          </div>
        </section>
      `;
    })
    .join('');
}

function renderCard(p, settings) {
  const accent = p.accent || 'var(--primary)';
  const status = pillFor(p, settings);
  const pinned = isPinned(p.id);
  const cat = categoryOf(p);
  const catLabel = CATEGORY_DEFS.find((c) => c.id === cat)?.label || cat;
  return `
    <article class="pb-card" data-plugin-id="${p.id}" data-cat="${cat}" style="--ctx-accent:${accent}">
      <div class="pb-card-row">
        <div class="pb-card-icon">${pluginIconHTML(p)}</div>
        <div class="pb-card-meta">
          <h3 class="pb-card-name">${escapeHtml(p.name)}</h3>
          <p class="pb-card-desc">${escapeHtml(p.description || '')}</p>
        </div>
      </div>
      <div class="pb-card-foot">
        <div class="pb-card-foot-left">
          ${status.html}
          <span class="pb-card-tag" hidden>${escapeHtml(catLabel)}</span>
        </div>
        <div class="pb-card-actions">
          <button class="pb-pin" data-act="pin" aria-pressed="${pinned ? 'true' : 'false'}" title="${pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}" aria-label="${pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}" type="button">
            <i class="fas fa-thumbtack"></i>
          </button>
          <button class="pb-open" data-act="open" type="button">Open</button>
        </div>
      </div>
    </article>
  `;
}

function pillFor(p, settings) {
  if (p.pro) {
    return { kind: 'pro', html: `<span class="pb-pill pb-pill--pro">Add On</span>` };
  }
  let status = null;
  if (typeof p.computeStatus === 'function') {
    try { status = p.computeStatus(settings) || null; } catch { status = null; }
  }
  if (status && status.kind === 'warn' && KEY_FIELD_BY_PLUGIN[p.id]) {
    return { kind: 'needs-key', html: `<button class="pb-pill pb-pill--needs-key" data-act="reveal-key" type="button">Needs key</button>` };
  }
  return { kind: 'ready', html: `<span class="pb-pill pb-pill--ready">Ready</span>` };
}

function renderKeyPanel(p) {
  const cfg = KEY_FIELD_BY_PLUGIN[p.id];
  if (!cfg) return '';
  const value = getSettings()[cfg.setting] || '';
  const inputId = `pbKey-${p.id}`;
  return `
    <div class="pb-keypanel" data-plugin-id="${p.id}">
      ${apiKeyRowHTML(inputId, cfg.label, value, cfg.signupUrl, cfg.hint)}
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────────────────
// Wiring
// ────────────────────────────────────────────────────────────────────────────

function wireBackdrop(root, plugins, featuredSlots) {
  // Close
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target.closest('[data-act=close]')) close();
  });

  const sidebar = root.querySelector('.pb-sidebar');
  const gridHost = root.querySelector('.pb-grid-host');
  const heroStrip = root.querySelector('.pb-hero-strip');
  const searchInput = root.querySelector('.pb-search');

  // Category select
  sidebar.addEventListener('click', (e) => {
    const btn = e.target.closest('.pb-cat');
    if (!btn) return;
    sidebar.querySelectorAll('.pb-cat').forEach((b) => b.classList.toggle('active', b === btn));
    applyFilter(root, plugins, featuredSlots);
  });

  // Search
  searchInput.addEventListener('input', () => applyFilter(root, plugins, featuredSlots));

  // Card / hero clicks (delegated on grid + hero)
  root.addEventListener('click', (e) => {
    const heroOpen = e.target.closest('[data-act=hero-open]');
    if (heroOpen) {
      const id = heroOpen.closest('[data-plugin-id]')?.dataset.pluginId;
      if (id) { openPluginWindow(id); close(); }
      return;
    }
    const card = e.target.closest('.pb-card');
    if (!card) return;
    const id = card.dataset.pluginId;
    const plugin = plugins.find((p) => p.id === id);
    if (!plugin) return;

    if (e.target.closest('[data-act=open]')) {
      openPluginWindow(id);
      close();
      return;
    }
    if (e.target.closest('[data-act=pin]')) {
      togglePin(card, id);
      return;
    }
    if (e.target.closest('[data-act=reveal-key]')) {
      toggleKeyPanel(card, plugin);
      return;
    }
  });

  // Live-bind key panel inputs (delegated input listener on grid host).
  gridHost.addEventListener('input', (e) => {
    const input = e.target.closest('input[id^="pbKey-"]');
    if (!input) return;
    const panel = input.closest('.pb-keypanel');
    const id = panel?.dataset.pluginId;
    const cfg = KEY_FIELD_BY_PLUGIN[id];
    if (!cfg) return;
    const value = input.value.trim();
    setSettings({ [cfg.setting]: value });
    if (value) {
      // Flip pill to Ready, collapse panel.
      const card = root.querySelector(`.pb-card[data-plugin-id="${id}"]`);
      if (card) {
        const pillSlot = card.querySelector('.pb-card-foot-left');
        if (pillSlot) {
          // Replace just the pill (first child).
          const oldPill = pillSlot.querySelector('.pb-pill');
          if (oldPill) {
            oldPill.outerHTML = '<span class="pb-pill pb-pill--ready">Ready</span>';
          }
        }
        // Collapse panel after a short transition.
        panel.classList.add('pb-keypanel--collapsing');
        setTimeout(() => { if (panel.parentNode) panel.parentNode.removeChild(panel); }, 200);
      }
    }
  });
}

function togglePin(card, id) {
  const pinBtn = card.querySelector('.pb-pin');
  const pressed = pinBtn.getAttribute('aria-pressed') === 'true';
  if (pressed) { unpin(id); pinBtn.setAttribute('aria-pressed', 'false'); pinBtn.title = 'Pin to sidebar'; }
  else { pin(id); pinBtn.setAttribute('aria-pressed', 'true'); pinBtn.title = 'Unpin from sidebar'; }
  // Re-render the pinned list block in the sidebar.
  refreshPinnedList();
}

function refreshPinnedList() {
  if (!backdrop) return;
  const sidebar = backdrop.querySelector('.pb-sidebar');
  if (!sidebar) return;
  const plugins = listPlugins({ type: 'panel' });
  const pinnedIds = getPinned();
  const pinnedPlugins = pinnedIds.map((id) => plugins.find((p) => p.id === id)).filter(Boolean);

  // Remove existing pinned block + divider, if any.
  sidebar.querySelector('.pb-sidebar-divider')?.remove();
  sidebar.querySelector('.pb-pinned-block')?.remove();

  if (pinnedPlugins.length === 0) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="pb-sidebar-divider" aria-hidden="true"></div>
    <div class="pb-pinned-block">
      <div class="pb-pinned-head"><i class="fas fa-thumbtack"></i><span>Pinned</span><span class="pb-pinned-count">${pinnedPlugins.length}</span></div>
      <ul class="pb-pinned-list">
        ${pinnedPlugins.map((p) => `<li class="pb-pinned-row" title="${escapeAttr(p.name)}">${escapeHtml(p.name)}</li>`).join('')}
      </ul>
    </div>
  `;
  while (wrap.firstChild) sidebar.appendChild(wrap.firstChild);
}

function toggleKeyPanel(card, plugin) {
  // Find a sibling pb-keypanel directly after the card. Insert if missing.
  const next = card.nextElementSibling;
  if (next && next.classList?.contains('pb-keypanel') && next.dataset.pluginId === plugin.id) {
    next.remove();
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = renderKeyPanel(plugin);
  const panel = tmp.firstElementChild;
  if (!panel) return;
  card.insertAdjacentElement('afterend', panel);
}

function applyFilter(root, plugins, featuredSlots) {
  const sidebar = root.querySelector('.pb-sidebar');
  const activeCat = sidebar.querySelector('.pb-cat.active')?.dataset.cat || 'all';
  const search = (root.querySelector('.pb-search')?.value || '').trim().toLowerCase();
  const heroStrip = root.querySelector('.pb-hero-strip');

  // Hero visibility: only when (all OR featured) AND no search.
  if (heroStrip) {
    const showHero = !search && (activeCat === 'all' || activeCat === 'featured');
    heroStrip.hidden = !showHero;
  }

  const cards = root.querySelectorAll('.pb-card');
  const sections = root.querySelectorAll('.pb-section');

  // Featured pluginIds set
  const featuredIds = new Set(featuredSlots.map((s) => s.pluginId));

  if (search) {
    // Flat search mode — hide section heads that have no visible cards, show category tags.
    const terms = search.split(/\s+/).filter(Boolean);
    cards.forEach((card) => {
      const id = card.dataset.pluginId;
      const p = plugins.find((x) => x.id === id);
      const haystack = [
        p.name, p.description || '',
        ...(Array.isArray(p.tags) ? p.tags : []),
        CATEGORY_DEFS.find((c) => c.id === categoryOf(p))?.label || '',
      ].join(' ').toLowerCase();
      const match = terms.every((t) => haystack.includes(t));
      const catOk = activeCat === 'all' || activeCat === 'featured'
        ? (activeCat === 'featured' ? featuredIds.has(id) : true)
        : card.dataset.cat === activeCat;
      const visible = match && catOk;
      card.hidden = !visible;
      const tag = card.querySelector('.pb-card-tag');
      if (tag) tag.hidden = !visible;
    });
    sections.forEach((sec) => {
      const anyVisible = sec.querySelector('.pb-card:not([hidden])');
      sec.hidden = !anyVisible;
    });
  } else {
    // Category-only mode.
    cards.forEach((card) => {
      const id = card.dataset.pluginId;
      let visible;
      if (activeCat === 'all') visible = true;
      else if (activeCat === 'featured') visible = featuredIds.has(id);
      else visible = card.dataset.cat === activeCat;
      card.hidden = !visible;
      const tag = card.querySelector('.pb-card-tag');
      if (tag) tag.hidden = true;
    });
    sections.forEach((sec) => {
      const anyVisible = sec.querySelector('.pb-card:not([hidden])');
      sec.hidden = !anyVisible;
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function pluginIconHTML(p) {
  if (p.iconHTML) return p.iconHTML;
  if (p.icon && p.icon.startsWith('fa-')) return `<i class="fas ${p.icon}"></i>`;
  if (p.icon) return `<i class="fas fa-${p.icon}"></i>`;
  return '<i class="fas fa-puzzle-piece"></i>';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
