// Settings popup — fixed-size (760×580) modal with vertical sidebar tabs.
// Six logical groups: Appearance · Workflow · Canvas · Plugins · Shortcuts · About.
// Persists user-facing prefs to localStorage 'slammer:settings'.

import { createKnob } from '../plugins/shared/knob.js';
import { createNumericInput } from '../plugins/shared/numeric-input.js';
import {
  getBindings, setOverride, clearOverride, resetAllOverrides, unbindBinding,
  findCollision, onBindingsChange, pauseRouter, resumeRouter,
} from './shortcut-manager.js';
import { prettyCombo, captureCombo } from './shortcuts/helpers.js';
import { showConfirm } from './confirm-prompt.js';

const STORE_KEY = 'slammer:settings';
const DEFAULTS = {
  // Appearance
  accent: '#8aff8c',
  customLayerColors: true,
  // Phase 30 — UI theme. Values map 1:1 to the <html data-theme> attribute
  // and to the override blocks in src/style/themes/<name>.css.
  theme: 'dark',                // 'dark' | 'anthracite' | 'light'
  // Workflow
  keepEffectsOpen: false,
  textToPathReplace: true,
  marqueeMode: 'touch',          // 'touch' | 'contain'
  clickThroughGroups: false,
  // Color hub appearance — 'wheel' shows the radial quick-select around
  // the dial (default); 'dot' collapses it to a small swatch in the
  // footer-left that opens the same colour menu.
  colorHubMode: 'wheel',         // 'wheel' | 'dot'
  // Typography
  liveFontPreview: true,         // G3 — hover a font card → canvas updates live
  // Canvas & Export
  frameDimOpacity: 0.80,
  autosaveMs: 800,
  // Plugins (per-provider keys; users bring their own — see Settings → Plugins).
  unsplashAccessKey: '',
  pexelsApiKey: '',
  falaiApiKey: '',
  smithsonianApiKey: '',
  europeanaApiKey: '',
  // Custom CORS proxy (production deploy of the Cloudflare Worker in
  // infra/cors-proxy-worker/). When set, used BEFORE any public proxy
  // for plugins that fetch from CORS-blocked CDNs (Met, Wikimedia, …).
  // Format: bare URL (e.g. https://api.slammer.app/cors) — slammer
  // appends ?url=<encoded>. Or a template with {url} placeholder.
  corsProxyUrl: '',
  // Canvas scroll/zoom behaviour — 'pan' is the Figma/Miro/Maps default
  // (plain scroll / two-finger trackpad swipe pans the canvas; Ctrl+scroll
  // / pinch zooms). 'zoom' is the legacy slammer default (plain scroll
  // zooms; Ctrl+scroll pans).
  scrollBehavior: 'pan',
  // Phase 21 — alignment aids.
  snapEnabled: true,
  rulersEnabled: false,
  // Phase 21 — Canvas Grid.
  canvasGridShow: false,
  canvasGridSnap: false,
  canvasGridMinor: 10,
  canvasGridMajor: 100,
  canvasGridOpacity: 25,
  canvasGridColor: '#ffffff',
  // Performance — escape hatch. Default OFF means Konva.pixelRatio tracks
  // devicePixelRatio CAPPED AT 2 (matches Figma / Photopea / Procreate
  // implicit policy: sharp on retina, auto-protection against the cost
  // jump on 3x mobile / 5K monitors). Flip ON to force pixelRatio = 1
  // for users hitting perf limits even at 2x. Applied at boot.
  performanceMode: false,
};

// Curated accent palette — clicking a swatch sets accent without opening the
// native colour picker. First row is bright pastels that read well on dark
// surfaces; second row is darker, saturated variants that hold contrast on
// the light theme. Users on Light pick from row 2; users on Dark pick from
// row 1 — the picker doesn't enforce this, the choice is theirs.
const ACCENT_PRESETS = [
  // Bright — readable on Dark / Anthracite surfaces
  '#8aff8c',  // slammer green (default)
  '#7fb3ff',  // sky
  '#c39bff',  // lavender
  '#ff7fb3',  // bubblegum
  '#ffb070',  // amber
  '#7fffea',  // cyan
  '#ff5b5b',  // siren red
  '#f0f0f0',  // mono
  // Darker — needed for contrast on the Light theme
  '#1f9c52',  // forest green
  '#2563eb',  // royal blue
  '#7c3aed',  // deep violet
  '#0f172a',  // ink
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
  const { r, g, b } = hexToRgb(hex);
  const hover = darken(hex, 0.18);
  const rgb = `${r}, ${g}, ${b}`;
  // Phase 30 canonical tokens — written inline on documentElement so they
  // win the cascade against the active theme file's :root[data-theme=...]
  // declarations. Without this, the accent picker silently no-ops because
  // theme files set --sl-accent-primary to their own concrete value.
  const root = document.documentElement.style;
  root.setProperty('--sl-accent-primary', hex);
  root.setProperty('--sl-accent-primary-hover', hover);
  root.setProperty('--sl-accent-primary-rgb', rgb);
  // Back-compat bare tokens — still consumed by a handful of inline JS
  // styles that haven't been migrated. Remove once nothing references them.
  root.setProperty('--primary', hex);
  root.setProperty('--primary-hover', hover);
  root.setProperty('--primary-rgb', rgb);
}

// Phase 30 — apply the UI theme by setting the data-theme attribute on
// <html>. theme-bridge.js watches this attribute via MutationObserver and
// pushes the resolved --sl-* values into Konva nodes.
const VALID_THEMES = new Set(['dark', 'anthracite', 'light']);
export function applyTheme(value) {
  const v = VALID_THEMES.has(value) ? value : 'dark';
  document.documentElement.setAttribute('data-theme', v);
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
      <div class="settings-modal settings-modal--sidebar" role="dialog" aria-label="Settings" aria-modal="true">
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
    wireShortcuts(backdrop);
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
        <div class="settings-group-head"><span class="settings-group-tick"></span>Theme</div>
        <div class="settings-row">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setTheme">UI theme</label>
            <span class="settings-rowhint">Dark — the default canvas-friendly palette. Anthracite — cooler neutral greys. Light — inverted brightness ladder for bright rooms.</span>
          </div>
          <div class="settings-control">
            <div class="settings-segmented" data-key="theme" id="setTheme">
              <button type="button" class="settings-seg ${s.theme === 'dark' || !s.theme ? 'active' : ''}" data-v="dark">Dark</button>
              <button type="button" class="settings-seg ${s.theme === 'anthracite' ? 'active' : ''}" data-v="anthracite">Anthracite</button>
              <button type="button" class="settings-seg ${s.theme === 'light' ? 'active' : ''}" data-v="light">Light</button>
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

  // Theme segmented control — applies immediately + persists.
  const themeSeg = root.querySelector('#setTheme');
  if (themeSeg) {
    themeSeg.querySelectorAll('.settings-seg').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.v;
        themeSeg.querySelectorAll('.settings-seg').forEach((x) => x.classList.toggle('active', x === b));
        applyTheme(v);
        setSettings({ theme: v });
      });
    });
  }
}

function renderWorkflow() {
  const s = getSettings();
  return `
    <section class="settings-tab-panel" data-tab="workflow" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Workflow</span>
        <h2 class="settings-panel-title">How the editor responds</h2>
        <p class="settings-panel-desc">Selection, panel, tool, and persistence behaviours that tune the editor to your workflow.</p>
      </header>

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
        <div class="settings-group-head"><span class="settings-group-tick"></span>Canvas navigation</div>
        <div class="settings-row">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setScrollBehavior">Scroll behaviour</label>
            <span class="settings-rowhint">Pan — plain wheel / two-finger trackpad pans the canvas; <kbd>Ctrl</kbd>+wheel + pinch zoom (Figma / Miro convention). Zoom — plain wheel zooms; <kbd>Ctrl</kbd>+wheel pans.</span>
          </div>
          <div class="settings-control">
            <div class="settings-segmented" data-key="scrollBehavior" id="setScrollBehavior">
              <button type="button" class="settings-seg ${s.scrollBehavior !== 'zoom' ? 'active' : ''}" data-v="pan">Pan</button>
              <button type="button" class="settings-seg ${s.scrollBehavior === 'zoom' ? 'active' : ''}" data-v="zoom">Zoom</button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Panels</div>
        ${toggleRowHTML('setKeepEffectsOpen', 'Keep all effects open', s.keepEffectsOpen,
          'When ON, every filter card stays expanded so all sliders are visible at once.')}
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Tools</div>
        ${toggleRowHTML('setTextToPathReplace', 'Convert to Path replaces text', s.textToPathReplace,
          'When ON, Convert to Path removes the original text layer (Affinity-style). Shift-click the convert button to invert for one conversion.')}
        ${toggleRowHTML('setLiveFontPreview', 'Live font preview', s.liveFontPreview,
          'When ON, hovering a font card in the picker temporarily previews it on the active text layer. Click commits permanently.')}
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Color hub</div>
        <div class="settings-row">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setColorHubMode">Hub style</label>
            <span class="settings-rowhint">Wheel — full radial quick-select around the colour dial. Dot — minimal swatch in the footer-left that opens the same colour menu.</span>
          </div>
          <div class="settings-control">
            <div class="settings-segmented" data-key="colorHubMode" id="setColorHubMode">
              <button type="button" class="settings-seg ${s.colorHubMode !== 'dot' ? 'active' : ''}" data-v="wheel">Wheel</button>
              <button type="button" class="settings-seg ${s.colorHubMode === 'dot' ? 'active' : ''}" data-v="dot">Dot</button>
            </div>
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
          <li><span class="settings-roadmap-key">Versioning</span><span class="settings-roadmap-desc">Manual save-as-version + autosave version chain — Phase 24.</span></li>
          <li><span class="settings-roadmap-key">Frame tool</span><span class="settings-roadmap-desc">Drag on canvas to create export frames — Phase 21.</span></li>
          <li><span class="settings-roadmap-key">Crop tool</span><span class="settings-roadmap-desc">Non-destructive per-layer crop rect — Phase 21.</span></li>
        </ul>
      </div>
    </section>
  `;
}

function wireWorkflow(root) {
  bindToggle(root, 'setKeepEffectsOpen', 'keepEffectsOpen');
  bindToggle(root, 'setTextToPathReplace', 'textToPathReplace');
  bindToggle(root, 'setClickThroughGroups', 'clickThroughGroups');
  bindToggle(root, 'setLiveFontPreview', 'liveFontPreview');
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
  // Segmented control for scroll behaviour (Pan / Zoom).
  const scrollSeg = root.querySelector('#setScrollBehavior');
  if (scrollSeg) {
    scrollSeg.querySelectorAll('.settings-seg').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.v;
        scrollSeg.querySelectorAll('.settings-seg').forEach((x) => x.classList.toggle('active', x === b));
        setSettings({ scrollBehavior: v === 'zoom' ? 'zoom' : 'pan' });
      });
    });
  }
  // Segmented control for color hub mode (Wheel / Dot).
  const hubSeg = root.querySelector('#setColorHubMode');
  if (hubSeg) {
    hubSeg.querySelectorAll('.settings-seg').forEach((b) => {
      b.addEventListener('click', () => {
        const v = b.dataset.v;
        hubSeg.querySelectorAll('.settings-seg').forEach((x) => x.classList.toggle('active', x === b));
        setSettings({ colorHubMode: v === 'dot' ? 'dot' : 'wheel' });
      });
    });
  }
  // Autosave knob + numeric — persistence is a workflow concern, not on-canvas chrome.
  const s = getSettings();
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

function renderCanvas() {
  const s = getSettings();
  const dimPct = Math.round((s.frameDimOpacity ?? 0.80) * 100);
  return `
    <section class="settings-tab-panel" data-tab="canvas" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Canvas</span>
        <h2 class="settings-panel-title">Stage &amp; grid</h2>
        <p class="settings-panel-desc">Visual chrome on the canvas — the export-frame dim and the snap-to-grid overlay.</p>
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
        <div class="settings-group-head"><span class="settings-group-tick"></span>Canvas Grid</div>
        ${toggleRowHTML('setCanvasGridShow', 'Show grid', s.canvasGridShow,
          'Draws a subtle two-tier grid above the dim overlay. Moves with the canvas when you pan or zoom and adapts its pitch when you zoom out.')}
        ${toggleRowHTML('setCanvasGridSnap', 'Snap to grid', s.canvasGridSnap,
          'When Snap is also ON, dragged layers align to the minor grid pitch.')}
        <div class="settings-row settings-row--stack">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setCanvasGridMinor">Minor pitch</label>
            <span class="settings-rowhint">Spacing between minor (thin) grid lines in world pixels.</span>
          </div>
          <div class="settings-control settings-control--full">
            <input type="range" id="setCanvasGridMinor" min="5" max="100" step="1" value="${s.canvasGridMinor}" />
            <code class="settings-readout settings-readout--inline" id="setCanvasGridMinorReadout">${s.canvasGridMinor}px</code>
          </div>
        </div>
        <div class="settings-row settings-row--stack">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setCanvasGridMajor">Major pitch</label>
            <span class="settings-rowhint">Spacing between major (thicker) grid lines. Clamped to a multiple of minor pitch.</span>
          </div>
          <div class="settings-control settings-control--full">
            <input type="range" id="setCanvasGridMajor" min="50" max="500" step="1" value="${s.canvasGridMajor}" />
            <code class="settings-readout settings-readout--inline" id="setCanvasGridMajorReadout">${s.canvasGridMajor}px</code>
          </div>
        </div>
        <div class="settings-row settings-row--stack">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setCanvasGridOpacity">Opacity</label>
            <span class="settings-rowhint">Brightness of the grid lines (0 = invisible, 100 = fully opaque).</span>
          </div>
          <div class="settings-control settings-control--full">
            <input type="range" id="setCanvasGridOpacity" min="0" max="100" step="1" value="${s.canvasGridOpacity}" />
            <code class="settings-readout settings-readout--inline" id="setCanvasGridOpacityReadout">${s.canvasGridOpacity}%</code>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setCanvasGridColor">Colour</label>
            <span class="settings-rowhint">Line colour. White works well on dark canvases; swap to a dark tone for light backgrounds.</span>
          </div>
          <div class="settings-control settings-control--accent">
            <input type="color" id="setCanvasGridColor" value="${s.canvasGridColor}" />
            <code class="settings-readout" id="setCanvasGridColorReadout">${s.canvasGridColor.toUpperCase()}</code>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Performance</div>
        ${toggleRowHTML('setPerformanceMode', 'Performance mode', s.performanceMode,
          'Forces the canvas to render at 1x device pixels. By default slammer caps at 2x — sharp on retina, automatic protection against the 3x cost on HDPI mobile / 5K monitors. Flip this on if you hit slowdowns even at 2x (heavy projects on slower Macs). Slight softness on selection handles and rulers. Reload after toggling.')}
      </div>

    </section>
  `;
}

function wireCanvas(root) {
  // Frame dim slider
  const frameDimInput = root.querySelector('#setFrameDim');
  const frameDimReadout = root.querySelector('#setFrameDimReadout');
  frameDimInput?.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value, 10);
    frameDimReadout.textContent = `${pct}%`;
    setSettings({ frameDimOpacity: pct / 100 });
  });

  // Canvas Grid controls
  bindToggle(root, 'setCanvasGridShow', 'canvasGridShow');
  bindToggle(root, 'setCanvasGridSnap', 'canvasGridSnap');
  // Performance mode — applied at boot via Konva.pixelRatio in main.js.
  bindToggle(root, 'setPerformanceMode', 'performanceMode');

  const minorInput     = root.querySelector('#setCanvasGridMinor');
  const minorReadout   = root.querySelector('#setCanvasGridMinorReadout');
  const majorInput     = root.querySelector('#setCanvasGridMajor');
  const majorReadout   = root.querySelector('#setCanvasGridMajorReadout');
  const opacityInput   = root.querySelector('#setCanvasGridOpacity');
  const opacityReadout = root.querySelector('#setCanvasGridOpacityReadout');
  const colorInput     = root.querySelector('#setCanvasGridColor');
  const colorReadout   = root.querySelector('#setCanvasGridColorReadout');

  function clampMajorToMultiple(minor, major) {
    if (minor <= 0) return major;
    return Math.max(minor, Math.round(major / minor) * minor);
  }

  minorInput?.addEventListener('input', (e) => {
    const minor = parseInt(e.target.value, 10);
    minorReadout.textContent = `${minor}px`;
    // Clamp major to a multiple of the new minor
    const major = clampMajorToMultiple(minor, parseInt(majorInput.value, 10));
    majorInput.value = major;
    majorReadout.textContent = `${major}px`;
    setSettings({ canvasGridMinor: minor, canvasGridMajor: major });
  });

  majorInput?.addEventListener('input', (e) => {
    const minor = parseInt(minorInput.value, 10);
    const rawMajor = parseInt(e.target.value, 10);
    const major = clampMajorToMultiple(minor, rawMajor);
    majorReadout.textContent = `${major}px`;
    setSettings({ canvasGridMajor: major });
  });

  opacityInput?.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    opacityReadout.textContent = `${v}%`;
    setSettings({ canvasGridOpacity: v });
  });

  colorInput?.addEventListener('input', (e) => {
    const hex = e.target.value;
    colorReadout.textContent = hex.toUpperCase();
    setSettings({ canvasGridColor: hex });
  });
}

function renderPlugins() {
  const s = getSettings();
  return `
    <section class="settings-tab-panel" data-tab="plugins" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Plugins</span>
        <h2 class="settings-panel-title">Manage plugins from the browser</h2>
        <p class="settings-panel-desc">Add API keys, pin to sidebar, and discover new plugins in one place.</p>
      </header>

      <div class="settings-group">
        <button class="settings-apply" id="pmOpenBrowser" type="button">
          <i class="fas fa-puzzle-piece"></i> Open Plugin Browser
        </button>
      </div>

      <div class="settings-group">
        <div class="settings-group-head"><span class="settings-group-tick"></span>Advanced</div>
        <div class="settings-row settings-row--stack">
          <div class="settings-rowlabelblock">
            <label class="settings-rowlabel" for="setCorsProxy">Custom CORS proxy URL</label>
            <span class="settings-rowhint">Used <strong>before</strong> the public proxy chain for plugins that fetch from CORS-blocked CDNs (Met, Wikimedia, …). Bare URL gets <code>?url=&lt;encoded&gt;</code> appended; template with <code>{url}</code> placeholder is substituted directly. See <code>infra/cors-proxy-worker/README.md</code> for a Cloudflare Worker you can deploy in 10 min.</span>
          </div>
          <input type="text" id="setCorsProxy" class="settings-text-input" autocomplete="off"
                 placeholder="https://your-worker.example.com/cors  (leave blank to use public proxies)"
                 value="${escapeAttr(s.corsProxyUrl)}" />
        </div>
      </div>
    </section>
  `;
}

function wirePlugins(root) {
  bindKeyInput(root.querySelector('#setCorsProxy'), 'corsProxyUrl');
  const browserBtn = root.querySelector('#pmOpenBrowser');
  if (browserBtn) {
    browserBtn.addEventListener('click', async () => {
      // Close the settings popup first, then open the browser.
      const backdrop = root.closest('.settings-backdrop');
      backdrop?.querySelector('[data-act=close]')?.click();
      const mod = await import('./plugin-browser.js');
      mod.openPluginBrowser();
    });
  }
}

// Per-category list of behaviours that are documented in the Settings
// reference but are NOT keyboard bindings — mouse-wheel, drag conventions,
// browser-native shortcuts, etc. These render as literal rows alongside
// the live registry bindings.
const SHORTCUT_EXTRAS = {
  File: [
    ['Shift+click Export', 'Export <code>.slammerproj</code> directly'],
  ],
  Edit: [
    ['Ctrl+V', 'Paste image from system clipboard (when no internal layer is buffered)'],
    ['Delete / Backspace', 'Delete selection'],
  ],
  'Move & transform': [
    ['← → ↑ ↓', 'Nudge selection 1 px'],
    ['Shift+arrow', 'Nudge selection 10 px'],
    ['Drag rotate handle', 'Free rotate (live degree pill follows pointer)'],
    ['Shift+rotate', 'Snap rotation to nearest 5°'],
    ['Alt+drag layer', 'Duplicate the layer and drag the copy (Photoshop / Figma convention)'],
    ['Alt+drag (mid-gesture)', 'Escape snap during drag'],
    ['Ctrl+Shift+drag handle (text)', 'Resize text-box width (auto-wrap)'],
  ],
  Tools: [],
  Canvas: [
    ['Mouse-wheel', 'Pan or zoom — Settings → Workflow → Canvas navigation chooses the default'],
    ['Ctrl+wheel / pinch', 'Zoom (when scroll is set to Pan) / Pan (when scroll is set to Zoom)'],
    ['Shift+wheel', 'Pan horizontally with a single-axis mouse wheel'],
    ['Middle-mouse drag', 'Pan'],
    ['Space+drag', 'Pan (alternative to middle-mouse)'],
    ['F11', 'Toggle fullscreen'],
    ['Drag a layer card to canvas', 'Re-add layer (or to plugin: send for processing)'],
  ],
};

// Category order matches the previous hardcoded table.
const SHORTCUT_CATEGORY_ORDER = ['File', 'Edit', 'Move & transform', 'Tools', 'Canvas'];

function renderShortcuts() {
  return `
    <section class="settings-tab-panel" data-tab="shortcuts" hidden>
      <header class="settings-panel-head">
        <span class="settings-panel-eyebrow">Shortcuts</span>
        <h2 class="settings-panel-title">Keyboard reference</h2>
        <p class="settings-panel-desc">Click any key chip to rebind. Reset individually with the rotate icon or restore every default with the button below.</p>
        <div class="settings-shortcuts-toolbar">
          <button type="button" class="settings-action-btn settings-action-btn--danger-soft" data-act="resetAllShortcuts">
            <i class="fas fa-rotate-left"></i><span>Reset all to defaults</span>
          </button>
        </div>
      </header>

      <div class="settings-group settings-group--shortcuts">
        <table class="settings-shortcuts">
          <colgroup><col class="settings-shortcuts-keys"/><col/></colgroup>
          <tbody data-shortcuts-tbody>
            ${renderShortcutRows()}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// Render the <tbody> contents only — used for both initial render and
// the re-render after every override change (subscribed via
// onBindingsChange in wireShortcuts).
function renderShortcutRows() {
  const bindings = getBindings();
  const byCategory = bindings.reduce((acc, b) => {
    const cat = b.category || 'Edit';
    (acc[cat] = acc[cat] || []).push(b);
    return acc;
  }, {});

  return SHORTCUT_CATEGORY_ORDER.map((cat) => {
    const liveBindings = byCategory[cat] || [];
    const extras = SHORTCUT_EXTRAS[cat] || [];
    if (!liveBindings.length && !extras.length) return '';
    const label = cat === 'Move & transform' ? 'Move &amp; transform' : cat;
    const head = `<tr class="settings-shortcuts-head"><th colspan="2">${label}</th></tr>`;
    const live = liveBindings.map((b) => renderShortcutRow(b)).join('');
    const literal = extras.map(([keys, desc]) => renderLiteralRow(keys, desc)).join('');
    return head + live + literal;
  }).join('');
}

// Live (registry-backed) row — chip + reset button, both interactive.
function renderShortcutRow(b) {
  const overridden = b.overridden;
  const unbound = overridden && !b.activeKeys;
  const chipContents = unbound
    ? '<span class="shortcut-chip-empty">Unbound</span>'
    : kbdHtml(prettyCombo(b.activeKeys));
  return `
    <tr class="shortcut-row${overridden ? ' is-overridden' : ''}${unbound ? ' is-unbound' : ''}" data-binding-id="${escapeAttr(b.id)}">
      <td>
        <span class="shortcut-cell">
          <button type="button" class="shortcut-chip" data-act="remap"
                  title="Click to rebind (Esc cancels)">${chipContents}</button>
          <button type="button" class="shortcut-reset" data-act="reset"
                  title="Reset to default (${escapeAttr(prettyCombo(b.defaultKeys))})"
                  aria-label="Reset to default"${overridden ? '' : ' hidden'}>
            <i class="fas fa-rotate-left"></i>
          </button>
        </span>
      </td>
      <td>${escapeHtml(b.label)}</td>
    </tr>
  `;
}

// Literal row — pure documentation, no controls.
function renderLiteralRow(keys, desc) {
  return `
    <tr class="shortcut-row shortcut-row--readonly">
      <td>${kbdHtml(keys, /* allowGesture */ true)}</td>
      <td>${desc}</td>
    </tr>
  `;
}

// Render a combo string ("Ctrl+Shift+↑" or "Mouse-wheel") as <kbd>-
// wrapped parts. Pure helper shared by live + literal rows.
function kbdHtml(combo, allowGesture = false) {
  if (!combo) return '';
  return combo.split(' / ').map((c) => c.split('+').map((p) => {
    if (allowGesture && (p.includes('drag') || p.includes('click') || p.includes('mouse') || p.includes('wheel'))) {
      return p;
    }
    return `<kbd>${p}</kbd>`;
  }).join('+')).join(' / ');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Shortcuts tab interaction ----------
function wireShortcuts(backdrop) {
  // The settings popup uses `data-tab="shortcuts"` on BOTH the sidebar
  // button AND the panel section — be specific so the click delegate
  // attaches to the panel.
  const panel = backdrop.querySelector('.settings-tab-panel[data-tab="shortcuts"]');
  if (!panel) return;
  const tbody = panel.querySelector('[data-shortcuts-tbody]');

  const offChange = onBindingsChange(() => {
    if (!document.body.contains(panel)) { offChange(); return; }
    cancelListening();
    tbody.innerHTML = renderShortcutRows();
  });
  const moRoot = backdrop.parentNode || document.body;
  const mo = new MutationObserver(() => {
    if (!document.body.contains(backdrop)) {
      offChange();
      cancelListening();
      mo.disconnect();
    }
  });
  mo.observe(moRoot, { childList: true });

  let listeningRow = null;
  let listeningId = null;
  let onKeyCapture = null;
  let onClickOutside = null;

  function startListening(rowEl, bindingId) {
    cancelListening();
    listeningRow = rowEl;
    listeningId = bindingId;
    rowEl.classList.add('is-listening');
    const chip = rowEl.querySelector('.shortcut-chip');
    if (chip) chip.innerHTML = '<span class="shortcut-chip-listening">Press key combination…</span>';
    pauseRouter();

    onKeyCapture = (e) => {
      const res = captureCombo(e);
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (res.kind === 'pending') return;
      if (res.kind === 'cancel')  { cancelListening(); return; }
      commitCombo(bindingId, res.combo);
    };
    document.addEventListener('keydown', onKeyCapture, true);

    onClickOutside = (e) => {
      if (e.target.closest('.shortcut-row[data-binding-id="' + cssEscape(bindingId) + '"]')) return;
      if (e.target.closest('.shortcut-conflict-row[data-binding-id="' + cssEscape(bindingId) + '"]')) return;
      cancelListening();
    };
    document.addEventListener('mousedown', onClickOutside, true);
  }

  function cancelListening() {
    // Idempotent: if nothing's active, do absolutely nothing — in
    // particular DON'T re-render the tbody. startListening() calls
    // cancelListening() as its first step to clear stale state; a
    // gratuitous re-render at that point would detach the rowEl the
    // caller is about to set is-listening on, and the visible chip
    // never updates.
    const hadKey = !!onKeyCapture;
    const hadClick = !!onClickOutside;
    const hadConflictRow = !!panel.querySelector('.shortcut-conflict-row');
    const wasListening = !!listeningRow;
    if (!hadKey && !hadClick && !hadConflictRow && !wasListening) return;

    if (onKeyCapture) {
      document.removeEventListener('keydown', onKeyCapture, true);
      onKeyCapture = null;
    }
    if (onClickOutside) {
      document.removeEventListener('mousedown', onClickOutside, true);
      onClickOutside = null;
    }
    listeningRow = null;
    listeningId = null;
    resumeRouter();
    panel.querySelectorAll('.shortcut-conflict-row').forEach((r) => r.remove());
    // Re-render so any chip stuck mid-"Press…" text reverts.
    tbody.innerHTML = renderShortcutRows();
  }

  function commitCombo(bindingId, combo) {
    const binding = getBindings().find((b) => b.id === bindingId);
    if (!binding) { cancelListening(); return; }
    const collision = findCollision(combo, binding.scope, bindingId);
    if (collision) {
      if (onKeyCapture) { document.removeEventListener('keydown', onKeyCapture, true); onKeyCapture = null; }
      if (onClickOutside) { document.removeEventListener('mousedown', onClickOutside, true); onClickOutside = null; }
      if (listeningRow) listeningRow.classList.remove('is-listening');
      listeningRow = null;
      listeningId = null;
      resumeRouter();
      tbody.innerHTML = renderShortcutRows();
      showConflict(bindingId, combo, collision);
      return;
    }
    setOverride(bindingId, combo);
    cancelListening();
  }

  function showConflict(bindingId, attemptedCombo, collision) {
    const row = tbody.querySelector(`.shortcut-row[data-binding-id="${cssEscape(bindingId)}"]`);
    if (!row) return;
    tbody.querySelectorAll(`.shortcut-conflict-row[data-binding-id="${cssEscape(bindingId)}"]`)
      .forEach((r) => r.remove());
    const conflictTr = document.createElement('tr');
    conflictTr.className = 'shortcut-conflict-row';
    conflictTr.dataset.bindingId = bindingId;
    conflictTr.innerHTML = `
      <td colspan="2">
        <div class="shortcut-conflict">
          <i class="fas fa-triangle-exclamation shortcut-conflict-icon"></i>
          <span class="shortcut-conflict-msg">
            <strong>${escapeHtml(prettyCombo(attemptedCombo))}</strong>
            conflicts with <strong>${escapeHtml(collision.label)}</strong>.
          </span>
          <span class="shortcut-conflict-spacer"></span>
          <button type="button" class="shortcut-conflict-btn" data-act="conflictCancel">Cancel</button>
          <button type="button" class="shortcut-conflict-btn shortcut-conflict-btn--danger" data-act="conflictReplace">Replace anyway</button>
        </div>
      </td>
    `;
    row.after(conflictTr);

    conflictTr.addEventListener('click', (e) => {
      if (e.target.closest('[data-act=conflictCancel]')) {
        conflictTr.remove();
        return;
      }
      if (e.target.closest('[data-act=conflictReplace]')) {
        unbindBinding(collision.id);
        setOverride(bindingId, attemptedCombo);
      }
    });
  }

  panel.addEventListener('click', async (e) => {
    const chip = e.target.closest('.shortcut-chip');
    const reset = e.target.closest('.shortcut-reset');
    const resetAll = e.target.closest('[data-act=resetAllShortcuts]');
    if (chip) {
      const rowEl = chip.closest('.shortcut-row');
      if (!rowEl) return;
      const id = rowEl.dataset.bindingId;
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      startListening(rowEl, id);
      return;
    }
    if (reset) {
      const rowEl = reset.closest('.shortcut-row');
      if (!rowEl) return;
      const id = rowEl.dataset.bindingId;
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      clearOverride(id);
      return;
    }
    if (resetAll) {
      e.preventDefault();
      e.stopPropagation();
      const ok = await showConfirm({
        title: 'Reset all shortcuts',
        message: 'Reset every keyboard shortcut to its default? Custom remaps will be lost.',
        confirmText: 'Reset all',
        kind: 'danger',
      });
      if (ok) resetAllOverrides();
    }
  });
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
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
    applyTheme(DEFAULTS.theme);
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

export function apiKeyRowHTML(id, label, value, helpUrl, hint) {
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

export function escapeAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
