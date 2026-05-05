// Export popup — region (frame|visible), format (PNG|JPEG), quality, scale,
// background, filename. Drives io/export-png.exportImage().
// FLOATING window: draggable from header, resizable from bottom-right corner.
// Position + size persist to localStorage.

import { exportImage } from '../io/export-png.js';

const SETTINGS_KEY = 'slammer:lastExportSettings';
const WIN_KEY = 'slammer:exportWindow';

function loadLast() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}
function saveLast(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }
function loadWin() {
  try { return JSON.parse(localStorage.getItem(WIN_KEY) || '{}'); } catch { return {}; }
}
function saveWin(s) { try { localStorage.setItem(WIN_KEY, JSON.stringify(s)); } catch {} }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

let openWindow = null;

export function openExportPopup({ document: doc, renderer }) {
  if (openWindow) { openWindow.focus?.(); return; }

  const last = loadLast();
  const hasFrame = !!(doc.state.exportFrame && doc.state.exportFrame.w > 0);
  const initial = {
    region: hasFrame ? (last.region || 'frame') : 'visible',
    format: last.format || 'png',
    quality: last.quality ?? 92,
    scale: last.scale || 1,
    background: last.background || 'transparent',
    customBg: last.customBg || '#ffffff',
    filename: doc.state.name || 'slammer',
  };

  // Window geometry — restore last, clamp to viewport.
  const winState = loadWin();
  const W = clamp(winState.w || 460, 360, window.innerWidth - 20);
  const H = clamp(winState.h || 540, 320, window.innerHeight - 20);
  const X = clamp(winState.x ?? (window.innerWidth - W) / 2, 0, window.innerWidth - W);
  const Y = clamp(winState.y ?? (window.innerHeight - H) / 2, 0, window.innerHeight - H);

  const win = document.createElement('div');
  win.className = 'floating-window export-window';
  win.style.left = `${X}px`;
  win.style.top = `${Y}px`;
  win.style.width = `${W}px`;
  win.style.height = `${H}px`;
  win.innerHTML = `
    <div class="floating-header" data-drag-handle>
      <span><i class="fas fa-file-export"></i> Export</span>
      <button class="floating-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
    </div>
    <div class="floating-body">
      <div class="settings-section">
        <div class="settings-row">
          <span class="settings-label">Region</span>
          <div class="settings-control export-pillgroup" data-key="region">
            <button class="effect-pill ${initial.region === 'frame' ? 'active' : ''}" data-v="frame" ${hasFrame ? '' : 'disabled'}>Export frame</button>
            <button class="effect-pill ${initial.region === 'visible' ? 'active' : ''}" data-v="visible">Visible</button>
          </div>
        </div>

        <div class="settings-row">
          <span class="settings-label">Format</span>
          <div class="settings-control export-pillgroup" data-key="format">
            <button class="effect-pill ${initial.format === 'png' ? 'active' : ''}" data-v="png">PNG</button>
            <button class="effect-pill ${initial.format === 'jpeg' ? 'active' : ''}" data-v="jpeg">JPEG</button>
          </div>
        </div>

        <div class="settings-row export-quality" ${initial.format === 'jpeg' ? '' : 'hidden'}>
          <label class="settings-label" for="exportQuality">Quality <code class="settings-readout" id="exportQualityReadout">${initial.quality}</code></label>
          <div class="settings-control">
            <input type="range" id="exportQuality" min="1" max="100" step="1" value="${initial.quality}" />
          </div>
        </div>

        <div class="settings-row">
          <span class="settings-label">Scale</span>
          <div class="settings-control export-pillgroup" data-key="scale">
            <button class="effect-pill ${initial.scale === 1 ? 'active' : ''}" data-v="1">1×</button>
            <button class="effect-pill ${initial.scale === 2 ? 'active' : ''}" data-v="2">2×</button>
            <button class="effect-pill ${initial.scale === 4 ? 'active' : ''}" data-v="4">4×</button>
          </div>
        </div>

        <div class="settings-row">
          <span class="settings-label">Background</span>
          <div class="settings-control export-bg-row">
            <div class="export-pillgroup" data-key="background">
              <button class="effect-pill ${initial.background === 'transparent' ? 'active' : ''}" data-v="transparent">Transparent</button>
              <button class="effect-pill ${initial.background === '#ffffff' ? 'active' : ''}" data-v="#ffffff">White</button>
              <button class="effect-pill ${initial.background === '#000000' ? 'active' : ''}" data-v="#000000">Black</button>
              <button class="effect-pill ${initial.background === 'custom' ? 'active' : ''}" data-v="custom">Custom</button>
            </div>
            <input type="color" id="exportCustomBg" value="${initial.customBg}" ${initial.background === 'custom' ? '' : 'hidden'} />
          </div>
        </div>

        <div class="settings-row">
          <label class="settings-label" for="exportFilename">Filename</label>
          <div class="settings-control">
            <input type="text" id="exportFilename" class="effect-num" style="width: 100%; padding: 5px 8px;" value="${initial.filename}" />
          </div>
        </div>
      </div>

      <div class="settings-section export-actions">
        <button class="settings-clear" data-act="close">Cancel</button>
        <button class="export-go" id="exportGo">Export</button>
      </div>
    </div>
    <div class="floating-resize" data-resize-handle aria-hidden="true"></div>
  `;
  document.body.appendChild(win);
  openWindow = {
    el: win,
    focus: () => { win.style.zIndex = String(nextZ()); },
  };
  win.style.zIndex = String(nextZ());

  const state = { ...initial };

  // ---------- Pill groups ----------
  function pillBind(groupKey, transform = (v) => v) {
    const grp = win.querySelector(`.export-pillgroup[data-key="${groupKey}"]`);
    if (!grp) return;
    grp.querySelectorAll('.effect-pill').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const v = transform(b.dataset.v);
        state[groupKey] = v;
        grp.querySelectorAll('.effect-pill').forEach((x) => x.classList.toggle('active', x === b));
        if (groupKey === 'format') {
          win.querySelector('.export-quality').toggleAttribute('hidden', v !== 'jpeg');
        }
        if (groupKey === 'background') {
          win.querySelector('#exportCustomBg').toggleAttribute('hidden', v !== 'custom');
        }
      });
    });
  }
  pillBind('region');
  pillBind('format');
  pillBind('scale', (v) => parseInt(v, 10));
  pillBind('background');

  const qSlider = win.querySelector('#exportQuality');
  const qReadout = win.querySelector('#exportQualityReadout');
  qSlider.addEventListener('input', (e) => {
    state.quality = parseInt(e.target.value, 10);
    qReadout.textContent = state.quality;
  });
  win.querySelector('#exportCustomBg').addEventListener('input', (e) => { state.customBg = e.target.value; });
  win.querySelector('#exportFilename').addEventListener('input', (e) => { state.filename = e.target.value; });

  // ---------- Close ----------
  function close() {
    persistGeometry();
    document.removeEventListener('keydown', onKey);
    win.remove();
    openWindow = null;
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  win.addEventListener('click', (e) => {
    if (e.target.closest('[data-act=close]')) close();
  });
  // Bring to front on any click inside the window
  win.addEventListener('mousedown', () => { win.style.zIndex = String(nextZ()); });

  // ---------- Drag the header ----------
  const header = win.querySelector('[data-drag-handle]');
  let dragOffset = null;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-act=close]')) return;
    const r = win.getBoundingClientRect();
    dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragOffset) return;
    const w = win.offsetWidth;
    const h = win.offsetHeight;
    const x = clamp(e.clientX - dragOffset.x, 0, window.innerWidth - w);
    const y = clamp(e.clientY - dragOffset.y, 0, window.innerHeight - h);
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
  });
  window.addEventListener('mouseup', () => {
    if (dragOffset) { dragOffset = null; document.body.style.userSelect = ''; persistGeometry(); }
  });

  // ---------- Resize from bottom-right corner ----------
  const resizer = win.querySelector('[data-resize-handle]');
  let resizeStart = null;
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = win.getBoundingClientRect();
    resizeStart = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!resizeStart) return;
    const w = clamp(resizeStart.w + (e.clientX - resizeStart.x), 360, window.innerWidth - parseFloat(win.style.left));
    const h = clamp(resizeStart.h + (e.clientY - resizeStart.y), 320, window.innerHeight - parseFloat(win.style.top));
    win.style.width = `${w}px`;
    win.style.height = `${h}px`;
  });
  window.addEventListener('mouseup', () => {
    if (resizeStart) { resizeStart = null; document.body.style.userSelect = ''; persistGeometry(); }
  });

  function persistGeometry() {
    const r = win.getBoundingClientRect();
    saveWin({ x: r.left, y: r.top, w: r.width, h: r.height });
  }

  // ---------- Go ----------
  win.querySelector('#exportGo').addEventListener('click', () => {
    const bg = state.background === 'transparent' ? null
      : state.background === 'custom' ? state.customBg
      : state.background;
    saveLast({
      region: state.region, format: state.format, quality: state.quality,
      scale: state.scale, background: state.background, customBg: state.customBg,
    });
    exportImage({
      renderer,
      document: doc,
      region: state.region,
      format: state.format,
      quality: (state.quality ?? 92) / 100,
      scale: state.scale,
      background: bg,
      filename: state.filename,
    });
    close();
  });
}

let _z = 1000;
function nextZ() { return ++_z; }
