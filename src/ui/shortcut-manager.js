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
function effectiveCombos(spec) {
  const rt = getRuntime();
  const override = rt.overrides[spec.id];
  if (override) return normaliseCombos(override);
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
function checkConflicts() {
  const rt = getRuntime();
  const seen = new Map(); // `${scope}|${combo}` → id
  for (const spec of rt.bindings.values()) {
    for (const combo of effectiveCombos(spec)) {
      const key = `${spec.scope}|${combo}`;
      if (seen.has(key) && seen.get(key) !== spec.id) {
        // eslint-disable-next-line no-console
        console.warn(`[shortcut-manager] conflict: "${combo}" in scope "${spec.scope}" → ${seen.get(key)} vs ${spec.id}`);
      } else {
        seen.set(key, spec.id);
      }
    }
  }
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
    overridden:   !!rt.overrides[spec.id],
  }));
}

export function setOverride(id, combo) {
  const rt = getRuntime();
  const normalised = normaliseCombos(combo);
  if (!normalised.length) { delete rt.overrides[id]; }
  else                    { rt.overrides[id] = normalised.join(' / '); }
  persistOverrides();
  checkConflicts();
}

export function clearOverride(id) {
  const rt = getRuntime();
  delete rt.overrides[id];
  persistOverrides();
  checkConflicts();
}

export function resetAllOverrides() {
  const rt = getRuntime();
  rt.overrides = {};
  persistOverrides();
}

// ---------- Router ----------

// Try to dispatch a matching binding for the event. Returns true if
// something fired.
function dispatch(e, captureOnly) {
  const rt = getRuntime();
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
      try {
        spec.action(e, { activeScope: activeScope() });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[shortcut-manager] action "${spec.id}" threw:`, err);
      }
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
    // For dev-tools poking — read-only access to the live runtime.
    _runtime: getRuntime,
  };
}
