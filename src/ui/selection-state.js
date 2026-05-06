// selection-state — shared multi-layer selection.
//
// Lives outside the Document so the layer-panel + canvas-view + keyboard
// shortcuts + Konva.Transformer all read the same source of truth. The
// Document still owns `activeLayerId` (= the most recent click); when the
// selection has more than one layer the active one is the "anchor" used
// by Shift-range selections.
//
// Listeners receive the new selection set on every change. For perf,
// updates compare incoming vs current and skip emit when nothing changes.

const _selected = new Set();
const _listeners = new Set();
let _anchor = null;

function snapshot() { return new Set(_selected); }

function emit() {
  const snap = snapshot();
  for (const fn of _listeners) {
    try { fn(snap, _anchor); } catch (e) { console.error('[selection]', e); }
  }
}

function eq(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function getSelection() { return snapshot(); }
export function getSelectionArray() { return [..._selected]; }
export function getAnchor() { return _anchor; }
export function isSelected(id) { return _selected.has(id); }
export function selectionSize() { return _selected.size; }

export function setSelection(ids, anchor = null) {
  const next = new Set(ids || []);
  const same = eq(_selected, next) && _anchor === (anchor ?? _anchor);
  if (same) return;
  _selected.clear();
  for (const id of next) _selected.add(id);
  _anchor = anchor != null ? anchor : (next.size ? [..._selected].pop() : null);
  emit();
}

export function clearSelection() {
  if (!_selected.size && _anchor == null) return;
  _selected.clear();
  _anchor = null;
  emit();
}

export function addToSelection(id) {
  if (id == null || _selected.has(id)) return;
  _selected.add(id);
  _anchor = id;
  emit();
}

export function removeFromSelection(id) {
  if (!_selected.has(id)) return;
  _selected.delete(id);
  if (_anchor === id) _anchor = _selected.size ? [..._selected].pop() : null;
  emit();
}

export function toggleInSelection(id) {
  if (_selected.has(id)) removeFromSelection(id);
  else addToSelection(id);
}

// Replace the selection with [id] only — same anchor semantics as the
// existing Document.setActiveLayer behavior. Use this for plain clicks.
export function selectOnly(id) {
  if (id == null) return clearSelection();
  if (_selected.size === 1 && _selected.has(id) && _anchor === id) return;
  _selected.clear();
  _selected.add(id);
  _anchor = id;
  emit();
}

// Range-select between the current anchor and `id`, given a flat ordered
// list of ALL layer IDs (panel order, top-of-stack first or whatever the
// caller's convention is). Adds the inclusive range to the set.
export function selectRange(id, orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return selectOnly(id);
  const a = _anchor != null ? orderedIds.indexOf(_anchor) : -1;
  const b = orderedIds.indexOf(id);
  if (b < 0) return;
  if (a < 0) return selectOnly(id);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  _selected.clear();
  for (let i = lo; i <= hi; i++) _selected.add(orderedIds[i]);
  _anchor = id;
  emit();
}

export function onSelectionChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
