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
  getActiveFill, getActiveStroke, getActiveSlots, setActiveSlot, onActiveChange,
  getSwatches, addSwatch, removeSwatch, onSwatchesChange,
} from '../core/colors.js';

const RING_OUTER  = 96;       // px — outer radius of the hue ring
const RING_INNER  = 78;       // px — inner radius (where the triangle starts)
const TRI_RADIUS  = 70;       // px — triangle inscribed radius (slightly < ring inner)
const TRI_BOX     = RING_INNER * 2;  // canvas size for the triangle

let popover = null;
let unsubs = [];
let activeSlot = 'fill';     // which slot the picker writes to: 'fill' | 'stroke'
let setSlotImpl = null;       // function exposed by bindEvents so the dial can switch slots while the hub stays open

export function isColorHubOpen() { return !!popover; }

export function toggleColorHub(anchorEl, slot = 'fill') {
  if (popover) {
    // Hub already open: if the user clicks a different slot zone, switch
    // focus instead of closing. Same-slot click closes (toggle).
    if (slot !== activeSlot && setSlotImpl) {
      setSlotImpl(slot);
      return;
    }
    closeColorHub();
    return;
  }
  openColorHub(anchorEl, slot);
}

export function openColorHub(anchorEl, slot = 'fill') {
  if (popover) {
    if (slot !== activeSlot && setSlotImpl) setSlotImpl(slot);
    return;
  }
  activeSlot = (slot === 'stroke') ? 'stroke' : 'fill';
  build();
  bindEvents(anchorEl);
  position(anchorEl);
  // Position again next frame in case fonts/icons reflow the size.
  requestAnimationFrame(() => position(anchorEl));
}

export function closeColorHub() {
  for (const u of unsubs) { try { u(); } catch {} }
  unsubs = [];
  setSlotImpl = null;
  // Drawer-style close — slide-out + body class drop, DOM removal after
  // the transition finishes (240 ms). Same pattern as floating-window.js'
  // is-closing animation.
  const node = popover;
  popover = null;
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('mousedown', onOutside, { capture: true });
  document.body.classList.remove('color-hub-open');
  document.documentElement.style.removeProperty('--color-hub-h');
  if (node) {
    node.classList.add('is-closing');
    setTimeout(() => { try { node.remove(); } catch {} }, 240);
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  popover = document.createElement('div');
  popover.className = 'color-hub';
  popover.style.setProperty('--ring-outer', `${RING_OUTER * 2}px`);
  popover.style.setProperty('--ring-inner', `${RING_INNER * 2}px`);
  popover.style.setProperty('--tri-box',    `${TRI_BOX}px`);
  popover.innerHTML = `
    <div class="color-hub-slot-row">
      <div class="color-hub-slot-toggle" role="tablist" aria-label="Editing colour slot">
        <button class="color-hub-slot ${activeSlot === 'fill' ? 'is-active' : ''}" data-slot="fill" type="button" role="tab">
          <span class="color-hub-slot-chip" data-slot-chip="fill"></span>
          <span class="color-hub-slot-label">Fill</span>
        </button>
        <button class="color-hub-slot ${activeSlot === 'stroke' ? 'is-active' : ''}" data-slot="stroke" type="button" role="tab">
          <span class="color-hub-slot-chip" data-slot-chip="stroke"></span>
          <span class="color-hub-slot-label">Stroke</span>
        </button>
        <button class="color-hub-slot-swap" type="button" title="Swap fill ↔ stroke (X)" aria-label="Swap fill and stroke">
          <i class="fas fa-arrows-rotate"></i>
        </button>
      </div>
    </div>
    <div class="color-hub-row">
      <div class="color-hub-picker">
        <div class="color-hub-hue-ring" tabindex="0" aria-label="Hue ring">
          <div class="color-hub-hue-cursor"></div>
          <canvas class="color-hub-tri" width="${TRI_BOX * (window.devicePixelRatio || 1)}" height="${TRI_BOX * (window.devicePixelRatio || 1)}" style="width:${TRI_BOX}px;height:${TRI_BOX}px" aria-label="Saturation and brightness triangle"></canvas>
          <div class="color-hub-tri-cursor"></div>
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
// Drawer positioning — popover slides UP from below the wheel/dot cluster
// and sits in the gap between the cluster and the footer. CSS owns the
// fixed bottom anchor, transition and translateY transform; JS sets the
// horizontal centre line (matching the dial's golden-section anchor) and
// publishes the popover's measured height so the cluster's lift can match.
// ---------------------------------------------------------------------------

function position(anchorEl) {
  if (!popover) return;
  const r = anchorEl.getBoundingClientRect();
  // Centre the popover horizontally on the dial's centre. CSS owns
  // bottom + transform; JS sets left.
  popover.style.left = `${Math.round(r.left + r.width / 2)}px`;
  // Publish the measured height so the cluster lift CSS rule can use it.
  // 8 px breathing gap between the popover top and the lifted cluster.
  const ph = popover.offsetHeight;
  if (ph > 0) {
    document.documentElement.style.setProperty('--color-hub-h', `${ph}px`);
  }
  // Trigger the open transition. Force a synchronous layout read first
  // so the browser registers the closed (translateY(110%)) state before
  // we toggle to is-open — without this, the transition skips and the
  // popover snaps in. Using a forced reflow instead of requestAnimationFrame
  // because RAF can be throttled / deferred in some environments
  // (headless preview, off-screen tabs) and we need the open state to
  // apply reliably on every call.
  if (!popover.classList.contains('is-open')) {
    /* eslint-disable-next-line no-unused-expressions */
    popover.offsetHeight;
    popover.classList.add('is-open');
    document.body.classList.add('color-hub-open');
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindEvents(anchorEl) {
  const hueRing  = popover.querySelector('.color-hub-hue-ring');
  const hueCursor = popover.querySelector('.color-hub-hue-cursor');
  const triCanvas = popover.querySelector('.color-hub-tri');
  const triCursor = popover.querySelector('.color-hub-tri-cursor');
  const preview  = popover.querySelector('.color-hub-preview');
  const hexEl    = popover.querySelector('.color-hub-hex');
  const rEl      = popover.querySelector('.color-hub-r');
  const gEl      = popover.querySelector('.color-hub-g');
  const bEl      = popover.querySelector('.color-hub-b');
  const swatchesEl = popover.querySelector('.color-hub-swatches');

  // Local HSV state — mirrors whichever slot is currently active.
  // Switching slots re-syncs from that slot's hex.
  let { h, s, v } = hexToHsv(activeColor());

  function activeColor() {
    return activeSlot === 'stroke' ? getActiveStroke() : getActiveFill();
  }

  // Cache the triangle bitmap — repaint only when hue changes.
  let lastTriHue = null;

  function paint() {
    const hex = hsvToHex(h, s, v);
    preview.style.background = hex;
    // Cursor on hue ring — at midline of the ring thickness.
    const ringMidR = (RING_OUTER + RING_INNER) / 2;
    const a = (h - 90) * Math.PI / 180;
    const hx = Math.cos(a) * ringMidR;
    const hy = Math.sin(a) * ringMidR;
    hueCursor.style.transform = `translate(calc(-50% + ${hx}px), calc(-50% + ${hy}px))`;
    // Repaint the triangle gradient if the hue moved.
    if (lastTriHue !== h) {
      paintTriangle(triCanvas, h);
      lastTriHue = h;
    }
    // Triangle cursor at the (s, v) point in barycentric space.
    const pos = svToTrianglePos(s, v, h);
    const ringR = hueRing.getBoundingClientRect();
    triCursor.style.left = `${ringR.width / 2 + pos.x}px`;
    triCursor.style.top  = `${ringR.height / 2 + pos.y}px`;
    // Inputs (don't fight the user as they type).
    if (document.activeElement !== hexEl) hexEl.value = hex.toUpperCase();
    const rgb = hexToRgb(hex);
    if (document.activeElement !== rEl) rEl.value = rgb.r;
    if (document.activeElement !== gEl) gEl.value = rgb.g;
    if (document.activeElement !== bEl) bEl.value = rgb.b;
  }

  function commit() {
    setActiveSlot(activeSlot, hsvToHex(h, s, v));
    paint();
  }

  function paintSlotChips() {
    const fillChip = popover.querySelector('[data-slot-chip="fill"]');
    const strokeChip = popover.querySelector('[data-slot-chip="stroke"]');
    if (fillChip)   fillChip.style.background = getActiveFill();
    if (strokeChip) strokeChip.style.background = getActiveStroke();
    popover.querySelectorAll('.color-hub-slot').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.slot === activeSlot);
    });
  }

  // Expose a setter so toggleColorHub() / openColorHub() can change the
  // focused slot while the popover stays open.
  setSlotImpl = (slot) => {
    if (slot !== 'fill' && slot !== 'stroke') return;
    if (slot === activeSlot) return;
    activeSlot = slot;
    const next = hexToHsv(activeColor());
    h = next.h; s = next.s; v = next.v;
    paint();
    paintSlotChips();
  };

  // ── Slot toggle (Fill | Stroke) ────────────────────────────────────
  popover.querySelectorAll('.color-hub-slot').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const slot = tab.dataset.slot;
      if (slot === activeSlot) return;
      setSlotImpl(slot);
    });
  });
  // Swap arrow — convenience shortcut for X.
  popover.querySelector('.color-hub-slot-swap')?.addEventListener('click', (e) => {
    e.stopPropagation();
    import('../core/colors.js').then(({ swapFillStroke }) => swapFillStroke());
  });

  paint();
  paintSlotChips();

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

  // ── Triangle drag ────────────────────────────────────────────────────
  function triSvFromEvent(e) {
    const ringR = hueRing.getBoundingClientRect();
    const cx = ringR.left + ringR.width / 2;
    const cy = ringR.top  + ringR.height / 2;
    return trianglePosToSv(e.clientX - cx, e.clientY - cy, h);
  }
  let tridrag = false;
  triCanvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    tridrag = true;
    triCanvas.setPointerCapture(e.pointerId);
    const next = triSvFromEvent(e);
    s = next.s; v = next.v;
    commit();
  });
  triCanvas.addEventListener('pointermove', (e) => {
    if (!tridrag) return;
    const next = triSvFromEvent(e);
    s = next.s; v = next.v;
    commit();
  });
  triCanvas.addEventListener('pointerup', (e) => {
    if (!tridrag) return;
    tridrag = false;
    try { triCanvas.releasePointerCapture(e.pointerId); } catch {}
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

  // ── Sync if active colours change from elsewhere (e.g. X swap, Save
  // button, plugin write). Repaints the slot chips both for fill and
  // stroke; resyncs the local HSV from the CURRENT slot's value.
  unsubs.push(onActiveChange(() => {
    const cur = hsvToHex(h, s, v);
    const target = activeColor();
    if (cur !== target) {
      const next = hexToHsv(target);
      h = next.h; s = next.s; v = next.v;
      paint();
    }
    paintSlotChips();
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

// ---------------------------------------------------------------------------
// Adobe-style HSL triangle inscribed in the hue ring's hole.
// Three vertices around a circle of radius TRI_RADIUS, centred on the picker:
//   • Hue vertex    — at the angle of the current hue (12 o'clock = hue 0)
//   • White vertex  — 120° clockwise from hue
//   • Black vertex  — 240° clockwise from hue (i.e. 120° CCW)
// (s, v) ↔ barycentric:
//   wHue   = s * v
//   wWhite = (1 - s) * v
//   wBlack = 1 - v
// ---------------------------------------------------------------------------

function triangleVertices(hueDeg) {
  const a0 = (hueDeg - 90) * Math.PI / 180;        // hue vertex
  const a1 = a0 + (2 * Math.PI / 3);                // white vertex (120° CW)
  const a2 = a0 - (2 * Math.PI / 3);                // black vertex (120° CCW)
  return {
    hue:   [Math.cos(a0) * TRI_RADIUS, Math.sin(a0) * TRI_RADIUS],
    white: [Math.cos(a1) * TRI_RADIUS, Math.sin(a1) * TRI_RADIUS],
    black: [Math.cos(a2) * TRI_RADIUS, Math.sin(a2) * TRI_RADIUS],
  };
}

function svToTrianglePos(s, v, hueDeg) {
  const sN = s / 100;
  const vN = v / 100;
  const wHue   = sN * vN;
  const wWhite = (1 - sN) * vN;
  const wBlack = 1 - vN;
  const tri = triangleVertices(hueDeg);
  return {
    x: wHue * tri.hue[0]   + wWhite * tri.white[0] + wBlack * tri.black[0],
    y: wHue * tri.hue[1]   + wWhite * tri.white[1] + wBlack * tri.black[1],
  };
}

// Convert a click position (relative to the ring's centre) into (s, v) by
// solving for barycentric weights against the triangle vertices, then
// clamping out-of-triangle clicks to the nearest in-triangle point.
function trianglePosToSv(x, y, hueDeg) {
  const tri = triangleVertices(hueDeg);
  let { w0, w1, w2 } = barycentric(x, y, tri.hue, tri.white, tri.black);
  if (w0 < 0 || w1 < 0 || w2 < 0) {
    w0 = Math.max(0, w0);
    w1 = Math.max(0, w1);
    w2 = Math.max(0, w2);
    const sum = w0 + w1 + w2;
    if (sum > 0) { w0 /= sum; w1 /= sum; w2 /= sum; }
  }
  const v = (w0 + w1) * 100;
  const s = (w0 + w1) > 1e-3 ? (w0 / (w0 + w1)) * 100 : 0;
  return { s, v };
}

function barycentric(px, py, A, B, C) {
  const v0x = B[0] - A[0], v0y = B[1] - A[1];
  const v1x = C[0] - A[0], v1y = C[1] - A[1];
  const v2x = px - A[0],   v2y = py - A[1];
  const d00 = v0x * v0x + v0y * v0y;
  const d01 = v0x * v1x + v0y * v1y;
  const d11 = v1x * v1x + v1y * v1y;
  const d20 = v2x * v0x + v2y * v0y;
  const d21 = v2x * v1x + v2y * v1y;
  const denom = d00 * d11 - d01 * d01;
  const w1 = (d11 * d20 - d01 * d21) / denom;
  const w2 = (d00 * d21 - d01 * d20) / denom;
  const w0 = 1 - w1 - w2;
  return { w0, w1, w2 };
}

function paintTriangle(canvas, hueDeg) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Triangle vertex coords from triangleVertices() are in CSS-pixel space
  // (TRI_RADIUS = 70 CSS px). The canvas backing store is W × H DEVICE
  // pixels — on a 2× display W = 312 even though the CSS-displayed width
  // is 156. Scale the vertices by `dprScale` so the painted triangle
  // covers the full backing-store canvas; CSS scales it back down to
  // the 156 px display size, giving a crisp 2× rendering.
  const dprScale = W / TRI_BOX;
  const cx = W / 2, cy = H / 2;
  const tri = triangleVertices(hueDeg);
  const A = [tri.hue[0]   * dprScale + cx, tri.hue[1]   * dprScale + cy];
  const B = [tri.white[0] * dprScale + cx, tri.white[1] * dprScale + cy];
  const C = [tri.black[0] * dprScale + cx, tri.black[1] * dprScale + cy];

  const hueRgb = hsvToRgb(hueDeg, 100, 100);

  // Restrict iteration to the triangle's bbox + 1 px slack for AA.
  const minX = Math.max(0,    Math.floor(Math.min(A[0], B[0], C[0])) - 1);
  const maxX = Math.min(W - 1, Math.ceil (Math.max(A[0], B[0], C[0])) + 1);
  const minY = Math.max(0,    Math.floor(Math.min(A[1], B[1], C[1])) - 1);
  const maxY = Math.min(H - 1, Math.ceil (Math.max(A[1], B[1], C[1])) + 1);

  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const { w0, w1, w2 } = barycentric(px, py, A, B, C);
      // 1 px AA slack
      if (w0 < -0.005 || w1 < -0.005 || w2 < -0.005) continue;
      const cw0 = Math.max(0, w0), cw1 = Math.max(0, w1), cw2 = Math.max(0, w2);
      const sum = cw0 + cw1 + cw2;
      if (sum === 0) continue;
      const nw0 = cw0 / sum, nw1 = cw1 / sum, nw2 = cw2 / sum;
      const r = nw0 * hueRgb.r + nw1 * 255;
      const g = nw0 * hueRgb.g + nw1 * 255;
      const b = nw0 * hueRgb.b + nw1 * 255;
      const idx = (py * W + px) * 4;
      data[idx]     = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function hsvToRgb(h, s, v) {
  const hex = hsvToHex(h, s, v);
  return hexToRgb(hex);
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
