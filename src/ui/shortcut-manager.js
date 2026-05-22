// shortcut-manager — central registry + router for app keyboard shortcuts.
//
// Phase 21b foundation. See ../../../roadmap.md (Phase 21b — Shortcut Manager)
// and CLAUDE.md (Multi-Model Orchestration → routing decision tree).
//
// Single source of truth for every REBINDABLE app shortcut. Component-
// lifecycle listeners (modal Esc closers, input commit/revert Enter/Esc,
// knob/numeric-input arrow keys) stay where they are — they're not user-
// rebindable and don't belong here. See the Phase 1 audit in the plan
// file for the full categorisation.
//
// API surface (also exposed on `window.__slammer.shortcuts`):
//   registerShortcut(spec)        - idempotent on `id`. Hot-replace OK.
//   unregisterShortcut(id)
//   pushScope(name)               - e.g. `tool:pen`, `text-edit`
//   popScope(name)                - removes the LAST instance of `name`
//   activeScope()                 - top of stack
//   getBindings()                 - read-only list with override applied
//   setOverride(id, combo)        - persist user remap
//   clearOverride(id)
//   resetAllOverrides()
//
// Router order on keydown:
//   1. Build canonical combo string for the event.
//   2. Walk the scope stack top-down. For each scope, find a binding
//      whose (scope === entry.scope) AND combo matches.
//   3. If found:
//        a. If `isTyping(target)` AND the binding's `scope === 'global'`
//           AND it doesn't opt-in via `allowInTextInput: true` → bail.
//        b. Run action(e). preventDefault by default unless the spec
//           says otherwise. (`stopPropagation` is NOT called — we want
//           modal Esc closers to still see Escape if a binding hasn't
//           consumed it.)
//   4. No-op if no match. The event keeps flowing to legacy listeners,
//      which is what we want during the migration window.
//
// HMR safety: the registry is stored on `window.__slammerShortcutsRuntime`
// so the module's identity surviving an HMR reload doesn't double-register
// the router or duplicate bindings.

import { comboFromEvent, normaliseCombos, isTyping } from './shortcuts/helpers.js';
import { defaultShortcuts } from './shortcuts/defaults.js';

const STORAGE_KEY = 'slammer:shortcuts';
const RUNTIME_KEY = '__slammerShortcutsRuntime';

// Singleton runtime — survives HMR.
function getRuntime() {
  let rt = window[RUNTIME_KEY];
  if (rt) return rt;
  rt = {
    bindings: new Map(),     // id → spec (normalised)
    overrides: loadOverrides(),
    scopeStack: ['global'],
    routerInstalled: false,
    captureRouterInstalled: false,
    // Set of `${scope}|${combo}` keys we've already warned about, so
    // boot-time registration doesn't spam the console with the same
    // collision N×N times. Cleared whenever a binding or override
    // changes so a NEW conflict still gets a fresh warning.
    warnedConflicts: new Set(),
  };
  window[RUNTIME_KEY] = rt;
  return rt;
}

function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
}

function persistOverrides() {
  const rt = getRuntime();
  try {
    if (Object.keys(rt.overrides).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(rt.overrides));
  } catch { /* quota / private mode — fine, runtime keeps the override in memory */ }
}

// Resolve the active combos for a binding: user override (if set) else
// the spec's defaultKeys. Returns array of canonical combo strings.
//
// A KEY EXISTS in `rt.overrides` even when its value is the empty
// string — that represents an explicitly UNBOUND binding (user pressed
// "Replace anyway" in a conflict resolution, leaving the displaced
// binding without a combo). `clearOverride` removes the key entirely
// to fall back on defaults; `unbindBinding` leaves the key with an
// empty string.
function effectiveCombos(spec) {
  const rt = getRuntime();
  const id = spec.id;
  if (Object.prototype.hasOwnProperty.call(rt.overrides, id)) {
    return normaliseCombos(rt.overrides[id]);
  }
  return normaliseCombos(spec.defaultKeys);
}

// Validate + normalise a spec into the shape the router consumes.
function normaliseSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('shortcut spec must be an object');
  if (!spec.id || typeof spec.id !== 'string') throw new Error('shortcut spec requires id');
  if (typeof spec.action !== 'function') throw new Error(`shortcut "${spec.id}" requires action`);
  const out = {
    id:               spec.id,
    label:            spec.label || spec.id,
    defaultKeys:      spec.defaultKeys || [],
    scope:            spec.scope || 'global',
    category:         spec.category || 'Edit',
    description:      spec.description || '',
    preventDefault:   spec.preventDefault !== false, // default true
    capture:          spec.capture === true,
    allowInTextInput: spec.allowInTextInput === true,
    action:           spec.action,
  };
  out._defaultCombos = normaliseCombos(out.defaultKeys);
  return out;
}

// Conflict check — dev-only warning. Two bindings within the SAME scope
// resolving to the SAME combo will both want to fire and order becomes
// undefined. Cross-scope collisions are fine (active-scope wins).
//
// Each unique (scope, combo) collision warns AT MOST ONCE per app
// session — boot-time registration calls this 45+ times, but a real
// collision only logs once. Set `rt.warnedConflicts.clear()` (called
// implicitly on any override change) to surface a fresh warning after
// the user remaps something.
//
// Returns a Map of `${scope}|${combo}` → [id, id, …] for callers that
// need to react programmatically (the remap UI uses this to surface
// "Conflicts with X" before saving).
function checkConflicts() {
  const rt = getRuntime();
  const seen = new Map(); // `${scope}|${combo}` → id
  const collisions = new Map(); // key → array of ids in collision
  for (const spec of rt.bindings.values()) {
    for (const combo of effectiveCombos(spec)) {
      const key = `${spec.scope}|${combo}`;
      if (seen.has(key) && seen.get(key) !== spec.id) {
        const otherId = seen.get(key);
        if (!collisions.has(key)) collisions.set(key, [otherId]);
        collisions.get(key).push(spec.id);
        if (!rt.warnedConflicts.has(key)) {
          rt.warnedConflicts.add(key);
          // eslint-disable-next-line no-console
          console.warn(`[shortcut-manager] conflict: "${combo}" in scope "${spec.scope}" → ${otherId} vs ${spec.id}`);
        }
      } else {
        seen.set(key, spec.id);
      }
    }
  }
  return collisions;
}

// Look up which existing binding (if any) would collide if `combo`
// were set on `excludeId` in `scope`. Used by the remap UI before
// committing an override — returns `{ id, label, overridden }` for
// the colliding binding, or null when the combo is free.
export function findCollision(combo, scope, excludeId) {
  const rt = getRuntime();
  const target = normaliseCombos(combo);
  if (!target.length) return null;
  for (const spec of rt.bindings.values()) {
    if (spec.id === excludeId) continue;
    if (spec.scope !== scope) continue;
    const combos = effectiveCombos(spec);
    if (combos.some((c) => target.includes(c))) {
      return {
        id: spec.id,
        label: spec.label,
        overridden: !!rt.overrides[spec.id],
      };
    }
  }
  return null;
}

// ---------- Public API ----------

export function registerShortcut(spec) {
  const rt = getRuntime();
  const norm = normaliseSpec(spec);
  rt.bindings.set(norm.id, norm);
  checkConflicts();
  return () => unregisterShortcut(norm.id);
}

export function registerShortcuts(specs) {
  const offs = specs.map(registerShortcut);
  return () => offs.forEach((off) => off());
}

export function unregisterShortcut(id) {
  const rt = getRuntime();
  rt.bindings.delete(id);
}

export function pushScope(name) {
  const rt = getRuntime();
  rt.scopeStack.push(name);
}

export function popScope(name) {
  const rt = getRuntime();
  // Remove the LAST occurrence of name. Defensive: if the caller pops
  // out-of-order, we don't accidentally pop the wrong frame.
  for (let i = rt.scopeStack.length - 1; i > 0; i--) {
    if (rt.scopeStack[i] === name) { rt.scopeStack.splice(i, 1); return; }
  }
}

export function activeScope() {
  const rt = getRuntime();
  return rt.scopeStack[rt.scopeStack.length - 1] || 'global';
}

// Read-only snapshot for Settings UI + debugging.
export function getBindings() {
  const rt = getRuntime();
  return [...rt.bindings.values()].map((spec) => ({
    id:           spec.id,
    label:        spec.label,
    defaultKeys:  spec._defaultCombos.join(' / '),
    activeKeys:   effectiveCombos(spec).join(' / '),
    scope:        spec.scope,
    category:     spec.category,
    description:  spec.description,
    // hasOwnProperty, not truthiness — an empty-string override
    // (explicit "unbound" set by Replace-anyway) is still an override.
    overridden:   Object.prototype.hasOwnProperty.call(rt.overrides, spec.id),
  }));
}

export function setOverride(id, combo) {
  const rt = getRuntime();
  const normalised = normaliseCombos(combo);
  if (!normalised.length) { delete rt.overrides[id]; }
  else                    { rt.overrides[id] = normalised.join(' / '); }
  persistOverrides();
  // A new override can introduce a fresh collision — wipe the seen-set
  // so checkConflicts re-warns about anything that's now newly broken.
  rt.warnedConflicts.clear();
  checkConflicts();
  notifyChange();
}

export function clearOverride(id) {
  const rt = getRuntime();
  delete rt.overrides[id];
  persistOverrides();
  rt.warnedConflicts.clear();
  checkConflicts();
  notifyChange();
}

// Explicitly set a binding to UNBOUND (no key combo at all). Distinct
// from clearOverride() which reverts to the registered defaults.
// Used by the Settings remap UI's "Replace anyway" flow.
export function unbindBinding(id) {
  const rt = getRuntime();
  rt.overrides[id] = '';
  persistOverrides();
  rt.warnedConflicts.clear();
  notifyChange();
}

// Pause/resume the keydown router. Used by the Settings remap UI while
// a row is in listening mode so the next keypress fills the chip
// instead of triggering whichever shortcut was previously bound.
export function pauseRouter()  { getRuntime().routerPaused = true; }
export function resumeRouter() { getRuntime().routerPaused = false; }

export function resetAllOverrides() {
  const rt = getRuntime();
  rt.overrides = {};
  persistOverrides();
  rt.warnedConflicts.clear();
  notifyChange();
}

// ---------- Change subscription ----------
// The Settings → Shortcuts tab listens here so its rows redraw the
// moment any override changes (set / clear / reset-all). Cheap pub/
// sub — no diffing, just a redraw signal.
function notifyChange() {
  const rt = getRuntime();
  if (!rt.listeners) return;
  for (const fn of rt.listeners) { try { fn(); } catch { /* keep going */ } }
}

export function onBindingsChange(fn) {
  const rt = getRuntime();
  if (!rt.listeners) rt.listeners = new Set();
  rt.listeners.add(fn);
  return () => rt.listeners.delete(fn);
}

// ---------- Router ----------

// Try to dispatch a matching binding for the event. Returns true if
// something fired.
function dispatch(e, captureOnly) {
  const rt = getRuntime();
  // Paused by the Settings remap UI while a row is in listening mode.
  // The remap UI installs its own capture-phase keydown handler that
  // fills the chip with the next keystroke — the router must stay
  // silent so the user's "press Q to rebind" doesn't also fire the
  // currently-bound Q action.
  if (rt.routerPaused) return false;
  const combo = comboFromEvent(e);
  if (!combo) return false;

  // Walk the scope stack top-down — highest-priority scope wins.
  for (let i = rt.scopeStack.length - 1; i >= 0; i--) {
    const scope = rt.scopeStack[i];
    for (const spec of rt.bindings.values()) {
      if (spec.scope !== scope) continue;
      if (spec.capture !== captureOnly) continue;
      const combos = effectiveCombos(spec);
      if (!combos.includes(combo)) continue;

      // is-typing guard — global bindings respect it unless opted-out.
      if (spec.scope === 'global' && !spec.allowInTextInput && isTyping(e.target)) return false;

      if (spec.preventDefault) e.preventDefault();
      let result;
      try {
        result = spec.action(e, { activeScope: activeScope() });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[shortcut-manager] action "${spec.id}" threw:`, err);
      }
      // Explicit `return false` from an action means "I declined — try
      // the next matching binding." Anything else (undefined / true /
      // any value) = handled, stop scanning. This lets a tool-scoped
      // binding fall through to a global one when its state guard
      // says "not applicable right now."
      if (result === false) continue;
      return true;
    }
  }
  return false;
}

function installRouters() {
  const rt = getRuntime();
  if (!rt.routerInstalled) {
    document.addEventListener('keydown', (e) => { dispatch(e, false); });
    rt.routerInstalled = true;
  }
  if (!rt.captureRouterInstalled) {
    document.addEventListener('keydown', (e) => { dispatch(e, true); }, true);
    rt.captureRouterInstalled = true;
  }
}

// One-shot bootstrap. Called from main.js right after window.__slammer
// is set up so the registry is reachable for debugging from the
// very first keydown.
export function initShortcutManager() {
  // Drain defaults (empty in this commit; populated in subsequent
  // migration commits).
  for (const spec of defaultShortcuts) registerShortcut(spec);
  installRouters();
  return {
    registerShortcut,
    registerShortcuts,
    unregisterShortcut,
    pushScope,
    popScope,
    activeScope,
    getBindings,
    setOverride,
    clearOverride,
    resetAllOverrides,
    unbindBinding,
    findCollision,
    onBindingsChange,
    // Pause/resume the router — used by the Settings remap UI while a
    // row is in listening mode, so the next keypress fills the chip
    // instead of triggering whichever shortcut was previously bound.
    pauseRouter:  () => { getRuntime().routerPaused = true; },
    resumeRouter: () => { getRuntime().routerPaused = false; },
    // For dev-tools poking — read-only access to the live runtime.
    _runtime: getRuntime,
  };
}
