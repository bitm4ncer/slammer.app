// Compact XY picker — small square with a draggable dot. Returns
// percentages (0-100) for both axes. Used for "Center X / Center Y"
// style controls (Radial Blur centre, Bulge centre, Ripple centre…).
//
// Drag the dot anywhere inside the square to set both axes in one
// gesture. Shift snaps to a 5% grid. Double-click resets to defaults.
// Arrow keys nudge when focused.

import { createNumericInput } from './numeric-input.js';

/**
 * @param {Object} opts
 * @param {number} opts.x               Initial X (0-100).
 * @param {number} opts.y               Initial Y (0-100).
 * @param {number} [opts.size]          Square size in px (default 88).
 * @param {number} [opts.defaultX]      Reset X (default 50).
 * @param {number} [opts.defaultY]      Reset Y (default 50).
 * @param {(v:{x:number,y:number})=>void} opts.onChange
 */
export function createXYPadWidget({
  x = 50, y = 50,
  size = 88,
  defaultX = 50, defaultY = 50,
  onChange,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-xy-widget';

  const pad = document.createElement('div');
  pad.className = 'effect-xy-pad';
  pad.style.width = `${size}px`;
  pad.style.height = `${size}px`;
  pad.tabIndex = 0;
  wrap.appendChild(pad);

  // Cross-hair guides
  const hLine = document.createElement('div');
  hLine.className = 'effect-xy-hline';
  pad.appendChild(hLine);
  const vLine = document.createElement('div');
  vLine.className = 'effect-xy-vline';
  pad.appendChild(vLine);

  // Centre tick
  const center = document.createElement('div');
  center.className = 'effect-xy-center';
  pad.appendChild(center);

  const dot = document.createElement('div');
  dot.className = 'effect-xy-dot';
  pad.appendChild(dot);

  const readout = document.createElement('div');
  readout.className = 'effect-xy-readout';
  pad.appendChild(readout);

  // Numeric stack
  const nums = document.createElement('div');
  nums.className = 'effect-xy-nums';
  wrap.appendChild(nums);

  const xNum = createNumericInput({
    min: 0, max: 100, step: 1, value: Math.round(x), suffix: '%',
    onChange: (v) => { state.x = clamp(v, 0, 100); paint(); emit(); },
  });
  nums.appendChild(row('X', xNum));

  const yNum = createNumericInput({
    min: 0, max: 100, step: 1, value: Math.round(y), suffix: '%',
    onChange: (v) => { state.y = clamp(v, 0, 100); paint(); emit(); },
  });
  nums.appendChild(row('Y', yNum));

  const state = {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100),
  };

  function paint() {
    const px = (state.x / 100) * size;
    const py = (state.y / 100) * size;
    dot.style.left = `${px}px`;
    dot.style.top = `${py}px`;
    hLine.style.top = `${py}px`;
    vLine.style.left = `${px}px`;
    readout.textContent = `${Math.round(state.x)} · ${Math.round(state.y)}`;
    xNum.setValue(Math.round(state.x));
    yNum.setValue(Math.round(state.y));
  }

  function emit() {
    onChange?.({ x: state.x, y: state.y });
  }

  function pointerToValues(e) {
    const rect = pad.getBoundingClientRect();
    let nx = ((e.clientX - rect.left) / rect.width) * 100;
    let ny = ((e.clientY - rect.top) / rect.height) * 100;
    if (e.shiftKey) {
      nx = Math.round(nx / 5) * 5;
      ny = Math.round(ny / 5) * 5;
    }
    return { x: clamp(nx, 0, 100), y: clamp(ny, 0, 100) };
  }

  let dragging = false;
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    pad.setPointerCapture(e.pointerId);
    pad.classList.add('is-dragging');
    const v = pointerToValues(e);
    state.x = v.x; state.y = v.y;
    paint(); emit();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const v = pointerToValues(e);
    state.x = v.x; state.y = v.y;
    paint(); emit();
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    pad.classList.remove('is-dragging');
    try { pad.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  pad.addEventListener('pointerup', endDrag);
  pad.addEventListener('pointercancel', endDrag);

  pad.addEventListener('dblclick', (e) => {
    e.preventDefault();
    state.x = defaultX; state.y = defaultY;
    paint(); emit();
  });

  pad.addEventListener('keydown', (e) => {
    let handled = false;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft')  { state.x = clamp(state.x - step, 0, 100); handled = true; }
    if (e.key === 'ArrowRight') { state.x = clamp(state.x + step, 0, 100); handled = true; }
    if (e.key === 'ArrowUp')    { state.y = clamp(state.y - step, 0, 100); handled = true; }
    if (e.key === 'ArrowDown')  { state.y = clamp(state.y + step, 0, 100); handled = true; }
    if (handled) { e.preventDefault(); paint(); emit(); }
  });

  paint();

  wrap.setValue = (v) => {
    if (v?.x !== undefined) state.x = clamp(v.x, 0, 100);
    if (v?.y !== undefined) state.y = clamp(v.y, 0, 100);
    paint();
  };

  return wrap;
}

function row(label, control) {
  const r = document.createElement('label');
  r.className = 'effect-xy-num-row';
  const lbl = document.createElement('span');
  lbl.className = 'effect-label';
  lbl.textContent = label;
  r.appendChild(lbl);
  r.appendChild(control);
  return r;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
