// Visual angle + distance widget — Figma/Affinity-style shadow direction control.
// Drag the handle inside the disk to set angle and distance in one gesture.
// Shift while dragging snaps angle to 15° increments.
// Double-click resets to defaults.

import { createNumericInput } from './numeric-input.js';

/**
 * @param {Object} opts
 * @param {number} opts.angle           Initial angle in degrees (0 = +X axis, 90 = down).
 * @param {number} opts.distance        Initial distance in px.
 * @param {number} opts.maxDistance     Hard cap (matches plugin model, e.g. 500).
 * @param {number} [opts.visualMax]     Distance mapped to widget edge (default 200).
 * @param {number} [opts.size]          Disk diameter in px (default 96).
 * @param {number} [opts.defaultAngle]  Reset angle (default 135).
 * @param {number} [opts.defaultDistance] Reset distance (default 12).
 * @param {(v:{angle:number,distance:number})=>void} opts.onChange
 */
export function createAngleDistanceWidget({
  angle = 135,
  distance = 12,
  maxDistance = 500,
  visualMax = 200,
  size = 96,
  defaultAngle = 135,
  defaultDistance = 12,
  onChange,
}) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-angle-widget';

  const disk = document.createElement('div');
  disk.className = 'effect-angle-disk';
  disk.style.width = `${size}px`;
  disk.style.height = `${size}px`;
  disk.tabIndex = 0;
  wrap.appendChild(disk);

  const ring = document.createElement('div');
  ring.className = 'effect-angle-ring';
  disk.appendChild(ring);

  const ticks = document.createElement('div');
  ticks.className = 'effect-angle-ticks';
  for (let i = 0; i < 8; i++) {
    const t = document.createElement('span');
    t.style.transform = `rotate(${i * 45}deg)`;
    ticks.appendChild(t);
  }
  disk.appendChild(ticks);

  const radial = document.createElement('div');
  radial.className = 'effect-angle-radial';
  disk.appendChild(radial);

  const center = document.createElement('div');
  center.className = 'effect-angle-center';
  disk.appendChild(center);

  const handle = document.createElement('div');
  handle.className = 'effect-angle-handle';
  disk.appendChild(handle);

  const readout = document.createElement('div');
  readout.className = 'effect-angle-readout';
  disk.appendChild(readout);

  // Numeric stack
  const nums = document.createElement('div');
  nums.className = 'effect-angle-nums';
  wrap.appendChild(nums);

  const angleNum = createNumericInput({
    min: 0, max: 360, step: 1,
    value: Math.round(angle),
    suffix: '°',
    onChange: (v) => {
      state.angle = ((v % 360) + 360) % 360;
      paint();
      emit();
    },
  });
  const angleRow = wrap_row('Angle', angleNum);
  nums.appendChild(angleRow);

  const distNum = createNumericInput({
    min: 0, max: maxDistance, step: 1,
    value: Math.round(distance),
    suffix: 'px',
    onChange: (v) => {
      state.distance = Math.max(0, Math.min(maxDistance, v));
      paint();
      emit();
    },
  });
  const distRow = wrap_row('Distance', distNum);
  nums.appendChild(distRow);

  const state = {
    angle: ((angle % 360) + 360) % 360,
    distance: Math.max(0, Math.min(maxDistance, distance)),
  };

  function paint() {
    const r = size / 2;
    const visualR = state.distance >= visualMax
      ? r - 6
      : (state.distance / visualMax) * (r - 6);
    const a = state.angle * Math.PI / 180;
    const hx = r + Math.cos(a) * visualR;
    const hy = r + Math.sin(a) * visualR;

    handle.style.left = `${hx}px`;
    handle.style.top = `${hy}px`;

    radial.style.width = `${visualR}px`;
    radial.style.transform = `translateY(-50%) rotate(${state.angle}deg)`;

    readout.textContent = `${Math.round(state.angle)}° · ${Math.round(state.distance)}px`;

    angleNum.setValue(Math.round(state.angle));
    distNum.setValue(Math.round(state.distance));
  }

  function emit() {
    onChange?.({ angle: state.angle, distance: state.distance });
  }

  function pointerToValues(e) {
    const rect = disk.getBoundingClientRect();
    const r = rect.width / 2;
    const px = e.clientX - rect.left - r;
    const py = e.clientY - rect.top - r;

    let ang = Math.atan2(py, px) * 180 / Math.PI;
    if (ang < 0) ang += 360;
    if (e.shiftKey) ang = Math.round(ang / 15) * 15;
    if (ang === 360) ang = 0;

    const distPx = Math.sqrt(px * px + py * py);
    const distVal = Math.min(maxDistance, Math.round((distPx / (r - 6)) * visualMax));

    return { angle: ang, distance: Math.max(0, distVal) };
  }

  let dragging = false;

  disk.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    disk.setPointerCapture(e.pointerId);
    disk.classList.add('is-dragging');
    const next = pointerToValues(e);
    state.angle = next.angle;
    state.distance = next.distance;
    paint();
    emit();
  });

  disk.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const next = pointerToValues(e);
    state.angle = next.angle;
    state.distance = next.distance;
    paint();
    emit();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    disk.classList.remove('is-dragging');
    try { disk.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  disk.addEventListener('pointerup', endDrag);
  disk.addEventListener('pointercancel', endDrag);

  disk.addEventListener('dblclick', (e) => {
    e.preventDefault();
    state.angle = defaultAngle;
    state.distance = defaultDistance;
    paint();
    emit();
  });

  // Keyboard nudges when disk has focus
  disk.addEventListener('keydown', (e) => {
    let handled = false;
    const angleStep = e.shiftKey ? 15 : 1;
    const distStep = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft')  { state.angle = (state.angle - angleStep + 360) % 360; handled = true; }
    if (e.key === 'ArrowRight') { state.angle = (state.angle + angleStep) % 360;       handled = true; }
    if (e.key === 'ArrowUp')    { state.distance = Math.min(maxDistance, state.distance + distStep); handled = true; }
    if (e.key === 'ArrowDown')  { state.distance = Math.max(0, state.distance - distStep);          handled = true; }
    if (handled) {
      e.preventDefault();
      paint();
      emit();
    }
  });

  paint();

  wrap.setValue = (v) => {
    if (v?.angle !== undefined) state.angle = ((v.angle % 360) + 360) % 360;
    if (v?.distance !== undefined) state.distance = Math.max(0, Math.min(maxDistance, v.distance));
    paint();
  };

  return wrap;
}

function wrap_row(label, control) {
  const row = document.createElement('label');
  row.className = 'effect-angle-num-row';
  const lbl = document.createElement('span');
  lbl.className = 'effect-label';
  lbl.textContent = label;
  row.appendChild(lbl);
  row.appendChild(control);
  return row;
}
