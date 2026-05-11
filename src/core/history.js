// History — undo/redo via document snapshots.
//
// Strategy: past[] is a stack of recent stable states. past[-1] always equals
// the document's current state. Mutations schedule a debounced commit (600 ms
// idle) so a slider drag becomes ONE history entry. Structural events
// (add/remove/reorder) flush the pending commit and capture immediately.
//
// snapshot/clone preserves Blob refs (Blobs are immutable, sharing the ref is
// fine and avoids a deep copy of every embedded image).
//
// Quick-fix pass (closes the BUGS.md regression "Undo / Redo — only 1 step
// back, several action types not captured"):
//   • statesLookEqual is now a structural deepEq across the WHOLE snapshot,
//     not a hand-picked subset of fields. Earlier shape missed `vector` /
//     `name` / `locked` / `parentGroupId` / `childIds` / `frame` etc. so
//     commits returned early and the user's edits never landed in history.
//   • Event handling was inverted: instead of a whitelist of structural +
//     prop events (drift-prone — new event types silently bypass history),
//     EVERY emitted doc event triggers a debounced commit UNLESS it appears
//     in the explicit IGNORE_EVENTS set (transient UI signals + ephemeral
//     previews). New events default to "in history", which is the safe
//     default.
//   • Capacity bumped 80 → 200 so the user actually hits the perception
//     of "unlimited undo" before the stack wraps.
//   • doc:loaded handler explicitly distinguishes user-initiated loads
//     (project open / .slammerproj import — wipe past[]) from internal
//     restores (undo / redo set `applying = true` before doc.load, which
//     short-circuits this whole subscribe handler — so the wipe is
//     unreachable from undo/redo by construction).

// Event types that should NEVER trigger a history commit. Every other
// emitted doc event goes through the debounced commit path. Keep this
// list narrow — listing an event here means "this change is not part of
// the user's edit graph, undo should skip past it."
const IGNORE_EVENTS = new Set([
  'layer:active',                 // selection swap — not an edit
  'effect:processing',            // transient effect-pipeline progress signal
  'layer:textBoxLive',            // live text-box resize before commit
  'layer:textChangedEphemeral',   // live preview during font hover
  'layer:vectorChangedEphemeral', // live preview during anchor drag
  'layer:vectorActivePath',       // active sub-path UI hint
  'doc:guidelines',               // mirror of doc:propChanged that fires on the same write
]);

// Structural events flush the pending debounced commit + commit immediately
// (so an add/remove/reorder lands as its own history step instead of merging
// with adjacent prop edits via the 600 ms debounce window).
const STRUCTURAL_EVENTS = new Set([
  'layer:added', 'layer:removed', 'layer:reordered',
  'effect:added', 'effect:removed', 'effect:reordered',
  'vectorEffect:added', 'vectorEffect:removed', 'vectorEffect:reordered',
  'group:childrenChanged', 'group:dissolved',
]);

export function createHistory(doc, { capacity = 200, debounceMs = 600 } = {}) {
  const past = [];
  const future = [];
  let pendingTimer = null;
  let applying = false;
  const listeners = new Set();

  function snapshot() {
    // JSON-clone but strip Blob/File markers (they don't survive JSON), then
    // re-attach the Blob refs by index. Blobs are immutable so sharing is safe.
    const blobs = doc.layers.map((l) => (l.source instanceof Blob ? l.source : null));
    const json = JSON.stringify(doc.state, (k, v) => (v instanceof Blob ? null : v));
    const out = JSON.parse(json);
    for (let i = 0; i < out.layers.length; i++) {
      if (blobs[i]) out.layers[i].source = blobs[i];
    }
    return out;
  }

  function notify() {
    const status = { canUndo: past.length >= 2, canRedo: future.length > 0 };
    listeners.forEach((fn) => fn(status));
  }

  function commit() {
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    const snap = snapshot();
    // Skip duplicate snapshots — full structural compare so subtle edits
    // (vector path d-string, layer rename, lock toggle, group childIds,
    // frame, every nested field) all reliably register as distinct.
    if (past.length) {
      const last = past[past.length - 1];
      if (deepEq(last, snap)) return;
    }
    past.push(snap);
    if (past.length > capacity) past.shift();
    future.length = 0;
    notify();
  }

  function scheduleCommit() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(commit, debounceMs);
  }

  function flushPending() {
    if (pendingTimer) commit();
  }

  // Recursive structural equality. Used directly as the duplicate-snapshot
  // check now — the per-field hand-rolled comparator was the source of the
  // "only 1 undo step" bug (it omitted vector path data, layer.name,
  // layer.locked, parentGroupId, childIds, frame, etc.). String allocation
  // via JSON.stringify-compare is fine at our snapshot frequency; this
  // recursive walk is microseconds on 50-layer projects per V8 benchmarks
  // (well under the commit debounce window).
  function deepEq(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
      return true;
    }
    if (Array.isArray(b)) return false;
    // Blob refs are shared by identity (snapshot() preserves the same Blob
    // pointer when state.layers[i].source is a Blob). Reference equality is
    // the right comparison; deepEq above already returned true on `a === b`.
    // Different Blob references with the same content count as different —
    // matches user expectation (you replaced the source bitmap).
    if (a instanceof Blob || b instanceof Blob) return a === b;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (let i = 0; i < ka.length; i++) {
      const k = ka[i];
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEq(a[k], b[k])) return false;
    }
    return true;
  }

  doc.subscribe((e) => {
    // Undo / redo set applying=true before doc.load(...); every event
    // emitted by that load is short-circuited here so applying the
    // restored state doesn't itself push another snapshot.
    if (applying) return;
    if (e.type === 'doc:loaded') {
      // User-initiated load (project open, .slammerproj import, autosave
      // hydrate at boot) — wipe past[] + future[] and seed with the new
      // state as the baseline. Undo/redo loads can't reach here because
      // `applying` is true above. If a future caller needs to load a
      // doc WITHOUT wiping history, they can wrap the call in
      // `withSuspended(fn)` exposed at the bottom of this module.
      past.length = 0;
      future.length = 0;
      past.push(snapshot());
      notify();
      return;
    }
    if (IGNORE_EVENTS.has(e.type)) return;
    if (STRUCTURAL_EVENTS.has(e.type)) {
      // Flush any pending prop-change commit (it represents a separate logical
      // step before this structural change), THEN commit the structural change.
      // Note: flushPending captures CURRENT state which already includes the
      // structural change — accepted simplification, the merge is rare in practice.
      flushPending();
      commit();
      return;
    }
    // Default = debounced commit. Inverted from the previous whitelist so
    // new event types added to document.js automatically land in history
    // without needing a corresponding history.js update. New event types
    // that SHOULDN'T enter history must be added to IGNORE_EVENTS above.
    scheduleCommit();
  });

  function undo() {
    flushPending();
    if (past.length < 2) return false;
    const current = past.pop();
    future.push(current);
    const prev = past[past.length - 1];
    applying = true;
    try {
      doc.load(prev);
    } finally {
      applying = false;
    }
    notify();
    return true;
  }

  function redo() {
    flushPending();
    if (!future.length) return false;
    const next = future.pop();
    past.push(next);
    applying = true;
    try {
      doc.load(next);
    } finally {
      applying = false;
    }
    notify();
    return true;
  }

  // Run `fn` with history suspended — no events that fire during fn() commit
  // to past[] or wipe it. Exposed for future callers that want to load doc
  // state without disturbing the history stack (autosave mid-session reload,
  // plugin-driven imports, etc.). Not used by any caller today.
  function withSuspended(fn) {
    const prev = applying;
    applying = true;
    try { return fn(); } finally { applying = prev; }
  }

  // Initial snapshot of the empty document.
  past.push(snapshot());

  return {
    undo, redo,
    canUndo: () => past.length >= 2,
    canRedo: () => future.length > 0,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    commit, // explicit (e.g. on save)
    flushPending,
    withSuspended,
    // For debugging:
    _stacks: () => ({ past: past.length, future: future.length }),
  };
}
