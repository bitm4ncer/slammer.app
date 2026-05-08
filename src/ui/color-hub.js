// Color Hub popover (Phase 23b) — the central colour-picking surface.
//
// Floating popover anchored above the dial. Three sections:
//   • Picker — hue ring (CSS conic-gradient) wrapping a saturation /
//     brightness pad (HSV). Drag either to set the colour.
//   • Side — active preview, eyedropper + save buttons, hex + RGB inputs
//     bidirectionally bound to the picker.
//   • Library — Recent swatches grid (auto-tracked). Variables tab
//     reserved for 23c.
//
// Keyboard: ESC closes. Click-outside closes (anchor is exempt).

import {
  getActive, setActive, onActiveChange,
  getSwatches, addSwatch, removeSwatch, onSwatchesChange,
} from '../core/colors.js';

const RING_OUTER = 96;     // px — outer radius of the hue ring
const RING_INNER = 78;     // px — inner radius (where the SV pad starts)
const RING_THICK = RING_OUTER - RING_INNER;
const SV_SIZE    = 110;    // px — saturation/brightness pad inside the ring

let popover = null;
let unsubs = [];

export function isColorHubOpen() { return !!popover; }

export function toggleColorHub(anchorEl) {
  if (popover) { closeColorHub(); return; }
  openColorHub(anchorEl);
}

export function openColorHub(anchorEl) {
  if (popover) return;
  build();
  bindEvents(anchorEl);
  position(anchorEl);
  // Position again next frame in case fonts/icons reflow the size.
  requestAnimationFrame(() => position(anchorEl));
}

export function closeColorHub() {
  for (const u of unsubs) { try { u(); } catch {} }
  unsubs = [];
  if (popover) { popover.remove(); popover = null; }
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('mousedown', onOutside, { capture: true });
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  popover = document.createElement('div');
  popover.className = 'color-hub';
  popover.style.setProperty('--ring-outer', `${RING_OUTER * 2}px`);
  popover.style.setProperty('--ring-inner', `${RING_INNER * 2}px`);
  popover.style.setProperty('--sv-size',    `${SV_SIZE}px`);
  popover.innerHTML = `
    <div class="color-hub-row">
      <div class="color-hub-picker">
        <div class="color-hub-hue-ring" tabindex="0" aria-label="Hue ring">
          <div class="color-hub-hue-cursor"></div>
          <div class="color-hub-sv-pad" tabindex="0" aria-label="Saturation and brightness">
            <div class="color-hub-sv-overlay-s"></div>
            <div class="color-hub-sv-overlay-v"></div>
            <div class="color-hub-sv-cursor"></div>
          </div>
        </div>
      </div>
      <div class="color-hub-side">
        <div class="color-hub-preview-row">
          <span class="color-hub-preview" aria-label="Active colour"></span>
          <button class="color-hub-icon-btn color-hub-eyedropper" title="Eyedropper" aria-label="Eyedropper"><i class="fas fa-eye-dropper"></i></button>
          <button class="color-hub-icon-btn color-hub-save" title="Save to swatches" aria-label="Save to swatches"><i class="fas fa-bookmark"></i></button>
        </div>
        <div class="color-hub-input-row">
          <label class="color-hub-input-label">HEX</label>
          <input class="color-hub-input color-hub-hex" type="text" maxlength="7" spellcheck="false" />
        </div>
        <div class="color-hub-input-row color-hub-input-row--rgb">
          <span class="color-hub-input-trio">
            <label class="color-hub-input-label">R</label>
            <input class="color-hub-input color-hub-r" type="number" min="0" max="255" />
          </span>
          <span class="color-hub-input-trio">
            <label class="color-hub-input-label">G</label>
            <input class="color-hub-input color-hub-g" type="number" min="0" max="255" />
          </span>
          <span class="color-hub-input-trio">
            <label class="color-hub-input-label">B</label>
            <input class="color-hub-input color-hub-b" type="number" min="0" max="255" />
          </span>
        </div>
        <div class="color-hub-tabs">
          <button class="color-hub-tab is-active" data-tab="recent" type="button">Recent</button>
          <button class="color-hub-tab" data-tab="vars" type="button">Variables</button>
        </div>
        <div class="color-hub-tab-panel" data-tab="recent">
          <div class="color-hub-swatches"></div>
        </div>
        <div class="color-hub-tab-panel" data-tab="vars" hidden>
          <div class="color-hub-vars-placeholder">Variables manager — Phase 23c.</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(popover);
}

// ---------------------------------------------------------------------------
// Position above the anchor (dial). Falls back below if there isn't room.
// ---------------------------------------------------------------------------

function position(anchorEl) {
  if (!popover) return;
  const r = anchorEl.getBoundingClientRect();
  const pw = popover.offsetWidth;
  const ph = popover.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  let top = r.top - ph - 14;
  left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
  if (top < 8) top = r.bottom + 14;
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top  = `${Math.round(top)}px`;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindEvents(anchorEl) {
  const hueRing  = popover.querySelector('.color-hub-hue-ring');
  const hueCursor = popover.querySelector('.color-hub-hue-cursor');
  const svPad    = popover.querySelector('.color-hub-sv-pad');
  const svCursor = popover.querySelector('.color-hub-sv-cursor');
  const preview  = popover.querySelector('.color-hub-preview');
  const hexEl    = popover.querySelector('.color-hub-hex');
  const rEl      = popover.querySelector('.color-hub-r');
  const gEl      = popover.querySelector('.color-hub-g');
  const bEl      = popover.querySelector('.color-hub-b');
  const swatchesEl = popover.querySelector('.color-hub-swatches');

  // Local HSV state — updated by interactions; reflected to active colour.
  let { h, s, v } = hexToHsv(getActive());

  function paint() {
    const hex = hsvToHex(h, s, v);
    preview.style.background = hex;
    svPad.style.background = `hsl(${h}, 100%, 50%)`;
    // Cursor on hue ring — at midline of the ring thickness.
    const ringMidR = (RING_OUTER + RING_INNER) / 2;
    const a = (h - 90) * Math.PI / 180;
    const hx = Math.cos(a) * ringMidR;
    const hy = Math.sin(a) * ringMidR;
    hueCursor.style.transform = `translate(calc(-50% + ${hx}px), calc(-50% + ${hy}px))`;
    // Cursor on SV pad — left = saturation, top = inverse value.
    svCursor.style.left = `${(s / 100) * SV_SIZE}px`;
    svCursor.style.top  = `${(1 - v / 100) * SV_SIZE}px`;
    // Inputs (don't fight the user as they type).
    if (document.activeElement !== hexEl) hexEl.value = hex.toUpperCase();
    const rgb = hexToRgb(hex);
    if (document.activeElement !== rEl) rEl.value = rgb.r;
    if (document.activeElement !== gEl) gEl.value = rgb.g;
    if (document.activeElement !== bEl) bEl.value = rgb.b;
  }

  function commit() {
    setActive(hsvToHex(h, s, v));
    paint();
  }

  paint();

  // ── Hue ring drag ────────────────────────────────────────────────────
  function hueFromEvent(e) {
    const r = hueRing.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let ang = Math.atan2(dy, dx) * 180 / Math.PI + 90; // 0 at top
    if (ang < 0) ang += 360;
    return ang;
  }
  let huedrag = false;
  hueRing.addEventListener('pointerdown', (e) => {
    // Only inside the ring band — clicks inside the SV pad shouldn't
    // start a hue drag.
    const r = hueRing.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (dist < RING_INNER || dist > RING_OUTER) return;
    e.preventDefault();
    huedrag = true;
    hueRing.setPointerCapture(e.pointerId);
    h = hueFromEvent(e);
    commit();
  });
  hueRing.addEventListener('pointermove', (e) => {
    if (!huedrag) return;
    h = hueFromEvent(e);
    commit();
  });
  hueRing.addEventListener('pointerup', (e) => {
    if (!huedrag) return;
    huedrag = false;
    try { hueRing.releasePointerCapture(e.pointerId); } catch {}
  });

  // ── SV pad drag ──────────────────────────────────────────────────────
  function svFromEvent(e) {
    const r = svPad.getBoundingClientRect();
    let nx = (e.clientX - r.left) / r.width;
    let ny = (e.clientY - r.top)  / r.height;
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    return { s: nx * 100, v: (1 - ny) * 100 };
  }
  let svdrag = false;
  svPad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    svdrag = true;
    svPad.setPointerCapture(e.pointerId);
    const next = svFromEvent(e);
    s = next.s; v = next.v;
    commit();
  });
  svPad.addEventListener('pointermove', (e) => {
    if (!svdrag) return;
    const next = svFromEvent(e);
    s = next.s; v = next.v;
    commit();
  });
  svPad.addEventListener('pointerup', (e) => {
    if (!svdrag) return;
    svdrag = false;
    try { svPad.releasePointerCapture(e.pointerId); } catch {}
  });

  // ── Hex input ────────────────────────────────────────────────────────
  hexEl.addEventListener('input', () => {
    const raw = hexEl.value.trim();
    const norm = normaliseHex(raw);
    if (!norm) return;
    const next = hexToHsv(norm);
    h = next.h; s = next.s; v = next.v;
    commit();
  });
  hexEl.addEventListener('blur', () => { paint(); }); // re-canonicalise display

  // ── RGB inputs ───────────────────────────────────────────────────────
  function readRgbAndCommit() {
    const r = clamp255(parseInt(rEl.value, 10));
    const g = clamp255(parseInt(gEl.value, 10));
    const b = clamp255(parseInt(bEl.value, 10));
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
    const next = hexToHsv(rgbToHex(r, g, b));
    h = next.h; s = next.s; v = next.v;
    commit();
  }
  [rEl, gEl, bEl].forEach((el) => el.addEventListener('input', readRgbAndCommit));

  // ── Eyedropper (Chromium native) ────────────────────────────────────
  popover.querySelector('.color-hub-eyedropper').addEventListener('click', async () => {
    if (typeof window.EyeDropper === 'undefined') {
      flashStatus('Eyedropper requires a Chromium browser');
      return;
    }
    try {
      const ed = new window.EyeDropper();
      const result = await ed.open();
      const next = hexToHsv(result.sRGBHex);
      h = next.h; s = next.s; v = next.v;
      commit();
    } catch { /* user cancelled */ }
  });

  // ── Save to swatches ─────────────────────────────────────────────────
  popover.querySelector('.color-hub-save').addEventListener('click', () => {
    addSwatch(hsvToHex(h, s, v));
  });

  // ── Recent swatches grid ─────────────────────────────────────────────
  function paintSwatches() {
    swatchesEl.innerHTML = '';
    const list = getSwatches();
    if (!list.length) {
      swatchesEl.innerHTML = '<div class="color-hub-empty">No saved swatches yet</div>';
      return;
    }
    for (const hex of list.slice(0, 24)) {
      const btn = document.createElement('button');
      btn.className = 'color-hub-swatch';
      btn.type = 'button';
      btn.style.background = hex;
      btn.title = hex.toUpperCase();
      btn.addEventListener('click', () => {
        const next = hexToHsv(hex);
        h = next.h; s = next.s; v = next.v;
        commit();
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removeSwatch(hex);
      });
      swatchesEl.appendChild(btn);
    }
  }
  paintSwatches();
  unsubs.push(onSwatchesChange(paintSwatches));

  // ── Tab switching ────────────────────────────────────────────────────
  popover.querySelectorAll('.color-hub-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      popover.querySelectorAll('.color-hub-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      popover.querySelectorAll('.color-hub-tab-panel').forEach((p) => p.toggleAttribute('hidden', p.dataset.tab !== id));
    });
  });

  // ── Outside / escape close ───────────────────────────────────────────
  document.addEventListener('keydown', onKey);
  window.addEventListener('mousedown', onOutside, { capture: true });

  // ── Sync if active colour changes from elsewhere (e.g. another UI) ───
  unsubs.push(onActiveChange(() => {
    // Only adopt if the change didn't originate inside the hub.
    const cur = hsvToHex(h, s, v);
    if (cur === getActive()) return;
    const next = hexToHsv(getActive());
    h = next.h; s = next.s; v = next.v;
    paint();
  }));
}

function onKey(e) {
  if (e.key === 'Escape') closeColorHub();
}

function onOutside(e) {
  if (!popover) return;
  if (popover.contains(e.target)) return;
  // Don't close when clicking the dial — the dial's click handler will toggle.
  if (e.target.closest('.color-circle-btn')) return;
  closeColorHub();
}

function flashStatus(msg) {
  // Light-touch toast inside the popover (top-right corner).
  if (!popover) return;
  let toast = popover.querySelector('.color-hub-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'color-hub-toast';
    popover.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('is-visible');
  setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

// ---------------------------------------------------------------------------
// Colour conversions
// ---------------------------------------------------------------------------

function clamp255(n) { return Math.max(0, Math.min(255, n | 0)); }

function normaliseHex(raw) {
  let s = String(raw).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return '#' + s.toLowerCase();
}

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}

export function rgbToHex(r, g, b) {
  const t = (n) => clamp255(n).toString(16).padStart(2, '0');
  return `#${t(r)}${t(g)}${t(b)}`;
}

export function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn)      h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else                 h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

export function hsvToHex(h, s, v) {
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;
  const c = v * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if      (hp < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else             { r1 = c; g1 = 0; b1 = x; }
  const m = v - c;
  return rgbToHex(
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  );
}
