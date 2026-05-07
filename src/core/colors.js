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

const DEFAULT_ACTIVE    = '#8aff8c';
const DEFAULT_VARIABLES = [];
const DEFAULT_SWATCHES  = [];

// Subscribers for each slot. Listeners receive the new value (or undefined
// for variables/swatches — caller re-reads via the getters).
const listeners = {
  active:    new Set(),
  variables: new Set(),
  swatches:  new Set(),
};

// Live state — initialised from localStorage on first access.
let _active    = null;
let _variables = null;
let _swatches  = null;

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
    _active = readJSON(LS_ACTIVE, DEFAULT_ACTIVE);
    if (typeof _active !== 'string' || !/^#[0-9a-f]{6}$/i.test(_active)) {
      _active = DEFAULT_ACTIVE;
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
}

function isValidVar(v) {
  return v && typeof v.name === 'string' && v.name.startsWith('--') &&
         typeof v.value === 'string' && /^#[0-9a-f]{6}$/i.test(v.value);
}

function emit(slot) {
  for (const fn of listeners[slot]) {
    try { fn(); } catch (e) { console.error('[colors] listener threw', e); }
  }
}

// ---------------------------------------------------------------------------
// Active colour
// ---------------------------------------------------------------------------

export function getActive() {
  ensureLoaded();
  return _active;
}

export function setActive(hex) {
  ensureLoaded();
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  const next = hex.toLowerCase();
  if (next === _active) return;
  _active = next;
  writeJSON(LS_ACTIVE, _active);
  emit('active');
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
