// theme-bridge.js — bridges CSS --sl-* tokens to Konva node properties.
//
// Konva nodes can't read CSS variables; they need concrete colour strings.
// This module:
//   1. Resolves --sl-* tokens from :root via getComputedStyle.
//   2. Exposes getThemeToken(name) for Konva-using code.
//   3. Watches <html data-theme> via MutationObserver and notifies subscribers
//      so they can re-apply colours + redraw their Konva layers.
//
// Per-layer instance state (--ctx-accent etc.) is NOT exposed here — those are
// per-layer overrides set inline on layer DOM nodes by JS.

const TOKENS = [
  'sl-canvas-frame-stroke',
  'sl-border-strong',
  'sl-anchor-outline',
  'sl-anchor-fill-default',
  'sl-accent-primary',
  'sl-text-primary',
  'sl-text-secondary',
  'sl-surface-panel',
  'sl-surface-raised',
  'sl-surface-elevated',
  'sl-surface-canvas-checker-dark',
  'sl-bg-app',
];

const cache = new Map();
const listeners = new Set();
let observer = null;
let initialised = false;

function readAll() {
  const root = getComputedStyle(document.documentElement);
  cache.clear();
  for (const name of TOKENS) {
    cache.set(name, root.getPropertyValue(`--${name}`).trim());
  }
}

/**
 * Get the resolved colour value of a --sl-* token.
 * Pass the token name without the leading `--`, e.g. `getThemeToken('sl-accent-primary')`.
 * Returns an empty string if the token isn't registered above.
 */
export function getThemeToken(name) {
  if (!initialised) readAll();
  return cache.get(name) || '';
}

/**
 * Subscribe to theme changes. The callback fires after the cache has been
 * re-read with the new theme's values, so callers can immediately call
 * getThemeToken(...) to get fresh values.
 * Returns an unsubscribe function.
 */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Initialise the bridge. Call once at boot, after document is parsed.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initThemeBridge() {
  if (initialised) return;
  readAll();
  initialised = true;
  observer = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.attributeName === 'data-theme')) {
      readAll();
      for (const fn of listeners) {
        try { fn(); } catch (e) { console.error('[theme-bridge] listener failed', e); }
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
