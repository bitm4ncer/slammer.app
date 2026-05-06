// History — undo/redo via document snapshots.
//
// Strategy: past[] is a stack of recent stable states. past[-1] always equals
// the document's current state. Mutations schedule a debounced commit (600 ms
// idle) so a slider drag becomes ONE history entry. Structural events
// (add/remove/reorder) flush the pending commit and capture immediately.
//
// snapshot/clone preserves Blob refs (Blobs are immutable, sharing the ref is
// fine and avoids a deep copy of every embedded image).

const STRUCTURAL_EVENTS = new Set([
  'layer:added', 'layer:removed', 'layer:reordered',
  'effect:added', 'effect:removed', 'effect:reordered',
  'vectorEffect:added', 'vectorEffect:removed', 'vectorEffect:reordered',
  'group:childrenChanged', 'group:dissolved',
]);

const PROP_EVENTS = new Set([
  'layer:propChanged', 'layer:transform', 'layer:textChanged', 'layer:vectorChanged',
  'effect:propChanged', 'vectorEffect:propChanged',
  'layer:sourceChanged', 'doc:exportFrame',
  // Document-level prop changes (project rename, …) — debounced like layer
  // props so a typing-rename becomes one history entry.
  'doc:propChanged',
]);

export function createHistory(doc, { capacity = 80, debounceMs = 600 } = {}) {
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
    // Skip duplicate snapshots.
    if (past.length) {
      const last = past[past.length - 1];
      // Cheap compare: layer count + ids + effect counts.
      if (statesLookEqual(last, snap)) return;
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

  function statesLookEqual(a, b) {
    if (a.name !== b.name) return false;
    if (JSON.stringify(a.exportFrame) !== JSON.stringify(b.exportFrame)) return false;
    if (a.layers.length !== b.layers.length) return false;
    for (let i = 0; i < a.layers.length; i++) {
      const la = a.layers[i], lb = b.layers[i];
      if (la.id !== lb.id) return false;
      if (la.effects.length !== lb.effects.length) return false;
      // Detailed param equality: stringify just the effects (small).
      if (JSON.stringify(la.effects) !== JSON.stringify(lb.effects)) return false;
      if (la.opacity !== lb.opacity) return false;
      if (la.visible !== lb.visible) return false;
      if (la.blendMode !== lb.blendMode) return false;
      if (JSON.stringify(la.transform) !== JSON.stringify(lb.transform)) return false;
      if (la.type === 'text' && JSON.stringify(la.text) !== JSON.stringify(lb.text)) return false;
    }
    return a.activeLayerId === b.activeLayerId;
  }

  doc.subscribe((e) => {
    if (applying) return;
    if (e.type === 'doc:loaded') {
      // After a load, the past should be reset to this state as the new baseline
      // (unless we're applying an undo/redo, which sets `applying`).
      past.length = 0;
      future.length = 0;
      past.push(snapshot());
      notify();
      return;
    }
    if (STRUCTURAL_EVENTS.has(e.type)) {
      // Flush any pending prop-change commit (it represents a separate logical step
      // before this structural change), THEN commit the structural change.
      // Note: flushPending captures CURRENT state which already includes the
      // structural change — accepted simplification, the merge is rare in practice.
      flushPending();
      commit();
    } else if (PROP_EVENTS.has(e.type)) {
      scheduleCommit();
    } else if (e.type === 'layer:active') {
      // Active layer changes shouldn't add to history — they don't affect output.
      // But if a slider drag is pending, let it stay pending.
    }
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

  // Initial snapshot of the empty document.
  past.push(snapshot());

  return {
    undo, redo,
    canUndo: () => past.length >= 2,
    canRedo: () => future.length > 0,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    commit, // explicit (e.g. on save)
    flushPending,
    // For debugging:
    _stacks: () => ({ past: past.length, future: future.length }),
  };
}
