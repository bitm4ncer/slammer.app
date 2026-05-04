// Side-panel split — drag the handle between Layer Stack (top) and the contextual
// panels (bottom). Persists the split percentage to localStorage.

const STORE_KEY = 'slammer:ui:sidebarSplit';
const MIN_PCT = 18;
const MAX_PCT = 82;
const DEFAULT_PCT = 38;

function read() {
  const raw = parseFloat(localStorage.getItem(STORE_KEY));
  if (!Number.isFinite(raw)) return DEFAULT_PCT;
  return Math.max(MIN_PCT, Math.min(MAX_PCT, raw));
}
function write(pct) {
  try { localStorage.setItem(STORE_KEY, String(pct)); } catch {}
}

export function initSidePanelSplit() {
  const panel = document.querySelector('.side-panel');
  const handle = document.getElementById('sidePanelHandle');
  if (!panel || !handle) return;

  // Apply persisted height.
  panel.style.setProperty('--side-panel-top-h', `${read()}%`);

  let dragging = false;
  let panelRect = null;

  function onMove(clientY) {
    if (!dragging || !panelRect) return;
    const offset = clientY - panelRect.top;
    let pct = (offset / panelRect.height) * 100;
    pct = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
    panel.style.setProperty('--side-panel-top-h', `${pct.toFixed(2)}%`);
  }

  function start(clientY) {
    dragging = true;
    panelRect = panel.getBoundingClientRect();
    handle.classList.add('dragging');
    document.body.classList.add('is-resizing-side-panel');
    onMove(clientY);
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('is-resizing-side-panel');
    const current = parseFloat(panel.style.getPropertyValue('--side-panel-top-h'));
    if (Number.isFinite(current)) write(current);
  }

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start(e.clientY);
  });
  window.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientY); });
  window.addEventListener('mouseup', end);

  // Touch support.
  handle.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t) { e.preventDefault(); start(t.clientY); }
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    if (t) onMove(t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', end);

  // Keyboard nudges (Up/Down arrows when handle focused).
  handle.addEventListener('keydown', (e) => {
    const cur = parseFloat(panel.style.getPropertyValue('--side-panel-top-h')) || DEFAULT_PCT;
    const step = e.shiftKey ? 5 : 1;
    let next = cur;
    if (e.key === 'ArrowUp') next = cur - step;
    else if (e.key === 'ArrowDown') next = cur + step;
    else if (e.key === 'Home') next = MIN_PCT;
    else if (e.key === 'End') next = MAX_PCT;
    else return;
    e.preventDefault();
    next = Math.max(MIN_PCT, Math.min(MAX_PCT, next));
    panel.style.setProperty('--side-panel-top-h', `${next}%`);
    write(next);
  });

  // Double-click resets to default.
  handle.addEventListener('dblclick', () => {
    panel.style.setProperty('--side-panel-top-h', `${DEFAULT_PCT}%`);
    write(DEFAULT_PCT);
  });
}
