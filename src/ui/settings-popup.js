// Settings popup — fixed-size (760×580) modal with vertical sidebar tabs.
// Six logical groups: Appearance · Workflow · Canvas · Plugins · Shortcuts · About.
// Persists user-facing prefs to localStorage 'slammer:settings'.

import { createKnob } from '../plugins/shared/knob.js';
import { createNumericInput } from '../plugins/shared/numeric-input.js';

const STORE_KEY = 'slammer:settings';
const DEFAULTS = {
  // Appearance
  accent: '#8aff8c',
  customLayerColors: true,
  // Workflow
  keepEffectsOpen: false,
  textToPathReplace: true,
  marqueeMode: 'touch',          // 'touch' | 'contain'
  clickThroughGroups: false,
  // Canvas & Export
  frameDimOpacity: 0.80,
  autosaveMs: 800,
  // Plugins (per-provider keys; users bring their own — see Settings → Plugins).
  unsplashAccessKey: '',
  pexelsApiKey: '',
  falaiApiKey: '',
};

// Curated accent palette — clicking a swatch sets accent without opening the
// native colour picker. Designed to span the visual gamut without harming
// readability against --background and --surface.
const ACCENT_PRESETS = [
  '#8aff8c',  // slammer green (default)
  '#7fb3ff',  // sky
  '#c39bff',  // lavender
  '#ff7fb3',  // bubblegum
  '#ffb070',  // amber
  '#7fffea',  // cyan
  '#ff5b5b',  // siren red
  '#f0f0f0',  // mono
];

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'workflow',   label: 'Workflow',   icon: 'sliders' },
  { id: 'canvas',     label: 'Canvas',     icon: 'vector-square' },
  { id: 'plugins',    label: 'Plugins',    icon: 'puzzle-piece' },
  { id: 'shortcuts',  label: 'Shortcuts',  icon: 'keyboard' },
  { id: 'about',      label: 'About',      icon: 'circle-info' },
];

const VALID_TAB_IDS = new Set(TABS.map((t) => t.id));

const listeners = new Set();

export function getSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(STORE_KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn(next));
  return next;
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyAccent(hex) {
  document.documentElement.style.setProperty('--primary', hex);
  document.documentElement.style.setProperty('--primary-hover', darken(hex, 0.18));
  const { r, g, b } = hexToRgb(hex);
  document.documentElement.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
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

let _initialTab = 'appearance';

// Backwards-compat: callers may still pass legacy tab names from before the
// redesign ('general', 'apikeys', 'info'). Map them to the new structure.
const LEGACY_TAB_MAP = {
  general: 'appearance',
  apikeys: 'plugins',
  info:    'about',
};

export function openSettings(tab = 'appearance') {
  _initialTab = LEGACY_TAB_MAP[tab] || tab;
  document.getElementById('btnSettings')?.click();
}

export function initSettingsPopup({ button, version }) {
  let backdrop = null;

  applyAccent(getSettings().accent);

  button.addEventListener('click', open);

  function open() {
    if (backdrop) return;
    const startTab = VALID_TAB_IDS.has(_initialTab) ? _initialTab : 'appearance';
    _initialTab = 'appearance';

    backdrop = document.createElement('div');
    backdrop.className = 'settings-backdrop';
    backdrop.innerHTML = `
      <div class="settings-modal settings-modal--sidebar" role="dialog" aria-label="Settings">
        <div class="settings-header">
          <span class="settings-title"><i class="fas fa-gear"></i><span class="settings-title-text">Settings</span></span>
          <button class="settings-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>

        <div class="settings-body">
          <nav class="settings-sidebar" aria-label="Settings sections">
            ${TABS.map((t) => `
              <button class="settings-sidetab" data-tab="${t.id}" type="button">
                <span class="settings-sidetab-dot" aria-hidden="true"></span>
                <i class="fas fa-${t.icon} settings-sidetab-icon"></i>
                <span class="settings-sidetab-label">${t.label}</span>
              </button>
            `).join('')}
            <div class="settings-sidebar-spacer"></div>
            <div class="settings-sidebar-stamp">v${version} · slammer.app</div>
          </nav>

          <div class="settings-content">
            ${renderAppearance()}
            ${renderWorkflow()}
            ${renderCanvas()}
            ${renderPlugins()}
            ${renderShortcuts()}
            ${renderAbout(version)}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
    });

    // ---------- Tabs ----------
    const tabs = backdrop.querySelectorAll('.settings-sidetab');
    const panels = backdrop.querySelectorAll('.settings-tab-panel');
    function selectTab(name) {
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      panels.forEach((p) => p.toggleAttribute('hidden', p.dataset.tab !== name));
    }
    tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
    selectTab(startTab);

    wireAppearance(backdrop);
    wireWorkflow(backdrop);
    wireCanvas(backdrop);
    wirePlugins(backdrop);
    wireAbout(backdrop);

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
}

// ────────────────────────────────────────────────────────────────────────────
// Tab renderers — return raw HTML strings; wire-functions attach listeners.
// Each panel has a consistent shape: one or more <section.settings-group>
// blocks with a small uppercase heading + a stack of rows.
// ────────────────────────────────────────────────────────────────────────────

function renderAppearance() {
  const s = getSettings();
  const swatches = ACCENT_PRESETS.map((hex) => `
    <button class="settings-swatch ${hex.toLowerCase() === s.accent.toLowerCase() ? 'active' : ''}"
            type="button" data-hex="${hex}" style="--swatch: ${hex}" aria-label="Accent ${hex}"></button>
  `).join('');
  return `
    <section class="settings-tab-panel" data-tab="appearance" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Appearance</span>
        <h2 class="settings-panel-title">Look &amp; feel</h2>
        <p class="settings-panel-desc">Pick the accent that tints selection handles, active states, and the brand chrome.</p>
      </header>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Accent</div>
        <div class="settings-row settings-row--stack">
          <div class="settings-swatches">${swatches}</div>
          <div class="settings-row settings-row--accent-custom">
            <label class="settings-rowlabel" for="setAccent">Custom hex</label>
            <div class="settings-control settings-control--accent">
              <input type="color" id="setAccent" value="${s.accent}" />
              <code class="settings-readout" id="setAccentReadout">${s.accent.toUpperCase()}</code>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Layer chrome</div>
        ${toggleRowHTML('setCustomLayerColors', 'Custom layer colours', s.customLayerColors,
          'Each layer gets its own pastel accent for selection handles and effect-card tint.')}
      </div>
    </section>
  `;
}

function wireAppearance(root) {
  const accentInput = root.querySelector('#setAccent');
  const accentReadout = root.querySelector('#setAccentReadout');
  const swatches = root.querySelectorAll('.settings-swatch');
  function setAccent(hex) {
    const h = hex.toLowerCase();
    accentInput.value = h;
    accentReadout.textContent = h.toUpperCase();
    applyAccent(h);
    setSettings({ accent: h });
    swatches.forEach((s) => s.classList.toggle('active', s.dataset.hex.toLowerCase() === h));
  }
  accentInput.addEventListener('input', (e) => setAccent(e.target.value));
  swatches.forEach((s) => s.addEventListener('click', () => setAccent(s.dataset.hex)));

  bindToggle(root, 'setCustomLayerColors', 'customLayerColors');
}

function renderWorkflow() {
  const s = getSettings();
  return `
    <section class="settings-tab-panel" data-tab="workflow" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Workflow</span>
        <h2 class="settings-panel-title">How the editor responds</h2>
        <p class="settings-panel-desc">Selection, expansion, and conversion behaviours that tune the editor to your workflow.</p>
      </header>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Effects panel</div>
        ${toggleRowHTML('setKeepEffectsOpen', 'Keep all effects open', s.keepEffectsOpen,
          'When ON, every filter card stays expanded so all sliders are visible at once.')}
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Selection</div>
        <div class="settings-row">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setMarqueeMode">Marquee selection</label>
            <span class="settings-rowhint">Touch — any overlap selects. Contain — bbox must lie fully inside the marquee.</span>
          </div>
          <div class="settings-control">
            <div class="settings-segmented" data-key="marqueeMode" id="setMarqueeMode">
              <button type="button" class="settings-seg ${s.marqueeMode !== 'contain' ? 'active' : ''}" data-v="touch">Touch</button>
              <button type="button" class="settings-seg ${s.marqueeMode === 'contain' ? 'active' : ''}" data-v="contain">Contain</button>
            </div>
          </div>
        </div>
        ${toggleRowHTML('setClickThroughGroups', 'Click-through groups', s.clickThroughGroups,
          'ON: clicking a child of a group on canvas selects the leaf. OFF: selects the parent group (Figma-style).')}
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Vector tools</div>
        ${toggleRowHTML('setTextToPathReplace', 'Convert to Path replaces text', s.textToPathReplace,
          'When ON, Convert to Path removes the original text layer (Affinity-style). Shift-click the convert button to invert for one conversion.')}
      </div>
    </section>
  `;
}

function wireWorkflow(root) {
  bindToggle(root, 'setKeepEffectsOpen', 'keepEffectsOpen');
  bindToggle(root, 'setTextToPathReplace', 'textToPathReplace');
  bindToggle(root, 'setClickThroughGroups', 'clickThroughGroups');
  // Segmented control for marquee mode
  const seg = root.querySelector('#setMarqueeMode');
  if (seg) {
    seg.querySelectorAll('.settings-seg').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.v;
        seg.querySelectorAll('.settings-seg').forEach((x) => x.classList.toggle('active', x === b));
        setSettings({ marqueeMode: v === 'contain' ? 'contain' : 'touch' });
      });
    });
  }
}

function renderCanvas() {
  const s = getSettings();
  const dimPct = Math.round((s.frameDimOpacity ?? 0.80) * 100);
  return `
    <section class="settings-tab-panel" data-tab="canvas" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Canvas</span>
        <h2 class="settings-panel-title">Stage &amp; persistence</h2>
        <p class="settings-panel-desc">Visual chrome around the canvas + how often the document autosaves.</p>
      </header>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Export frame</div>
        <div class="settings-row settings-row--stack">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setFrameDim">Frame dim</label>
            <span class="settings-rowhint">Darken the area outside the export region so the frame stands out.</span>
          </div>
          <div class="settings-control settings-control--full">
            <input type="range" id="setFrameDim" min="0" max="100" step="1" value="${dimPct}" />
            <code class="settings-readout settings-readout--inline" id="setFrameDimReadout">${dimPct}%</code>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Persistence</div>
        <div class="settings-row settings-row--stack">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel">Autosave delay</label>
            <span class="settings-rowhint">How long after your last edit the document is committed to local storage.</span>
          </div>
          <div class="settings-control settings-control--knob" id="setAutosaveControl"></div>
        </div>
      </div>

      <div class="settings-group settings-group--placeholder">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Coming soon</div>
        <ul class="settings-roadmap-list">
          <li><span class="settings-roadmap-key">Snap defaults</span><span class="settings-roadmap-desc">Layer-edge + center alignment, dashed accent guides — Phase 21.</span></li>
          <li><span class="settings-roadmap-key">Ruler defaults</span><span class="settings-roadmap-desc">Top + left rulers, drag to create guides — Phase 21.</span></li>
          <li><span class="settings-roadmap-key">Fit on Open</span><span class="settings-roadmap-desc">Auto-fit when opening someone else's project — Phase 19/C wiring in progress.</span></li>
          <li><span class="settings-roadmap-key">Versioning</span><span class="settings-roadmap-desc">Manual save-as-version + autosave version chain — Phase 24.</span></li>
        </ul>
      </div>
    </section>
  `;
}

function wireCanvas(root) {
  const s = getSettings();
  // Frame dim slider
  const frameDimInput = root.querySelector('#setFrameDim');
  const frameDimReadout = root.querySelector('#setFrameDimReadout');
  frameDimInput?.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10);
    frameDimReadout.textContent = `${pct}%`;
    setSettings({ frameDimOpacity: pct / 100 });
  });
  // Autosave knob + numeric (reused from prior layout)
  const autosaveControl = root.querySelector('#setAutosaveControl');
  if (autosaveControl) {
    const autosaveKnob = createKnob({
      size: 32,
      min: 200, max: 3000, step: 100,
      value: s.autosaveMs,
      defaultValue: 800,
      onChange: (v) => {
        autosaveNum.setValue(v);
        setSettings({ autosaveMs: v });
      },
    });
    const autosaveNum = createNumericInput({
      min: 200, max: 3000, step: 100,
      value: s.autosaveMs,
      suffix: 'ms',
      onChange: (v) => {
        autosaveKnob.setValue(v);
        setSettings({ autosaveMs: v });
      },
    });
    autosaveControl.appendChild(autosaveKnob);
    autosaveControl.appendChild(autosaveNum);
  }
}

function renderPlugins() {
  const s = getSettings();
  return `
    <section class="settings-tab-panel" data-tab="plugins" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Plugins</span>
        <h2 class="settings-panel-title">Bring your own keys</h2>
        <p class="settings-panel-desc">Each provider's API key lives only in this browser's localStorage. slammer.app never proxies them.</p>
      </header>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Image search</div>
        ${apiKeyRowHTML('setUnsplashKey', 'Unsplash · Access Key', s.unsplashAccessKey,
          'unsplash.com/oauth/applications', 'Use the Access Key — not Application ID or Secret.')}
        ${apiKeyRowHTML('setPexelsKey', 'Pexels · API Key', s.pexelsApiKey,
          'pexels.com/api/', '')}
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Generative</div>
        ${apiKeyRowHTML('setFalaiKey', 'fal.ai · API Key', s.falaiApiKey,
          'fal.ai/dashboard/keys', 'Format like <code>id:secret</code>. Calls the fal client directly from your browser.')}
      </div>

      <div class="settings-group settings-group--placeholder">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Coming soon</div>
        <ul class="settings-roadmap-list">
          <li><span class="settings-roadmap-key">Openverse</span><span class="settings-roadmap-desc">Public-domain images, anonymous tier currently rate-limited — Phase 26.</span></li>
          <li><span class="settings-roadmap-key">Rijksmuseum</span><span class="settings-roadmap-desc">Free key from data.rijksmuseum.nl — Phase 26.</span></li>
          <li><span class="settings-roadmap-key">Plugin manager</span><span class="settings-roadmap-desc">Pinning, permissions, plugin update channel — Feature F1.</span></li>
        </ul>
      </div>
    </section>
  `;
}

function wirePlugins(root) {
  bindKeyInput(root.querySelector('#setUnsplashKey'), 'unsplashAccessKey');
  bindKeyInput(root.querySelector('#setPexelsKey'), 'pexelsApiKey');
  bindKeyInput(root.querySelector('#setFalaiKey'), 'falaiApiKey');
}

function renderShortcuts() {
  return `
    <section class="settings-tab-panel" data-tab="shortcuts" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Shortcuts</span>
        <h2 class="settings-panel-title">Keyboard reference</h2>
        <p class="settings-panel-desc">Every binding the editor responds to. Customisation arrives later.</p>
      </header>

      <div class="settings-group settings-group--shortcuts">
        <table class="settings-shortcuts">
          <colgroup><col class="settings-shortcuts-keys"/><col/></colgroup>
          <tbody>
            ${shortcutSection('File', [
              ['Ctrl+N', 'New blank project'],
              ['Ctrl+O', 'Open project popup'],
              ['Ctrl+S', 'Save project'],
              ['Ctrl+E', 'Export PNG / JPEG / WebP popup'],
              ['Shift+click Export', 'Export <code>.slammerproj</code> directly'],
            ])}
            ${shortcutSection('Edit', [
              ['Ctrl+Z', 'Undo'],
              ['Ctrl+Shift+Z', 'Redo'],
              ['Ctrl+C / V / X', 'Copy / Paste / Cut active layer'],
              ['Ctrl+D', 'Duplicate active layer (+20 / +20 px)'],
              ['Ctrl+A', 'Select all layers'],
              ['Ctrl+G', 'Group selection'],
              ['Ctrl+Shift+G', 'Ungroup'],
              ['Ctrl+L', 'Lock / unlock active layer'],
              ['Delete / Backspace', 'Delete selection'],
              ['Esc', 'Deselect / cancel current gesture'],
            ])}
            ${shortcutSection('Move &amp; transform', [
              ['← → ↑ ↓', 'Nudge selection 1 px'],
              ['Shift+arrow', 'Nudge selection 10 px'],
              ['Drag rotate handle', 'Free rotate (live degree pill follows pointer)'],
              ['Shift+rotate', 'Snap rotation to nearest 5°'],
              ['Ctrl+Shift+drag handle (text)', 'Resize text-box width (auto-wrap)'],
            ])}
            ${shortcutSection('Tools', [
              ['V', 'Select tool'],
              ['A', 'Direct Select (anchor edit)'],
              ['P', 'Pen tool'],
              ['B', 'Pencil tool'],
              ['R', 'Rectangle (cycle shape primitives)'],
              ['T', 'Add text layer'],
              ['I', 'Add image layer'],
            ])}
            ${shortcutSection('Canvas', [
              ['Mouse-wheel', 'Zoom in / out (around pointer)'],
              ['Middle-mouse drag', 'Pan'],
              ['Drag a layer card to canvas', 'Re-add layer (or to plugin: send for processing)'],
            ])}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAbout(version) {
  return `
    <section class="settings-tab-panel" data-tab="about" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">About</span>
        <h2 class="settings-panel-title">slammer.app</h2>
        <p class="settings-panel-desc">Browser-native multi-layer editor for slamming, glitching &amp; dithering. No backend, no telemetry — everything runs locally in this tab.</p>
      </header>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Build</div>
        <div class="settings-row">
          <span class="settings-rowlabel">Version</span>
          <code class="settings-readout">v${version}</code>
        </div>
        <div class="settings-row">
          <span class="settings-rowlabel">Distribution</span>
          <code class="settings-readout">slammer.app</code>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Links</div>
        <div class="settings-actions-row">
          <a class="settings-action-btn settings-action-btn--primary" href="https://buymeacoffee.com/slammer.app" target="_blank" rel="noopener" aria-label="Buy a coffee">
            <i class="fas fa-mug-hot"></i><span>Buy a coffee</span>
          </a>
          <a class="settings-action-btn" href="https://github.com/bitm4ncer/slammer.app" target="_blank" rel="noopener" aria-label="GitHub">
            <i class="fab fa-github"></i><span>GitHub</span>
          </a>
        </div>
      </div>

      <div class="settings-group settings-group--danger">
        <div class="settings-group-head settings-group-head--danger"><span class="settings-group-tick settings-group-tick--danger"></span>Reset</div>
        <div class="settings-row">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel">Reset all settings</label>
            <span class="settings-rowhint">Restores defaults for every option above. Does not touch your layers, projects, or plugin keys.</span>
          </div>
          <button class="settings-danger-btn" id="setResetAll" type="button">Reset</button>
        </div>
      </div>
    </section>
  `;
}

function wireAbout(root) {
  const reset = root.querySelector('#setResetAll');
  reset?.addEventListener('click', () => {
    if (!window.confirm('Reset all settings to defaults? This will not affect your layers or projects.')) return;
    // Preserve API keys — those aren't "settings" in the user's mental model.
    const cur = getSettings();
    const preserved = {
      unsplashAccessKey: cur.unsplashAccessKey,
      pexelsApiKey: cur.pexelsApiKey,
      falaiApiKey: cur.falaiApiKey,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...DEFAULTS, ...preserved }));
    applyAccent(DEFAULTS.accent);
    listeners.forEach((fn) => fn(getSettings()));
    // Re-open to reflect new state.
    document.querySelector('.settings-close')?.click();
    setTimeout(() => document.getElementById('btnSettings')?.click(), 50);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Markup helpers
// ────────────────────────────────────────────────────────────────────────────

function toggleRowHTML(id, label, checked, hint) {
  return `
    <div class="settings-row">
      <div class="settings-rowlabelblock">
        <label class="settings-rowlabel" for="${id}">${label}</label>
        ${hint ? `<span class="settings-rowhint">${hint}</span>` : ''}
      </div>
      <label class="settings-toggle" for="${id}">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
        <span class="settings-toggle-track"><span class="settings-toggle-thumb"></span></span>
      </label>
    </div>
  `;
}

function apiKeyRowHTML(id, label, value, helpUrl, hint) {
  return `
    <div class="settings-row settings-row--stack">
      <div class="settings-rowlabelblock">
        <label class="settings-rowlabel" for="${id}">${label}
          <a class="settings-rowhelp" href="https://${helpUrl}" target="_blank" rel="noopener">get one</a>
        </label>
        ${hint ? `<span class="settings-rowhint">${hint}</span>` : ''}
      </div>
      <input type="password" id="${id}" class="settings-text-input" autocomplete="off"
             placeholder="paste key…" value="${escapeAttr(value)}" />
    </div>
  `;
}

function shortcutSection(label, rows) {
  return `
    <tr class="settings-shortcuts-head"><th colspan="2">${label}</th></tr>
    ${rows.map(([keys, desc]) => `
      <tr>
        <td>${keys.split(' / ').map((k) => k.split('+').map((p) => p.includes('drag') || p.includes('click') || p.includes('mouse') || p.includes('wheel') ? p : `<kbd>${p}</kbd>`).join('+')).join(' / ')}</td>
        <td>${desc}</td>
      </tr>
    `).join('')}
  `;
}

function bindToggle(root, id, settingKey) {
  root.querySelector('#' + id)?.addEventListener('change', (e) => {
    setSettings({ [settingKey]: e.target.checked });
  });
}

function bindKeyInput(el, settingKey) {
  if (!el) return;
  let timer = null;
  el.addEventListener('input', (e) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      setSettings({ [settingKey]: e.target.value.trim() });
    }, 300);
  });
}

function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
