// active-tool — central store for the currently-active editing tool.
//
// Tools:
//   'select'        — default — black-arrow / Konva.Transformer
//   'directSelect'  — white-arrow / per-anchor handles (13b)
//   'pen'           — bezier path drawing (13b)
//   'pencil'        — freehand → simplified bezier (13b)
//   'shape:rect'    — drag to draw rectangle
//   'shape:ellipse' — drag to draw ellipse
//   'shape:polygon' — drag to draw polygon (default 6 sides)
//   'shape:star'    — drag to draw 5-point star
//   'shape:line'    — drag to draw straight line

const _listeners = new Set();
let _tool = 'select';
let _lastShape = 'shape:rect';   // remembered for the Shape button's default click

export function getTool() { return _tool; }

export function setTool(tool) {
  if (tool === _tool) return;
  _tool = tool;
  if (tool.startsWith('shape:')) _lastShape = tool;
  for (const fn of _listeners) try { fn(_tool); } catch {}
}

export function getLastShape() { return _lastShape; }

export function onToolChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// Tool → CSS cursor mapping (set on the canvas container).
export const TOOL_CURSORS = {
  select:        '',
  directSelect:  'default',
  pen:           'crosshair',
  pencil:        'cell',
  'shape:rect':    'crosshair',
  'shape:ellipse': 'crosshair',
  'shape:polygon': 'crosshair',
  'shape:star':    'crosshair',
  'shape:line':    'crosshair',
};
