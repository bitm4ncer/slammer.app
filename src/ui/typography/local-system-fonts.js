// local-system-fonts — surface every installed system font via the
// Local Font Access API (Chromium / Edge). Falls back to the bundled four
// system faces on browsers without the API or when the user denies permission.
//
// The API requires a user gesture to grant permission, so we cache the result
// in localStorage once we have it — re-prompting only if explicitly asked.

const STORE_GRANTED = 'slammer:fonts:localGranted';

const _listeners = new Set();
let _systemFonts = null; // either null (not loaded) or array

export function onSystemFontsChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
function emit() { for (const fn of _listeners) try { fn(); } catch {} }

export function isSupported() {
  return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
}

export function getSystemFonts() {
  return _systemFonts;
}

// Try to load — if the user has granted permission before, this resolves
// silently. Otherwise it triggers the browser permission prompt.
// Returns the list (or null on failure).
export async function loadSystemFonts({ requestPermission = false } = {}) {
  if (!isSupported()) return null;
  // Some browsers gate this behind a permission. Check first if available.
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'local-fonts' });
      if (status.state === 'denied' && !requestPermission) return null;
    }
  } catch {}

  try {
    const fonts = await window.queryLocalFonts();
    // Group by family — each font may report many style entries (Bold, Italic…).
    const byFamily = new Map();
    for (const f of fonts) {
      if (!byFamily.has(f.family)) {
        byFamily.set(f.family, {
          family: f.family,
          source: 'system',
          category: 'sans-serif',
          weights: [],
          italic: false,
          variable: false,
          axes: [],
          installed: true,
        });
      }
      const rec = byFamily.get(f.family);
      // Heuristic style mining from postscriptName / fullName.
      const name = (f.fullName || f.postscriptName || '').toLowerCase();
      if (/italic|oblique/.test(name)) rec.italic = true;
      const wMatch = name.match(/(thin|extralight|light|regular|medium|semibold|bold|extrabold|black)/);
      if (wMatch) {
        const map = { thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
        const w = map[wMatch[1]];
        if (w && !rec.weights.includes(w)) rec.weights.push(w);
      }
    }
    const arr = [...byFamily.values()].map((rec) => {
      if (!rec.weights.length) rec.weights.push(400);
      rec.weights.sort((a, b) => a - b);
      return rec;
    }).sort((a, b) => a.family.localeCompare(b.family));
    _systemFonts = arr;
    try { localStorage.setItem(STORE_GRANTED, '1'); } catch {}
    emit();
    return arr;
  } catch (e) {
    console.warn('[fonts] queryLocalFonts failed', e);
    return null;
  }
}

export function wasPreviouslyGranted() {
  try { return localStorage.getItem(STORE_GRANTED) === '1'; } catch { return false; }
}
