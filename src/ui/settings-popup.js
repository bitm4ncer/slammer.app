// Settings popup — autosave duration, version info, theme accent colour.
// Persists to localStorage 'slammer:settings'.

import { createKnob } from '../plugins/shared/knob.js';
import { createNumericInput } from '../plugins/shared/numeric-input.js';

const STORE_KEY = 'slammer:settings';
const DEFAULTS = { autosaveMs: 800, accent: '#F0F0F0', customLayerColors: true, keepEffectsOpen: false, frameDimOpacity: 0.80 };

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

export function initSettingsPopup({ button, version }) {
  let backdrop = null;

  // Apply persisted accent on boot.
  applyAccent(getSettings().accent);

  button.addEventListener('click', open);

  function open() {
    if (backdrop) return;
    const s = getSettings();
    backdrop = document.createElement('div');
    backdrop.className = 'settings-backdrop';
    backdrop.innerHTML = `
      <div class="settings-modal" role="dialog" aria-label="Settings">
        <div class="settings-header">
          <span><i class="fas fa-gear"></i> Settings</span>
          <button class="settings-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>

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
    `;
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
    });

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

    const customAccentInput = backdrop.querySelector('#setCustomLayerColors');
    customAccentInput.addEventListener('change', (e) => {
      setSettings({ customLayerColors: e.target.checked });
    });

    const keepOpenInput = backdrop.querySelector('#setKeepEffectsOpen');
    keepOpenInput.addEventListener('change', (e) => {
      setSettings({ keepEffectsOpen: e.target.checked });
    });

    const frameDimInput = backdrop.querySelector('#setFrameDim');
    const frameDimReadout = backdrop.querySelector('#setFrameDimReadout');
    frameDimInput.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10);
      frameDimReadout.textContent = `${pct}%`;
      setSettings({ frameDimOpacity: pct / 100 });
    });

    // Esc closes.
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

  return { open, close };
}
