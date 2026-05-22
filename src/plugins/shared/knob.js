// Rotary knob — canvas-based, drag + wheel + double-click-reset.
// "Piece of gear" finish: bevelled face, micro-shadows, tick marks, arc indicator.

const START_ANGLE = 0.75 * Math.PI;   // 135°  → 7:30
const END_ANGLE = 2.25 * Math.PI;     // 405°  → 4:30  (270° sweep)
const SWEEP = END_ANGLE - START_ANGLE;

export function createKnob({ size = 32, min, max, step = 1, value, defaultValue, onChange, snapWithShift = 0 }) {
  const wrap = document.createElement('span');
  wrap.className = 'knob-container';
  wrap.style.cssText = `display:inline-block;width:${size}px;height:${size}px;position:relative;flex-shrink:0;`;
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-valuemin', String(min));
  wrap.setAttribute('aria-valuemax', String(max));

  const canvas = document.createElement('canvas');
  canvas.className = 'knob-canvas';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.cssText = `display:block;width:${size}px;height:${size}px;cursor:ns-resize;`;
  wrap.appendChild(canvas);

  let current = clamp(value, min, max);
  const resetVal = defaultValue !== undefined ? defaultValue : current;

  function setValue(v) {
    current = clamp(v, min, max);
    wrap.setAttribute('aria-valuenow', String(roundForStep(current, step)));
    draw();
  }

  function valueToAngle(v) {
    const t = (clamp(v, min, max) - min) / (max - min);
    return START_ANGLE + t * SWEEP;
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = (Math.min(w, h) / 2) - 2 * dpr;
    const accent = readAccentColor();

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    // All subsequent ops in CSS-pixel space, scaled by DPR.
    // Actually easier to scale the context once.

    // ---------- Face (bevelled) ----------
    const faceGrad = ctx.createRadialGradient(
      cx - r * 0.25, cy - r * 0.25, r * 0.05,
      cx, cy, r
    );
    faceGrad.addColorStop(0, '#3e3e3e');
    faceGrad.addColorStop(0.6, '#2a2a2a');
    faceGrad.addColorStop(1, '#1a1a1a');

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Outer rim highlight + shadow
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r - 1 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    // ---------- Tick marks ----------
    const ticks = Math.max(8, Math.floor(size / 3));
    ctx.lineWidth = Math.max(1, dpr);
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const a = START_ANGLE + t * SWEEP;
      const inner = r - 4 * dpr;
      const outer = r - 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = t === 0 || t === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.stroke();
    }

    // ---------- Arc track ----------
    const trackR = r - 7 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, START_ANGLE, END_ANGLE);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2.5 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();

    // ---------- Filled arc ----------
    const curAngle = valueToAngle(current);
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, START_ANGLE, curAngle);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Soft glow under the arc
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, START_ANGLE, curAngle);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 5 * dpr;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ---------- Interactions ----------
  let dragging = false;
  let dragStartY = 0;
  let dragStartVal = 0;

  // Window-level handlers — defined as named refs so we can detach them
  // when the drag ends. The OLD pattern attached them once at knob
  // creation and left them on window forever, which means every knob
  // (one per layer-card opacity, one per slider on every effect, etc.)
  // leaked four window listeners (mousemove + mouseup + touchmove +
  // touchend) that fired on every move event for the rest of the
  // session. With dozens of knobs per project that adds real cost.
  const onWinMouseMove = (e) => updateDrag(e.clientY, e.shiftKey);
  const onWinMouseUp   = () => { if (dragging) endDrag(); };
  const onWinTouchMove = (e) => {
    if (!dragging) return;
    updateDrag(e.touches[0].clientY, false);
    e.preventDefault();
  };
  const onWinTouchEnd  = () => { if (dragging) endDrag(); };

  function startDrag(clientY) {
    dragging = true;
    dragStartY = clientY;
    dragStartVal = current;
    wrap.classList.add('dragging');
    canvas.style.cursor = 'grabbing';
    wrap.focus({ preventScroll: true });
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    window.addEventListener('touchmove', onWinTouchMove, { passive: false });
    window.addEventListener('touchend', onWinTouchEnd);
  }
  function endDrag() {
    dragging = false;
    wrap.classList.remove('dragging');
    canvas.style.cursor = 'ns-resize';
    window.removeEventListener('mousemove', onWinMouseMove);
    window.removeEventListener('mouseup', onWinMouseUp);
    window.removeEventListener('touchmove', onWinTouchMove);
    window.removeEventListener('touchend', onWinTouchEnd);
  }
  function updateDrag(clientY, shift) {
    if (!dragging) return;
    const dy = dragStartY - clientY; // up = positive
    const range = max - min;
    // Sensitivity: 120px of drag = full range
    let delta = (dy / 120) * range;
    // When `snapWithShift` is configured (e.g. 100 for variable wght axis),
    // Shift switches to coarse snap-to-nearest-multiple. Otherwise Shift
    // acts as fine-control (0.1× sensitivity) — original behaviour.
    if (shift && !snapWithShift) delta *= 0.1;
    let next = dragStartVal + delta;
    next = clamp(next, min, max);
    if (shift && snapWithShift) {
      next = Math.round(next / snapWithShift) * snapWithShift;
      next = clamp(next, min, max);
    } else {
      next = roundForStep(next, step);
    }
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  }

  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    startDrag(e.clientY);
    e.preventDefault();
  });
  // Touch
  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startDrag(e.touches[0].clientY);
  }, { passive: false });

  // Wheel
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    // Wheel moves faster for large ranges, slower for tiny steps
    let delta = step * dir;
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  }, { passive: false });

  // Double-click reset
  wrap.addEventListener('dblclick', () => {
    if (current === resetVal) return;
    current = resetVal;
    onChange(resetVal);
    wrap.setAttribute('aria-valuenow', String(resetVal));
    draw();
  });

  // Keyboard
  wrap.addEventListener('keydown', (e) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -step;
    else return;
    e.preventDefault();
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  });

  // Hover focus ring via CSS, but add/remove a class for active glow
  wrap.addEventListener('mouseenter', () => draw());
  wrap.addEventListener('mouseleave', () => draw());

  // Initial draw
  setValue(current);

  wrap.setValue = setValue;
  wrap.getValue = () => current;
  return wrap;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function roundForStep(v, step) {
  if (!step || step <= 0) return v;
  const stepped = Math.round(v / step) * step;
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const mult = Math.pow(10, decimals);
  return Math.round(stepped * mult) / mult;
}

function readAccentColor() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--ctx-accent').trim() || '#8aff8c';
  } catch {
    return '#8aff8c';
  }
}

// ---------------------------------------------------------------------------
// Small compact knob — for secondary/modifier values (seed, bias).
// Simplified version of the standard knob: fewer ticks, thinner arc, no glow.
// ---------------------------------------------------------------------------

export function createKnobSm({ size = 24, min, max, step = 1, value, defaultValue, onChange, snapWithShift = 0 }) {
  const wrap = document.createElement('span');
  wrap.className = 'knob-container knob-sm';
  wrap.style.cssText = `display:inline-block;width:${size}px;height:${size}px;position:relative;flex-shrink:0;`;
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-valuemin', String(min));
  wrap.setAttribute('aria-valuemax', String(max));

  const canvas = document.createElement('canvas');
  canvas.className = 'knob-canvas';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.cssText = `display:block;width:${size}px;height:${size}px;cursor:ns-resize;`;
  wrap.appendChild(canvas);

  let current = clamp(value, min, max);
  const resetVal = defaultValue !== undefined ? defaultValue : current;

  function setValue(v) {
    current = clamp(v, min, max);
    wrap.setAttribute('aria-valuenow', String(roundForStep(current, step)));
    draw();
  }

  function valueToAngle(v) {
    const t = (clamp(v, min, max) - min) / (max - min);
    return START_ANGLE + t * SWEEP;
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = (Math.min(w, h) / 2) - 2 * dpr;
    const accent = readAccentColor();

    ctx.clearRect(0, 0, w, h);

    const faceGrad = ctx.createRadialGradient(
      cx - r * 0.25, cy - r * 0.25, r * 0.05, cx, cy, r
    );
    faceGrad.addColorStop(0, '#3a3a3a');
    faceGrad.addColorStop(0.6, '#282828');
    faceGrad.addColorStop(1, '#1a1a1a');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5 * dpr;
    ctx.stroke();

    const ticks = 6;
    ctx.lineWidth = Math.max(1, dpr * 0.7);
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const a = START_ANGLE + t * SWEEP;
      const inner = r - 3 * dpr;
      const outer = r - 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.strokeStyle = (i === 0 || i === ticks) ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
      ctx.stroke();
    }

    const trackR = r - 5 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, START_ANGLE, END_ANGLE);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();

    const curAngle = valueToAngle(current);
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, START_ANGLE, curAngle);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  let dragging = false;
  let dragStartY = 0;
  let dragStartVal = 0;
  const onWinMouseMove = (e) => updateDrag(e.clientY, e.shiftKey);
  const onWinMouseUp   = () => { if (dragging) endDrag(); };
  const onWinTouchMove = (e) => { if (!dragging) return; updateDrag(e.touches[0].clientY, false); e.preventDefault(); };
  const onWinTouchEnd  = () => { if (dragging) endDrag(); };

  function startDrag(clientY) {
    dragging = true; dragStartY = clientY; dragStartVal = current;
    wrap.classList.add('dragging'); canvas.style.cursor = 'grabbing';
    wrap.focus({ preventScroll: true });
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    window.addEventListener('touchmove', onWinTouchMove, { passive: false });
    window.addEventListener('touchend', onWinTouchEnd);
  }
  function endDrag() {
    dragging = false; wrap.classList.remove('dragging'); canvas.style.cursor = 'ns-resize';
    window.removeEventListener('mousemove', onWinMouseMove);
    window.removeEventListener('mouseup', onWinMouseUp);
    window.removeEventListener('touchmove', onWinTouchMove);
    window.removeEventListener('touchend', onWinTouchEnd);
  }
  function updateDrag(clientY, shift) {
    if (!dragging) return;
    const dy = dragStartY - clientY;
    const range = max - min;
    let delta = (dy / 120) * range;
    if (shift && !snapWithShift) delta *= 0.1;
    let next = dragStartVal + delta;
    next = clamp(next, min, max);
    if (shift && snapWithShift) { next = Math.round(next / snapWithShift) * snapWithShift; next = clamp(next, min, max); }
    else { next = roundForStep(next, step); }
    if (next !== current) { current = next; onChange(next); wrap.setAttribute('aria-valuenow', String(next)); draw(); }
  }

  wrap.addEventListener('mousedown', (e) => { if (e.button !== 0) return; startDrag(e.clientY); e.preventDefault(); });
  wrap.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) return; startDrag(e.touches[0].clientY); }, { passive: false });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    let delta = step * dir;
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) { current = next; onChange(next); wrap.setAttribute('aria-valuenow', String(next)); draw(); }
  }, { passive: false });
  wrap.addEventListener('dblclick', () => {
    if (current === resetVal) return;
    current = resetVal; onChange(resetVal); wrap.setAttribute('aria-valuenow', String(resetVal)); draw();
  });
  wrap.addEventListener('keydown', (e) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -step;
    else return;
    e.preventDefault();
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) { current = next; onChange(next); wrap.setAttribute('aria-valuenow', String(next)); draw(); }
  });

  setValue(current);
  wrap.setValue = setValue;
  wrap.getValue = () => current;
  return wrap;
}

// ---------------------------------------------------------------------------
// Large futuristic knob — technical / instrument aesthetic.
// Multi-ring concentric housing, machined grooves, fine graduated ticks,
// precision needle pointer. No glow, no border.
// ---------------------------------------------------------------------------

export function createKnobLg({ size = 64, min, max, step = 1, value, defaultValue, onChange, snapWithShift = 0 }) {
  const wrap = document.createElement('span');
  wrap.className = 'knob-container knob-lg';
  wrap.style.cssText = `display:inline-block;width:${size}px;height:${size}px;position:relative;flex-shrink:0;cursor:ns-resize;`;
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-valuemin', String(min));
  wrap.setAttribute('aria-valuemax', String(max));

  const canvas = document.createElement('canvas');
  canvas.className = 'knob-canvas';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.cssText = `display:block;width:${size}px;height:${size}px;cursor:ns-resize;`;
  wrap.appendChild(canvas);

  let current = clamp(value, min, max);
  const resetVal = defaultValue !== undefined ? defaultValue : current;

  function setValue(v) {
    current = clamp(v, min, max);
    wrap.setAttribute('aria-valuenow', String(roundForStep(current, step)));
    draw();
  }

  function valueToAngle(v) {
    const t = (clamp(v, min, max) - min) / (max - min);
    return START_ANGLE + t * SWEEP;
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = (Math.min(w, h) / 2) - 1 * dpr;
    const accent = readAccentColor();

    ctx.clearRect(0, 0, w, h);

    // --- Outer housing ring (dark machined metal) ---
    const housingGrad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R);
    housingGrad.addColorStop(0, '#1e1e1e');
    housingGrad.addColorStop(0.5, '#252525');
    housingGrad.addColorStop(1, '#141414');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = housingGrad;
    ctx.fill();

    // --- Machined groove ring (subtle concentric lines) ---
    for (let i = 0; i < 3; i++) {
      const gr = R - (2 + i * 1.5) * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, gr, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.5 * dpr;
      ctx.stroke();
    }

    // --- Outer tick marks (fine graduation, 48 ticks across the sweep) ---
    const outerTickR = R - 6 * dpr;
    const innerTickR = R - 10 * dpr;
    const majorTickR = R - 13 * dpr;
    const totalTicks = 48;
    ctx.lineCap = 'butt';
    for (let i = 0; i <= totalTicks; i++) {
      const t = i / totalTicks;
      const a = START_ANGLE + t * SWEEP;
      const isMajor = i % 8 === 0;
      const isMid = i % 4 === 0;
      const ir = isMajor ? majorTickR : isMid ? innerTickR : outerTickR;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * ir, cy + Math.sin(a) * ir);
      ctx.lineTo(cx + Math.cos(a) * (R - 4 * dpr), cy + Math.sin(a) * (R - 4 * dpr));
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.18)' : isMid ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
      ctx.lineWidth = (isMajor ? 1.2 : 0.7) * dpr;
      ctx.stroke();
    }

    // --- Inner face (recessed disc) ---
    const faceR = R * 0.58;
    const faceGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, faceR);
    faceGrad.addColorStop(0, '#242424');
    faceGrad.addColorStop(1, '#1a1a1a');
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Inner groove
    ctx.beginPath();
    ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, faceR - 1 * dpr, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5 * dpr;
    ctx.stroke();

    // --- Knurled texture on face (radial hash marks) ---
    const knurlR = faceR - 1.5 * dpr;
    const knurlInner = faceR * 0.25;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * knurlInner, cy + Math.sin(a) * knurlInner);
      ctx.lineTo(cx + Math.cos(a) * knurlR, cy + Math.sin(a) * knurlR);
      ctx.strokeStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.8 * dpr;
      ctx.stroke();
    }

    // --- Arc track (between ticks and face) ---
    const trackR = R * 0.72;
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, START_ANGLE, END_ANGLE);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();

    // --- Filled arc (accent) ---
    const curAngle = valueToAngle(current);
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, START_ANGLE, curAngle);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();

    // --- Pointer needle (from centre toward arc) ---
    const needleLen = faceR - 4 * dpr;
    const needleInner = faceR * 0.15;
    ctx.beginPath();
    ctx.moveTo(
      cx + Math.cos(curAngle) * needleInner,
      cy + Math.sin(curAngle) * needleInner
    );
    ctx.lineTo(
      cx + Math.cos(curAngle) * needleLen,
      cy + Math.sin(curAngle) * needleLen
    );
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.8 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();

  }

  // --- Interactions (reuse same pattern as createKnob) ---
  let dragging = false;
  let dragStartY = 0;
  let dragStartVal = 0;

  const onWinMouseMove = (e) => updateDrag(e.clientY, e.shiftKey);
  const onWinMouseUp   = () => { if (dragging) endDrag(); };
  const onWinTouchMove = (e) => {
    if (!dragging) return;
    updateDrag(e.touches[0].clientY, false);
    e.preventDefault();
  };
  const onWinTouchEnd  = () => { if (dragging) endDrag(); };

  function startDrag(clientY) {
    dragging = true;
    dragStartY = clientY;
    dragStartVal = current;
    wrap.classList.add('dragging');
    canvas.style.cursor = 'grabbing';
    wrap.focus({ preventScroll: true });
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    window.addEventListener('touchmove', onWinTouchMove, { passive: false });
    window.addEventListener('touchend', onWinTouchEnd);
  }
  function endDrag() {
    dragging = false;
    wrap.classList.remove('dragging');
    canvas.style.cursor = 'ns-resize';
    window.removeEventListener('mousemove', onWinMouseMove);
    window.removeEventListener('mouseup', onWinMouseUp);
    window.removeEventListener('touchmove', onWinTouchMove);
    window.removeEventListener('touchend', onWinTouchEnd);
  }
  function updateDrag(clientY, shift) {
    if (!dragging) return;
    const dy = dragStartY - clientY;
    const range = max - min;
    let delta = (dy / 150) * range;
    if (shift && !snapWithShift) delta *= 0.1;
    let next = dragStartVal + delta;
    next = clamp(next, min, max);
    if (shift && snapWithShift) {
      next = Math.round(next / snapWithShift) * snapWithShift;
      next = clamp(next, min, max);
    } else {
      next = roundForStep(next, step);
    }
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  }

  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    startDrag(e.clientY);
    e.preventDefault();
  });
  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startDrag(e.touches[0].clientY);
  }, { passive: false });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    let delta = step * dir;
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  }, { passive: false });
  wrap.addEventListener('dblclick', () => {
    if (current === resetVal) return;
    current = resetVal;
    onChange(resetVal);
    wrap.setAttribute('aria-valuenow', String(resetVal));
    draw();
  });
  wrap.addEventListener('keydown', (e) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -step;
    else return;
    e.preventDefault();
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  });

  setValue(current);

  wrap.setValue = setValue;
  wrap.getValue = () => current;
  return wrap;
}

/* ── XL knob (96 px) ── rotary mixer style ── */
export function createKnobXl({
  label = '',
  min = 0,
  max = 100,
  step = 1,
  value = 0,
  onChange = () => {},
  unit = '',
} = {}) {
  const SIZE = 96;
  const dpr = window.devicePixelRatio || 1;
  const cSize = Math.round(SIZE * dpr);

  const wrap = document.createElement('div');
  wrap.className = 'knob-xl';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-label', label);
  wrap.setAttribute('aria-valuemin', String(min));
  wrap.setAttribute('aria-valuemax', String(max));

  const canvas = document.createElement('canvas');
  canvas.width = cSize;
  canvas.height = cSize;
  canvas.style.width = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  const ctx = canvas.getContext('2d');
  wrap.appendChild(canvas);

  if (label) {
    const lbl = document.createElement('span');
    lbl.className = 'knob-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }

  let current = clamp(value, min, max);
  const DRAG_PX = 180;

  function setValue(v) {
    current = clamp(roundForStep(v, step), min, max);
    wrap.setAttribute('aria-valuenow', String(current));
    draw();
  }

  function draw() {
    const w = cSize, h = cSize;
    const cx = w / 2, cy = h / 2;
    const r = (Math.min(w, h) / 2) * 0.88;
    ctx.clearRect(0, 0, w, h);

    const accent = readAccentColor();
    const ratio = (current - min) / (max - min || 1);
    const ang = START_ANGLE + ratio * SWEEP;

    // dark machined body
    const bodyGrad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    bodyGrad.addColorStop(0, '#3a3a3a');
    bodyGrad.addColorStop(0.7, '#1e1e1e');
    bodyGrad.addColorStop(1, '#111');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // 5 machined grooves
    for (let i = 1; i <= 5; i++) {
      const gr = r * (0.55 + i * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, gr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.5 * dpr;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, gr + 0.5 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5 * dpr;
      ctx.stroke();
    }

    // 48 knurl marks on face
    const knurlR = r * 0.72;
    const knurlLen = r * 0.06;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const cos = Math.cos(a), sin = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + cos * (knurlR - knurlLen), cy + sin * (knurlR - knurlLen));
      ctx.lineTo(cx + cos * knurlR, cy + sin * knurlR);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
    }

    // 64 graduated ticks
    const tickOuter = r * 0.98;
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const ta = START_ANGLE + t * SWEEP;
      const isMajor = i % 16 === 0;
      const isMid = i % 8 === 0;
      const tickLen = isMajor ? r * 0.12 : isMid ? r * 0.08 : r * 0.05;
      const tickInner = tickOuter - tickLen;
      const cos = Math.cos(ta), sin = Math.sin(ta);
      ctx.beginPath();
      ctx.moveTo(cx + cos * tickInner, cy + sin * tickInner);
      ctx.lineTo(cx + cos * tickOuter, cy + sin * tickOuter);
      const lit = t <= ratio;
      ctx.strokeStyle = lit
        ? isMajor ? accent : `rgba(${hexToRgb(accent)},0.6)`
        : isMajor ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = (isMajor ? 2 : isMid ? 1.2 : 0.8) * dpr;
      ctx.stroke();
    }

    // arc track (thick)
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.84, START_ANGLE, END_ANGLE);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 4 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();

    // arc value fill
    if (ratio > 0.001) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.84, START_ANGLE, ang);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4 * dpr;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // chrome center cap
    const capR = r * 0.22;
    const capGrad = ctx.createRadialGradient(
      cx - capR * 0.3, cy - capR * 0.3, capR * 0.1,
      cx, cy, capR
    );
    capGrad.addColorStop(0, '#e8e8e8');
    capGrad.addColorStop(0.4, '#aaa');
    capGrad.addColorStop(0.8, '#666');
    capGrad.addColorStop(1, '#444');
    ctx.beginPath();
    ctx.arc(cx, cy, capR, 0, Math.PI * 2);
    ctx.fillStyle = capGrad;
    ctx.fill();

    // specular highlight on cap
    ctx.beginPath();
    ctx.ellipse(cx - capR * 0.2, cy - capR * 0.25, capR * 0.35, capR * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // prominent pointer needle
    const needleInner = r * 0.28;
    const needleOuter = r * 0.78;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(cx + cos * needleInner, cy + sin * needleInner);
    ctx.lineTo(cx + cos * needleOuter, cy + sin * needleOuter);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5 * dpr;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // helper for rgba extraction
  function hexToRgb(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `${r},${g},${b}`;
  }

  // drag interaction
  let dragging = false, dragStartY = 0, dragStartVal = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragStartY = e.clientY;
    dragStartVal = current;
    e.preventDefault();
    wrap.focus();

    const onMove = (me) => {
      if (!dragging) return;
      const dy = dragStartY - me.clientY;
      const range = max - min;
      let next = roundForStep(clamp(dragStartVal + (dy / DRAG_PX) * range, min, max), step);
      if (next !== current) {
        current = next;
        onChange(next);
        wrap.setAttribute('aria-valuenow', String(next));
        draw();
      }
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    let next = roundForStep(clamp(current + dir * step, min, max), step);
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  }, { passive: false });

  canvas.addEventListener('dblclick', () => {
    current = clamp(roundForStep(value, step), min, max);
    onChange(current);
    wrap.setAttribute('aria-valuenow', String(current));
    draw();
  });

  wrap.addEventListener('keydown', (e) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -step;
    else return;
    e.preventDefault();
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) {
      current = next;
      onChange(next);
      wrap.setAttribute('aria-valuenow', String(next));
      draw();
    }
  });

  setValue(current);

  wrap.setValue = setValue;
  wrap.getValue = () => current;
  return wrap;
}
