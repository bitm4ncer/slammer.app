// Settings popup — tabbed (General + API Keys).
// Persists to localStorage 'slammer:settings'.

import { createKnob } from '../plugins/shared/knob.js';
import { createNumericInput } from '../plugins/shared/numeric-input.js';

const STORE_KEY = 'slammer:settings';
const DEFAULTS = {
  autosaveMs: 800,
  accent: '#F0F0F0',
  customLayerColors: true,
  keepEffectsOpen: false,
  frameDimOpacity: 0.80,
  textToPathReplace: true,
  // Phase E — marquee selection mode. 'touch' selects any layer the
  // marquee overlaps; 'contain' requires the layer's bbox to fully
  // sit inside the marquee. Mirrors Affinity's "selection mode" toggle.
  marqueeMode: 'touch',
  // Click-through-groups (deferred: clicking a child on canvas selects
  // the leaf instead of the parent group when ON). Default off.
  clickThroughGroups: false,
  // Phase 16 — plugin keys (all empty by default; plugins prompt the user
  // when they're missing).
  unsplashAccessKey: '',
  pexelsApiKey: '',
  falaiApiKey: '',
};

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

let _initialTab = 'general';

export function openSettings(tab = 'general') {
  _initialTab = tab;
  document.getElementById('btnSettings')?.click();
}

export function initSettingsPopup({ button, version }) {
  let backdrop = null;

  applyAccent(getSettings().accent);

  button.addEventListener('click', open);

  function open() {
    if (backdrop) return;
    const s = getSettings();
    const startTab = _initialTab;
    _initialTab = 'general';

    backdrop = document.createElement('div');
    backdrop.className = 'settings-backdrop';
    backdrop.innerHTML = `
      <div class="settings-modal settings-modal--tabbed" role="dialog" aria-label="Settings">
        <div class="settings-header">
          <span><i class="fas fa-gear"></i> Settings</span>
          <button class="settings-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>
        <div class="settings-tabbar">
          <button class="settings-tab" data-tab="general">General</button>
          <button class="settings-tab" data-tab="apikeys">API Keys</button>
          <button class="settings-tab" data-tab="shortcuts">Shortcuts</button>
          <button class="settings-tab" data-tab="info">Info</button>
        </div>

        <div class="settings-tab-panel" data-tab="general">
          <div class="settings-section">
            <div class="settings-rowpair">
              <div class="settings-row">
                <label class="settings-label" for="setAccent">UI accent colour</label>
                <div class="settings-control settings-control--accent">
                  <input type="color" id="setAccent" value="${s.accent}" />
                  <code class="settings-readout" id="setAccentReadout">${s.accent.toUpperCase()}</code>
                </div>
              </div>

              <div class="settings-row">
                <label class="settings-label" for="setCustomLayerColors">Custom layer colours</label>
                <label class="effect-toggle-row settings-toggle-bare" for="setCustomLayerColors">
                  <input type="checkbox" id="setCustomLayerColors" ${s.customLayerColors ? 'checked' : ''} />
                  <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
                </label>
              </div>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="setKeepEffectsOpen">Keep all effects open</label>
              <label class="effect-toggle-row settings-toggle-bare" for="setKeepEffectsOpen">
                <input type="checkbox" id="setKeepEffectsOpen" ${s.keepEffectsOpen ? 'checked' : ''} />
                <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
              </label>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="setTextToPathReplace" title="When ON, Convert to Path removes the original text layer (Affinity-style). When OFF, the text layer is kept and the vector is added as a copy. Shift-click the Convert button to invert for one conversion.">Convert to Path replaces text</label>
              <label class="effect-toggle-row settings-toggle-bare" for="setTextToPathReplace">
                <input type="checkbox" id="setTextToPathReplace" ${s.textToPathReplace ? 'checked' : ''} />
                <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
              </label>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="setFrameDim">Export frame dim
                <code class="settings-readout" id="setFrameDimReadout">${Math.round((s.frameDimOpacity ?? 0.80) * 100)}%</code>
              </label>
              <div class="settings-control">
                <input type="range" id="setFrameDim" min="0" max="100" step="1" value="${Math.round((s.frameDimOpacity ?? 0.80) * 100)}" />
              </div>
            </div>

            <div class="settings-row">
              <label class="settings-label">Autosave delay <code class="settings-readout" id="setAutosaveReadout">${s.autosaveMs} ms</code></label>
              <div class="settings-control" id="setAutosaveControl"></div>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="setMarqueeMode" title="Touch: any overlap with a layer's bbox selects it. Contain: the layer's bbox must lie fully inside the marquee.">Marquee selection</label>
              <div class="settings-control">
                <select id="setMarqueeMode" class="settings-text-input">
                  <option value="touch"   ${s.marqueeMode !== 'contain' ? 'selected' : ''}>Touch</option>
                  <option value="contain" ${s.marqueeMode === 'contain' ? 'selected' : ''}>Contain</option>
                </select>
              </div>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="setClickThroughGroups" title="When ON, clicking a layer inside a group on the canvas selects that child directly. When OFF, clicks select the parent group (Figma-style).">Click-through groups</label>
              <label class="effect-toggle-row settings-toggle-bare" for="setClickThroughGroups">
                <input type="checkbox" id="setClickThroughGroups" ${s.clickThroughGroups ? 'checked' : ''} />
                <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
              </label>
            </div>
          </div>

          <div class="settings-section settings-meta">
            <div class="settings-row">
              <span class="settings-label">Version</span>
              <span class="settings-readout">${version}</span>
            </div>
            <div class="settings-row">
              <span class="settings-label">App</span>
              <span class="settings-readout">slammer.app</span>
            </div>
          </div>
        </div>

        <div class="settings-tab-panel" data-tab="apikeys" hidden>
          <div class="settings-section">
            <div class="settings-row">
              <label class="settings-label" for="setUnsplashKey">Unsplash Access Key
                <a class="settings-help" href="https://unsplash.com/oauth/applications" target="_blank" rel="noopener">get one</a>
              </label>
              <div class="settings-control">
                <input type="password" id="setUnsplashKey" class="settings-text-input" autocomplete="off" placeholder="Access Key from your app's API keys page" value="${escapeAttr(s.unsplashAccessKey)}" />
              </div>
              <div class="settings-help-inline settings-help-inline--note">Use the <code>Access Key</code> — not Application ID or Secret Key.</div>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="setPexelsKey">Pexels API Key
                <a class="settings-help" href="https://www.pexels.com/api/" target="_blank" rel="noopener">get one</a>
              </label>
              <div class="settings-control">
                <input type="password" id="setPexelsKey" class="settings-text-input" autocomplete="off" placeholder="api key …" value="${escapeAttr(s.pexelsApiKey)}" />
              </div>
            </div>

            <div class="settings-row">
              <label class="settings-label" for="setFalaiKey">fal.ai API Key
                <a class="settings-help" href="https://fal.ai/dashboard/keys" target="_blank" rel="noopener">get one</a>
              </label>
              <div class="settings-control">
                <input type="password" id="setFalaiKey" class="settings-text-input" autocomplete="off" placeholder="…:…" value="${escapeAttr(s.falaiApiKey)}" />
              </div>
            </div>
          </div>

          <div class="settings-section settings-meta">
            <div class="settings-help-block">
              Keys live in this browser's <code>localStorage</code>. Each user brings their own — slammer never proxies them. fal.ai's JS client calls their API directly from the browser.
            </div>
          </div>
        </div>

        <div class="settings-tab-panel" data-tab="shortcuts" hidden>
          <div class="settings-section">
            <table class="settings-shortcuts">
              <colgroup><col class="settings-shortcuts-keys"/><col/></colgroup>
              <tbody>
                <tr class="settings-shortcuts-head"><th colspan="2">File</th></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>N</kbd></td><td>New blank project</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>O</kbd></td><td>Open project popup</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save project</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>E</kbd></td><td>Export PNG/JPEG/WebP popup</td></tr>
                <tr><td><kbd>Shift</kbd>+click Export</td><td>Export <code>.slammerproj</code> directly</td></tr>

                <tr class="settings-shortcuts-head"><th colspan="2">Edit</th></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></td><td>Redo</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>X</kbd></td><td>Copy / Paste / Cut active layer</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Duplicate active layer (+20 / +20 px)</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Select all layers</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>G</kbd></td><td>Group selection</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd></td><td>Ungroup</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>L</kbd></td><td>Lock / unlock active layer</td></tr>
                <tr><td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td><td>Delete selection</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Deselect / cancel current gesture</td></tr>

                <tr class="settings-shortcuts-head"><th colspan="2">Move &amp; transform</th></tr>
                <tr><td><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></td><td>Nudge selection 1 px</td></tr>
                <tr><td><kbd>Shift</kbd>+arrow</td><td>Nudge selection 10 px</td></tr>
                <tr><td>Drag rotate handle</td><td>Free rotate (live degree pill follows pointer)</td></tr>
                <tr><td><kbd>Shift</kbd>+rotate</td><td>Snap rotation to nearest 5°</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+drag handle (text)</td><td>Resize text-box width (auto-wrap)</td></tr>

                <tr class="settings-shortcuts-head"><th colspan="2">Tools</th></tr>
                <tr><td><kbd>V</kbd></td><td>Select tool</td></tr>
                <tr><td><kbd>A</kbd></td><td>Direct Select (anchor edit)</td></tr>
                <tr><td><kbd>P</kbd></td><td>Pen tool</td></tr>
                <tr><td><kbd>B</kbd></td><td>Pencil tool</td></tr>
                <tr><td><kbd>R</kbd></td><td>Rectangle (cycle shape primitives)</td></tr>
                <tr><td><kbd>T</kbd></td><td>Add text layer</td></tr>
                <tr><td><kbd>I</kbd></td><td>Add image layer</td></tr>

                <tr class="settings-shortcuts-head"><th colspan="2">Canvas</th></tr>
                <tr><td>Mouse-wheel</td><td>Zoom in / out (around pointer)</td></tr>
                <tr><td>Middle-mouse drag</td><td>Pan</td></tr>
                <tr><td>Drag a layer card to canvas</td><td>Re-add layer (or to plugin: send for processing)</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="settings-tab-panel" data-tab="info" hidden>
          <div class="settings-section">
            <div class="settings-row">
              <span class="settings-label">App</span>
              <span class="settings-readout">slammer.app · ${version}</span>
            </div>
            <div class="settings-help-block">
              Browser-native multi-layer editor for slamming, glitching &amp; dithering.
              No backend, no telemetry — everything runs locally in this tab.
            </div>
          </div>

          <div class="settings-section">
            <div class="settings-row settings-row--column">
              <span class="settings-label">Supported file types</span>
              <ul class="settings-filetypes">
                <li><strong>Project</strong> — <code>.slammerproj</code>, <code>.slmr</code> (legacy <code>.crushproj</code> auto-imported)</li>
                <li><strong>Image</strong> — PNG, JPEG, WebP, AVIF, GIF (drag onto canvas or paste)</li>
                <li><strong>Vector</strong> — SVG (drag onto canvas)</li>
                <li><strong>Fonts</strong> — TTF, OTF, WOFF, WOFF2 (Typography → Upload)</li>
                <li><strong>Export</strong> — PNG, JPEG, WebP (region: visible / frame, scale 1× / 2× / 4×)</li>
              </ul>
            </div>
          </div>

          <div class="settings-section settings-meta">
            <div class="settings-row">
              <a class="settings-coffee-btn" href="https://buymeacoffee.com/slammer.app" target="_blank" rel="noopener" aria-label="Buy a coffee">
                <i class="fas fa-mug-hot"></i>
                <span>Buy a coffee</span>
              </a>
              <a class="settings-help" href="https://github.com/bitm4ncer/slammer.app" target="_blank" rel="noopener">GitHub</a>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
    });

    // ---------- Tabs ----------
    const tabs = backdrop.querySelectorAll('.settings-tab');
    const panels = backdrop.querySelectorAll('.settings-tab-panel');
    function selectTab(name) {
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      panels.forEach((p) => p.toggleAttribute('hidden', p.dataset.tab !== name));
    }
    tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
    const validTabs = new Set(['general', 'apikeys', 'shortcuts', 'info']);
    selectTab(validTabs.has(startTab) ? startTab : 'general');

    // ---------- General controls ----------
    const accentInput = backdrop.querySelector('#setAccent');
    const accentReadout = backdrop.querySelector('#setAccentReadout');
    accentInput.addEventListener('input', (e) => {
      const hex = e.target.value;
      accentReadout.textContent = hex.toUpperCase();
      applyAccent(hex);
      setSettings({ accent: hex });
    });

    const autosaveControl = backdrop.querySelector('#setAutosaveControl');
    const autosaveReadout = backdrop.querySelector('#setAutosaveReadout');
    if (autosaveControl) {
      const autosaveKnob = createKnob({
        size: 32,
        min: 200, max: 3000, step: 100,
        value: s.autosaveMs,
        defaultValue: 800,
        onChange: (v) => {
          autosaveReadout.textContent = `${v} ms`;
          autosaveNum.setValue(v);
          setSettings({ autosaveMs: v });
        },
      });
      const autosaveNum = createNumericInput({
        min: 200, max: 3000, step: 100,
        value: s.autosaveMs,
        suffix: 'ms',
        onChange: (v) => {
          autosaveReadout.textContent = `${v} ms`;
          autosaveKnob.setValue(v);
          setSettings({ autosaveMs: v });
        },
      });
      autosaveControl.appendChild(autosaveKnob);
      autosaveControl.appendChild(autosaveNum);
    }

    backdrop.querySelector('#setCustomLayerColors').addEventListener('change', (e) => {
      setSettings({ customLayerColors: e.target.checked });
    });
    backdrop.querySelector('#setKeepEffectsOpen').addEventListener('change', (e) => {
      setSettings({ keepEffectsOpen: e.target.checked });
    });
    backdrop.querySelector('#setTextToPathReplace')?.addEventListener('change', (e) => {
      setSettings({ textToPathReplace: e.target.checked });
    });
    backdrop.querySelector('#setMarqueeMode')?.addEventListener('change', (e) => {
      setSettings({ marqueeMode: e.target.value === 'contain' ? 'contain' : 'touch' });
    });
    backdrop.querySelector('#setClickThroughGroups')?.addEventListener('change', (e) => {
      setSettings({ clickThroughGroups: e.target.checked });
    });

    const frameDimInput = backdrop.querySelector('#setFrameDim');
    const frameDimReadout = backdrop.querySelector('#setFrameDimReadout');
    frameDimInput.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      frameDimReadout.textContent = `${pct}%`;
      setSettings({ frameDimOpacity: pct / 100 });
    });

    // ---------- API key controls ----------
    bindKeyInput(backdrop.querySelector('#setUnsplashKey'), 'unsplashAccessKey');
    bindKeyInput(backdrop.querySelector('#setPexelsKey'), 'pexelsApiKey');
    bindKeyInput(backdrop.querySelector('#setFalaiKey'), 'falaiApiKey');

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    backdrop._onKey = onKey;
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

  function close() {
    if (!backdrop) return;
    document.removeEventListener('keydown', backdrop._onKey);
    backdrop.remove();
    backdrop = null;
  }

  return { open, close };
}

function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
