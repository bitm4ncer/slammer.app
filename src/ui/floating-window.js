// Reusable floating-window factory. Header drag, bottom-right resize,
// click-to-focus z-index, ESC to close, viewport clamp, geometry persisted
// to localStorage `slammer:window:<id>`.
//
// Returns a handle: { el, body, header, focus(), close(), onClose(fn), persistKey }.

let _z = 1000;
function nextZ() { return ++_z; }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function createFloatingWindow({
  id,
  title = '',
  iconHTML = '',
  accent,                       // optional hex — colours the header text + border-top
  defaultGeometry = { w: 460, h: 540 },
  minSize = { w: 320, h: 240 },
  className = '',
}) {
  const persistKey = `slammer:window:${id}`;

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(persistKey) || '{}'); } catch {}

  const W = clamp(saved.w || defaultGeometry.w, minSize.w, window.innerWidth - 20);
  const H = clamp(saved.h || defaultGeometry.h, minSize.h, window.innerHeight - 20);
  const X = clamp(saved.x ?? (window.innerWidth - W) / 2, 0, window.innerWidth - W);
  const Y = clamp(saved.y ?? (window.innerHeight - H) / 2, 0, window.innerHeight - H);

  const el = document.createElement('div');
  el.className = `floating-window ${className}`.trim();
  el.dataset.windowId = id;
  el.style.left = `${X}px`;
  el.style.top = `${Y}px`;
  el.style.width = `${W}px`;
  el.style.height = `${H}px`;
  el.style.zIndex = String(nextZ());
  if (accent) {
    el.style.setProperty('--ctx-accent', accent);
  }
  el.innerHTML = `
    <div class="floating-header" data-drag-handle>
      <span class="floating-title">${iconHTML} <span>${escapeHtml(title)}</span></span>
      <button class="floating-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
    </div>
    <div class="floating-body"></div>
    <div class="floating-resize" data-resize-handle aria-hidden="true"></div>
  `;
  document.body.appendChild(el);

  const body = el.querySelector('.floating-body');
  const header = el.querySelector('.floating-header');

  const closeListeners = new Set();
  function onClose(fn) { closeListeners.add(fn); return () => closeListeners.delete(fn); }

  function persistGeometry() {
    const r = el.getBoundingClientRect();
    try {
      localStorage.setItem(persistKey, JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }));
    } catch {}
  }

  function focus() { el.style.zIndex = String(nextZ()); }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    persistGeometry();
    document.removeEventListener('keydown', onKey);
    el.remove();
    closeListeners.forEach((fn) => { try { fn(); } catch {} });
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      // Only close if THIS window has focus (highest z-index amongst floating).
      const top = topmostFloating();
      if (top === el) close();
    }
  }
  document.addEventListener('keydown', onKey);

  // Click to focus.
  el.addEventListener('mousedown', focus);
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act=close]')) close();
  });

  // Header drag.
  let dragOffset = null;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-act=close]')) return;
    if (e.target.closest('button, input, select, textarea, [contenteditable]')) return;
    const r = el.getBoundingClientRect();
    dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
    document.body.style.userSelect = 'none';
  });
  function onMove(e) {
    if (dragOffset) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = clamp(e.clientX - dragOffset.x, 0, window.innerWidth - w);
      const y = clamp(e.clientY - dragOffset.y, 0, window.innerHeight - h);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
    if (resizeStart) {
      const w = clamp(resizeStart.w + (e.clientX - resizeStart.x), minSize.w, window.innerWidth - parseFloat(el.style.left));
      const h = clamp(resizeStart.h + (e.clientY - resizeStart.y), minSize.h, window.innerHeight - parseFloat(el.style.top));
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
  }
  function onUp() {
    if (dragOffset) { dragOffset = null; document.body.style.userSelect = ''; persistGeometry(); }
    if (resizeStart) { resizeStart = null; document.body.style.userSelect = ''; persistGeometry(); }
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  onClose(() => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  });

  // Resize.
  let resizeStart = null;
  const resizer = el.querySelector('[data-resize-handle]');
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect();
    resizeStart = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    document.body.style.userSelect = 'none';
  });

  return { el, body, header, focus, close, onClose, persistKey };
}

function topmostFloating() {
  const all = Array.from(document.querySelectorAll('.floating-window'));
  return all.sort((a, b) => parseInt(b.style.zIndex || '0', 10) - parseInt(a.style.zIndex || '0', 10))[0];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
