// Rotary knob — canvas-based, drag + wheel + double-click-reset.
// "Piece of gear" finish: bevelled face, micro-shadows, tick marks, arc indicator.

const START_ANGLE = 0.75 * Math.PI;   // 135°  → 7:30
const END_ANGLE = 2.25 * Math.PI;     // 405°  → 4:30  (270° sweep)
const SWEEP = END_ANGLE - START_ANGLE;

export function createKnob({ size = 32, min, max, step = 1, value, defaultValue, onChange }) {
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

  function startDrag(clientY) {
    dragging = true;
    dragStartY = clientY;
    dragStartVal = current;
    wrap.classList.add('dragging');
    canvas.style.cursor = 'grabbing';
    wrap.focus({ preventScroll: true });
  }
  function endDrag() {
    dragging = false;
    wrap.classList.remove('dragging');
    canvas.style.cursor = 'ns-resize';
  }
  function updateDrag(clientY, shift) {
    if (!dragging) return;
    const dy = dragStartY - clientY; // up = positive
    const range = max - min;
    // Sensitivity: 120px of drag = full range
    let delta = (dy / 120) * range;
    if (shift) delta *= 0.1;
    let next = dragStartVal + delta;
    next = clamp(next, min, max);
    next = roundForStep(next, step);
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
  window.addEventListener('mousemove', (e) => updateDrag(e.clientY, e.shiftKey));
  window.addEventListener('mouseup', () => { if (dragging) endDrag(); });

  // Touch
  wrap.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startDrag(e.touches[0].clientY);
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    updateDrag(e.touches[0].clientY, false);
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', () => { if (dragging) endDrag(); });

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
