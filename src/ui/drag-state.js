// Cross-module fallback for in-app HTML5 drags.
//
// `dataTransfer.setData('application/x-slammer-layer', id)` is the standard
// way to pass an in-app drag payload, but in practice browsers (and libs like
// SortableJS, which is also attached to the layer list) can call
// `dataTransfer.clearData()` between `dragstart` and `drop`. We back the
// dataTransfer up with a plain module variable so the drop target can recover
// the layer id even when getData returns empty.
//
// Important: we DON'T clear on `dragend`. Some browsers fire `dragend` on
// the source before `drop` reaches the target, which would race to wipe the
// fallback before drop reads it. The id is overwritten on the next `dragstart`
// instead — so it lingers for one drag cycle, which is fine because the drop
// handler also checks `dataTransfer.types` to confirm it's a layer drop, not
// a file drop with a stale layer id from earlier.

let _draggingLayerId = null;

export function setDraggingLayer(id) { _draggingLayerId = id; }
export function getDraggingLayer() { return _draggingLayerId; }
export function clearDraggingLayer() { _draggingLayerId = null; }
