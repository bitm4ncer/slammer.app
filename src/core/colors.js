// Color system core (Phase 23) — single source of truth for the active
// drawing colour, named colour variables (e.g. `--brand`), and the user's
// favourite swatches.
//
// Three independent slots, each persisted under its own localStorage key:
//   slammer:colors:active      — last-picked colour (hex, e.g. '#ff8800')
//   slammer:colors:variables   — global named variables [{ name, value }]
//   slammer:colors:swatches    — favourite hex strings (no duplicates)
//
// Project-scoped overrides:
//   When a project loads with `state.colors.variables`, those override the
//   GLOBAL variables for that session — global storage is untouched. When
//   the project closes / a new project loads, globals come back. Saving a
//   project serialises the merged effective variables back into
//   `state.colors.variables` so the project remembers them.
//
// Public surface used by plugins is documented separately on
// `window.__slammer.colors` (wired in main.js — see 23d).

const LS_ACTIVE     = 'slammer:colors:active';
const LS_VARIABLES  = 'slammer:colors:variables';
const LS_SWATCHES   = 'slammer:colors:swatches';
const LS_GRADIENTS  = 'slammer:colors:gradients';

// Active colour — TWO-SLOT model with kind + gradient + stroke-width
// extension fields. Legacy shapes:
//   '#8aff8c'                              (Phase 23a — single colour)
//   { fill: '#8aff8c', stroke: '#000000' } (Phase 23b — two-slot solid)
// Current shape (Phase 23c):
//   {
//     fill, stroke,                        // hex strings — back-compat scalar
//     fillKind, strokeKind,                // 'solid' | 'none' | 'gradient'
//     strokeWidth,                         // px (number)
//     fillGradient, strokeGradient,        // { type:'linear', angle, stops:[{at,color}] }
//   }
// ensureLoaded() migrates any older shape silently on first read.
const DEFAULT_FILL          = '#8aff8c';
const DEFAULT_STROKE        = '#000000';
const DEFAULT_STROKE_WIDTH  = 2;
const DEFAULT_GRADIENT      = () => ({
  type: 'linear', angle: 90,
  stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }],
});
const DEFAULT_ACTIVE = {
  fill: DEFAULT_FILL,
  stroke: DEFAULT_STROKE,
  fillKind: 'solid',
  strokeKind: 'solid',
  strokeWidth: DEFAULT_STROKE_WIDTH,
  fillOpacity: 1,
  strokeOpacity: 1,
  fillGradient: DEFAULT_GRADIENT(),
  strokeGradient: DEFAULT_GRADIENT(),
};
const DEFAULT_VARIABLES = [];
const DEFAULT_SWATCHES  = [];

// Subscribers for each slot. Listeners receive the new value (or undefined
// for variables/swatches — caller re-reads via the getters).
const listeners = {
  active:    new Set(),
  variables: new Set(),
  swatches:  new Set(),
  gradients: new Set(),
};

// Live state — initialised from localStorage on first access.
let _active    = null;
let _variables = null;
let _swatches  = null;
let _gradients = null;

// Project override applies when a project is loaded with its own variables.
// Layered on top of the GLOBAL variables; getVariables() returns the merged
// effective list (project wins on name collisions).
let _projectVariables = null;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed != null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function ensureLoaded() {
  if (_active === null) {
    const raw = readJSON(LS_ACTIVE, DEFAULT_ACTIVE);
    if (typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw)) {
      // Legacy 23a — bare hex.
      _active = {
        ...DEFAULT_ACTIVE,
        fill: raw.toLowerCase(),
      };
      writeJSON(LS_ACTIVE, _active);
    } else if (raw && typeof raw === 'object') {
      _active = {
        fill:           isHex(raw.fill)   ? raw.fill.toLowerCase()   : DEFAULT_FILL,
        stroke:         isHex(raw.stroke) ? raw.stroke.toLowerCase() : DEFAULT_STROKE,
        fillKind:       isKind(raw.fillKind)       ? raw.fillKind   : 'solid',
        strokeKind:     isKind(raw.strokeKind)     ? raw.strokeKind : 'solid',
        strokeWidth:    Number.isFinite(raw.strokeWidth) ? Math.max(0, raw.strokeWidth) : DEFAULT_STROKE_WIDTH,
        fillOpacity:    Number.isFinite(raw.fillOpacity)   ? clamp01(raw.fillOpacity)   : 1,
        strokeOpacity:  Number.isFinite(raw.strokeOpacity) ? clamp01(raw.strokeOpacity) : 1,
        fillGradient:   isGradient(raw.fillGradient)   ? raw.fillGradient   : DEFAULT_GRADIENT(),
        strokeGradient: isGradient(raw.strokeGradient) ? raw.strokeGradient : DEFAULT_GRADIENT(),
      };
    } else {
      _active = { ...DEFAULT_ACTIVE };
    }
  }
  if (_variables === null) {
    const raw = readJSON(LS_VARIABLES, DEFAULT_VARIABLES);
    _variables = Array.isArray(raw) ? raw.filter(isValidVar) : [];
  }
  if (_swatches === null) {
    const raw = readJSON(LS_SWATCHES, DEFAULT_SWATCHES);
    _swatches = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)) : [];
  }
  if (_gradients === null) {
    const raw = readJSON(LS_GRADIENTS, []);
    _gradients = Array.isArray(raw) ? raw.filter(isGradient) : [];
  }
}

function isValidVar(v) {
  return v && typeof v.name === 'string' && v.name.startsWith('--') &&
         typeof v.value === 'string' && /^#[0-9a-f]{6}$/i.test(v.value);
}

function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function isKind(v) { return v === 'solid' || v === 'none' || v === 'gradient'; }
function isGradient(g) {
  return g && typeof g === 'object'
    && (g.type === 'linear' || g.type === 'radial')
    && Number.isFinite(g.angle)
    && Array.isArray(g.stops) && g.stops.length >= 2
    && g.stops.every((s) => Number.isFinite(s.at) && isHex(s.color));
}

function emit(slot) {
  for (const fn of listeners[slot]) {
    try { fn(); } catch (e) { console.error('[colors] listener threw', e); }
  }
}

// ---------------------------------------------------------------------------
// Active colour — two-slot { fill, stroke } model
// ---------------------------------------------------------------------------

// Back-compat: getActive() returns the FILL hex string. Old callers (color-
// hub.js' current build, plugins) reading "the active colour" still get a
// sensible scalar. New callers should prefer getActiveFill / getActiveStroke
// / getActiveSlots.
export function getActive() {
  ensureLoaded();
  return _active.fill;
}

export function getActiveFill()   { ensureLoaded(); return _active.fill; }
export function getActiveStroke() { ensureLoaded(); return _active.stroke; }
export function getActiveSlots()  { ensureLoaded(); return { fill: _active.fill, stroke: _active.stroke }; }

// setActive(hex) writes the FILL slot — back-compat with the legacy
// single-slot API. Use setActiveStroke / setActiveSlot for stroke writes.
export function setActive(hex) { setActiveSlot('fill', hex); }
export function setActiveFill(hex)   { setActiveSlot('fill',   hex); }
export function setActiveStroke(hex) { setActiveSlot('stroke', hex); }

export function setActiveSlot(slot, hex) {
  ensureLoaded();
  if (slot !== 'fill' && slot !== 'stroke') return;
  if (!isHex(hex)) return;
  const next = hex.toLowerCase();
  if (_active[slot] === next) return;
  _active = { ..._active, [slot]: next };
  writeJSON(LS_ACTIVE, _active);
  emit('active');
}

// Swap fill ↔ stroke. X-key shortcut + picker swap arrow both call this.
// Single emit so subscribers see one round-trip, not two. Swaps the
// COMPLETE slot (color + kind + gradient) so the swap is intuitive: a
// red stroke becomes a red fill, including its kind/gradient.
export function swapFillStroke() {
  ensureLoaded();
  _active = {
    ..._active,
    fill:           _active.stroke,
    stroke:         _active.fill,
    fillKind:       _active.strokeKind,
    strokeKind:     _active.fillKind,
    fillGradient:   _active.strokeGradient,
    strokeGradient: _active.fillGradient,
  };
  writeJSON(LS_ACTIVE, _active);
  emit('active');
}

// ---------- Kind (solid / none / gradient) ----------
export function getActiveKind(slot) {
  ensureLoaded();
  return slot === 'stroke' ? _active.strokeKind : _active.fillKind;
}
export function setActiveKind(slot, kind) {
  ensureLoaded();
  if (!isKind(kind)) return;
  const key = slot === 'stroke' ? 'strokeKind' : 'fillKind';
  if (_active[key] === kind) return;
  _active = { ..._active, [key]: kind };
  writeJSON(LS_ACTIVE, _active);
  emit('active');
}

// ---------- Opacity ----------
export function getActiveOpacity(slot) {
  ensureLoaded();
  return slot === 'stroke' ? _active.strokeOpacity : _active.fillOpacity;
}
export function setActiveOpacity(slot, opacity) {
  ensureLoaded();
  if (!Number.isFinite(opacity)) return;
  const next = clamp01(opacity);
  const key = slot === 'stroke' ? 'strokeOpacity' : 'fillOpacity';
  if (_active[key] === next) return;
  _active = { ..._active, [key]: next };
  writeJSON(LS_ACTIVE, _active);
  emit('active');
}

// ---------- Stroke width ----------
export function getActiveStrokeWidth() { ensureLoaded(); return _active.strokeWidth; }
export function setActiveStrokeWidth(w) {
  ensureLoaded();
  if (!Number.isFinite(w)) return;
  const next = Math.max(0, Math.min(200, w));
  if (_active.strokeWidth === next) return;
  _active = { ..._active, strokeWidth: next };
  writeJSON(LS_ACTIVE, _active);
  emit('active');
}

// ---------- Gradient ----------
export function getActiveGradient(slot) {
  ensureLoaded();
  return slot === 'stroke' ? _active.strokeGradient : _active.fillGradient;
}
export function setActiveGradient(slot, gradient) {
  ensureLoaded();
  if (!isGradient(gradient)) return;
  const key = slot === 'stroke' ? 'strokeGradient' : 'fillGradient';
  _active = { ..._active, [key]: gradient };
  writeJSON(LS_ACTIVE, _active);
  emit('active');
}

// Build a vector-layer-shaped fill/stroke object from the active slot.
// Used by shape-drawer / text creation so new layers inherit the active
// styling end-to-end (kind, color or gradient stops, opacity).
export function buildVectorFillFromActive() {
  ensureLoaded();
  if (_active.fillKind === 'none') return { type: 'none' };
  if (_active.fillKind === 'gradient') {
    return {
      type: 'gradient',
      gradientType: _active.fillGradient.type,
      stops: _active.fillGradient.stops.map((s) => ({ ...s })),
      // from/to filled per-path by the renderer using path bounds; angle
      // stored alongside as a hint for the editor.
      angle: _active.fillGradient.angle,
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      opacity: _active.fillOpacity,
    };
  }
  return { type: 'solid', color: _active.fill, opacity: _active.fillOpacity };
}
export function buildVectorStrokeFromActive() {
  ensureLoaded();
  const base = {
    width: _active.strokeWidth,
    align: 'center', cap: 'butt', join: 'miter',
    dash: [], alongPath: false, opacity: _active.strokeOpacity,
  };
  if (_active.strokeKind === 'none')   return { ...base, type: 'none', color: _active.stroke };
  if (_active.strokeKind === 'gradient') {
    return {
      ...base, type: 'gradient',
      gradientType: _active.strokeGradient.type,
      stops: _active.strokeGradient.stops.map((s) => ({ ...s })),
      angle: _active.strokeGradient.angle,
      from: { x: 0, y: 0 }, to: { x: 1, y: 0 },
    };
  }
  return { ...base, type: 'solid', color: _active.stroke };
}

export function onActiveChange(fn) {
  listeners.active.add(fn);
  return () => listeners.active.delete(fn);
}

// ---------------------------------------------------------------------------
// Named variables
// ---------------------------------------------------------------------------

// Returns the EFFECTIVE variables list (project overrides global). Each entry:
//   { name: '--brand', value: '#ff8800' }
export function getVariables() {
  ensureLoaded();
  if (!_projectVariables) return _variables.slice();
  // Merge: start with globals, project entries override / append.
  const byName = new Map();
  for (const v of _variables) byName.set(v.name, v);
  for (const v of _projectVariables) byName.set(v.name, v);
  return Array.from(byName.values());
}

// Set a single variable (creates if absent, updates if exists). When a
// project is loaded, writes go to the PROJECT variables; otherwise writes
// go to the global storage.
export function setVariable(name, value) {
  ensureLoaded();
  if (typeof name !== 'string' || !name.startsWith('--')) return;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return;
  const target = _projectVariables ?? _variables;
  const idx = target.findIndex((v) => v.name === name);
  const next = { name, value: value.toLowerCase() };
  if (idx >= 0) target[idx] = next; else target.push(next);
  if (target === _variables) writeJSON(LS_VARIABLES, _variables);
  emit('variables');
}

export function removeVariable(name) {
  ensureLoaded();
  const target = _projectVariables ?? _variables;
  const idx = target.findIndex((v) => v.name === name);
  if (idx < 0) return;
  target.splice(idx, 1);
  if (target === _variables) writeJSON(LS_VARIABLES, _variables);
  emit('variables');
}

export function renameVariable(oldName, newName) {
  ensureLoaded();
  if (typeof newName !== 'string' || !newName.startsWith('--')) return;
  const target = _projectVariables ?? _variables;
  const v = target.find((x) => x.name === oldName);
  if (!v) return;
  v.name = newName;
  if (target === _variables) writeJSON(LS_VARIABLES, _variables);
  emit('variables');
}

export function onVariablesChange(fn) {
  listeners.variables.add(fn);
  return () => listeners.variables.delete(fn);
}

// ---------------------------------------------------------------------------
// Swatches (favourites)
// ---------------------------------------------------------------------------

export function getSwatches() {
  ensureLoaded();
  return _swatches.slice();
}

export function addSwatch(hex) {
  ensureLoaded();
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const next = hex.toLowerCase();
  // Move to front if already present (most-recent-first).
  const existing = _swatches.indexOf(next);
  if (existing >= 0) _swatches.splice(existing, 1);
  _swatches.unshift(next);
  // Cap at 64.
  if (_swatches.length > 64) _swatches.length = 64;
  writeJSON(LS_SWATCHES, _swatches);
  emit('swatches');
}

export function removeSwatch(hex) {
  ensureLoaded();
  const idx = _swatches.indexOf(hex.toLowerCase());
  if (idx < 0) return;
  _swatches.splice(idx, 1);
  writeJSON(LS_SWATCHES, _swatches);
  emit('swatches');
}

export function onSwatchesChange(fn) {
  listeners.swatches.add(fn);
  return () => listeners.swatches.delete(fn);
}

// ---------- Saved gradients (favourites) ----------
function gradientKey(g) {
  // Cheap structural-equality key for de-dup. Order-sensitive on stops.
  return `${g.type}|${g.angle}|${g.stops.map((s) => `${s.at}@${s.color}`).join(',')}`;
}

export function getGradientSwatches() {
  ensureLoaded();
  return _gradients.slice();
}
export function addGradientSwatch(gradient) {
  ensureLoaded();
  if (!isGradient(gradient)) return;
  const next = {
    type: gradient.type,
    angle: gradient.angle,
    stops: gradient.stops.map((s) => ({ at: s.at, color: s.color.toLowerCase() })),
  };
  const key = gradientKey(next);
  // Move to front if already present (most-recent-first).
  const existing = _gradients.findIndex((g) => gradientKey(g) === key);
  if (existing >= 0) _gradients.splice(existing, 1);
  _gradients.unshift(next);
  if (_gradients.length > 32) _gradients.length = 32;
  writeJSON(LS_GRADIENTS, _gradients);
  emit('gradients');
}
export function removeGradientSwatch(gradient) {
  ensureLoaded();
  const key = gradientKey(gradient);
  const idx = _gradients.findIndex((g) => gradientKey(g) === key);
  if (idx < 0) return;
  _gradients.splice(idx, 1);
  writeJSON(LS_GRADIENTS, _gradients);
  emit('gradients');
}
export function onGradientSwatchesChange(fn) {
  listeners.gradients.add(fn);
  return () => listeners.gradients.delete(fn);
}

// ---------------------------------------------------------------------------
// Resolve a colour value (literal hex OR var reference) to a concrete hex.
// Accepts:
//   '#ff0000'                  → '#ff0000'
//   'var(--brand)'             → looked up; falls back to '#000000'
//   { kind: 'literal', value } → value
//   { kind: 'var', name }      → looked up
// ---------------------------------------------------------------------------

const VAR_REF_RE = /^var\((--[a-z0-9-_]+)\)$/i;

export function resolve(value) {
  if (value == null) return '#000000';
  if (typeof value === 'string') {
    if (value.startsWith('#')) return value;
    const m = VAR_REF_RE.exec(value);
    if (m) return resolveVarName(m[1]) || '#000000';
    return '#000000';
  }
  if (typeof value === 'object') {
    if (value.kind === 'literal') return value.value || '#000000';
    if (value.kind === 'var')     return resolveVarName(value.name) || '#000000';
  }
  return '#000000';
}

function resolveVarName(name) {
  const list = getVariables();
  const v = list.find((x) => x.name === name);
  return v ? v.value : null;
}

// ---------------------------------------------------------------------------
// Project integration — called by document.js on load + serialise.
// ---------------------------------------------------------------------------

// Apply project-scoped variables. Pass null to clear (back to globals).
export function setProjectVariables(arr) {
  if (!Array.isArray(arr)) {
    _projectVariables = null;
  } else {
    _projectVariables = arr.filter(isValidVar);
  }
  emit('variables');
}

// Snapshot the currently-effective project variables for serialisation.
// Returns null when no project overrides are active so .slammerproj stays
// minimal for projects that haven't customised colours.
export function getProjectVariablesForSerialise() {
  return _projectVariables ? _projectVariables.slice() : null;
}
