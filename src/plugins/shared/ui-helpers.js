// Shared DOM helpers for plugin UIs.

import { createKnob } from './knob.js';
import { createNumericInput } from './numeric-input.js';

/**
 * clampToViewport — positions a portaled menu element so it stays within the
 * visible viewport. Reads the menu's natural size (assumes it is already
 * attached to document.body with `visibility:hidden` or freshly inserted),
 * then clamps `left` to [8, vw - menuW - 8] and flips above the anchor when
 * there is more room above than below.
 *
 * @param {HTMLElement} menuEl  - The floating menu element (position: fixed).
 * @param {DOMRect}     anchorRect - getBoundingClientRect() of the trigger.
 */
export function clampToViewport(menuEl, anchorRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = menuEl.offsetWidth || 200;
  const menuH = menuEl.offsetHeight || 100;
  const spaceBelow = vh - anchorRect.bottom;
  const spaceAbove = anchorRect.top;

  let left = anchorRect.right - menuW;
  left = Math.max(8, Math.min(vw - menuW - 8, left));

  let top;
  if (spaceBelow >= menuH + 6 || spaceBelow >= spaceAbove) {
    // Open below
    top = anchorRect.bottom + 6;
    menuEl.classList.remove('add-effect-menu--up');
  } else {
    // Open above
    top = anchorRect.top - menuH - 6;
    menuEl.classList.add('add-effect-menu--up');
  }

  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
}

export function makeRoot(extra = '') {
  const el = document.createElement('div');
  el.className = `effect-inline-controls ${extra}`;
  return el;
}

export function makeToolRoot(extra = '') {
  const el = document.createElement('div');
  el.className = `effect-tool-controls ${extra}`;
  return el;
}

export function sliderRow({ label, min, max, step = 1, value, defaultValue, onChange, format, suffix, snapWithShift = 0 }) {
  const row = document.createElement('label');
  row.className = 'effect-slider-row';

  const lbl = document.createElement('span');
  lbl.className = 'effect-label';
  lbl.textContent = label;
  row.appendChild(lbl);

  const knob = createKnob({
    size: 28,
    min, max, step,
    value,
    defaultValue: defaultValue !== undefined ? defaultValue : value,
    snapWithShift,
    onChange: (v) => {
      numWrap.setValue(format ? format(v) : v);
      onChange(format ? format(v) : v);
    },
  });
  row.appendChild(knob);

  const numWrap = createNumericInput({
    min, max, step,
    value: format ? format(value) : value,
    suffix,
    onChange: (v) => {
      knob.setValue(v);
      onChange(v);
    },
  });
  row.appendChild(numWrap);

  return row;
}

export function pillGroup({ label, options, value, onChange, variant }) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-tool-row';
  wrap.innerHTML = `<span class="effect-label">${label}</span><div class="effect-pill-group ${variant === 'icon' ? 'effect-pill-group--icon' : ''}"></div>`;
  const group = wrap.querySelector('.effect-pill-group');
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `effect-pill ${opt.value === value ? 'active' : ''}`;
    btn.dataset.value = opt.value;
    if (opt.iconClass) {
      // Font Awesome icon — keep text label as title for a11y / tooltip.
      btn.innerHTML = `<i class="fas fa-${opt.iconClass}"></i>`;
      btn.title = opt.label || opt.value;
      btn.setAttribute('aria-label', opt.label || opt.value);
    } else {
      btn.textContent = opt.label || opt.value;
    }
    btn.addEventListener('click', () => {
      group.querySelectorAll('.effect-pill').forEach((p) => p.classList.toggle('active', p.dataset.value === String(opt.value)));
      onChange(opt.value);
    });
    group.appendChild(btn);
  }
  return wrap;
}

export function selectRow({ label, options, value, onChange }) {
  const row = document.createElement('label');
  row.className = 'effect-slider-row';
  row.innerHTML = `
    <span class="effect-label">${label}</span>
    <select class="effect-select" style="grid-column: 2 / span 2"></select>
  `;
  const sel = row.querySelector('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label || opt.value;
    if (opt.value === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', (e) => onChange(e.target.value));
  return row;
}

export function colorRow({ label, value, onChange }) {
  const row = document.createElement('label');
  row.className = 'effect-slider-row';
  row.innerHTML = `
    <span class="effect-label">${label}</span>
    <input type="color" value="${value}" style="grid-column: 2 / span 2; height: 24px; padding: 0; border-radius: 3px; border: 1px solid var(--vhs-shadow);" />
  `;
  row.querySelector('input').addEventListener('input', (e) => onChange(e.target.value));
  return row;
}

// ---------- toggleRow ----------
// Simple on/off toggle switch row.
// align: 'left' — label hugs left edge, switch pushed to the right.
// align: 'default' (or omitted) — default flex layout (label fills, switch follows).
export function toggleRow({ label, value, onChange, align }) {
  const wrap = document.createElement('label');
  wrap.className = `effect-toggle-row${align === 'left' ? ' effect-toggle-row--align-left' : ''}`;
  wrap.innerHTML = `
    <span class="effect-label">${label}</span>
    <input type="checkbox" ${value ? 'checked' : ''} />
    <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
  `;
  wrap.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
  return wrap;
}

// ---------- groupedSelectRow ----------
// Custom dropdown with group headings. Portals the menu to document.body so
// it can escape overflow:hidden containers. Never uses a native <select>.
export function groupedSelectRow({ label, groups, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-tool-row';
  const lbl = document.createElement('div');
  lbl.className = 'effect-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);

  // Track current selected value for wheel cycling.
  let currentValue = value;

  const dd = document.createElement('div');
  dd.className = 'custom-dropdown';
  dd.tabIndex = 0;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';
  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'custom-dropdown-label';
  trigger.appendChild(triggerLabel);
  const caret = document.createElement('span');
  caret.className = 'custom-dropdown-caret';
  trigger.appendChild(caret);
  dd.appendChild(trigger);

  // Menu lives on document.body so it can escape the effect-card's overflow:hidden.
  const menu = document.createElement('div');
  menu.className = 'custom-dropdown-menu custom-dropdown-menu--portaled';
  for (const grp of groups) {
    const head = document.createElement('div');
    head.className = 'custom-dropdown-group';
    head.textContent = grp.label;
    menu.appendChild(head);
    for (const it of grp.items) {
      const opt = document.createElement('div');
      opt.className = 'custom-dropdown-item';
      opt.dataset.value = it.value;
      opt.textContent = it.label;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        select(it.value, it.label);
        close();
      });
      menu.appendChild(opt);
    }
  }

  function flatItem(v) {
    for (const grp of groups) for (const it of grp.items) if (it.value === v) return it;
    return null;
  }
  function select(v, lab) {
    currentValue = v;
    triggerLabel.textContent = lab ?? flatItem(v)?.label ?? v;
    menu.querySelectorAll('.custom-dropdown-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.value === v);
    });
    onChange(v);
  }
  function positionMenu() {
    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom;
    const maxH = Math.min(280, Math.max(140, (spaceBelow > 200 ? spaceBelow - 16 : r.top - 16)));
    menu.style.maxHeight = `${maxH}px`;
    menu.style.width = `${r.width}px`;
    menu.style.left = `${r.left}px`;
    if (spaceBelow > 200 || spaceBelow > r.top) {
      menu.style.top = `${r.bottom + 4}px`;
      menu.style.bottom = '';
    } else {
      menu.style.top = '';
      menu.style.bottom = `${vh - r.top + 4}px`;
    }
  }
  function open() {
    dd.classList.add('open');
    document.body.appendChild(menu);
    positionMenu();
    const active = menu.querySelector('.custom-dropdown-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
    document.addEventListener('mousedown', onOutside, { capture: true });
    window.addEventListener('scroll', positionMenu, { capture: true, passive: true });
    window.addEventListener('resize', positionMenu);
  }
  function close() {
    dd.classList.remove('open');
    if (menu.parentNode) menu.parentNode.removeChild(menu);
    document.removeEventListener('mousedown', onOutside, { capture: true });
    window.removeEventListener('scroll', positionMenu, { capture: true });
    window.removeEventListener('resize', positionMenu);
  }
  function onOutside(e) {
    if (!dd.contains(e.target) && !menu.contains(e.target)) close();
  }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dd.classList.contains('open')) close();
    else open();
  });
  dd.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Scroll-wheel cycles through all items across groups (wraps at ends).
  trigger.addEventListener('wheel', (e) => {
    e.preventDefault();
    const allItems = [];
    for (const grp of groups) for (const it of grp.items) allItems.push(it);
    const currentIdx = allItems.findIndex((it) => it.value === currentValue);
    const delta = e.deltaY > 0 ? 1 : -1;
    const nextIdx = (currentIdx + delta + allItems.length) % allItems.length;
    const next = allItems[nextIdx];
    select(next.value, next.label);
  }, { passive: false });

  // Init label + active marker
  const initial = flatItem(value);
  triggerLabel.textContent = initial?.label ?? value;
  menu.querySelectorAll('.custom-dropdown-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.value === value);
  });

  wrap.appendChild(dd);
  return wrap;
}

// ---------- gradientStopsRow ----------
// Inline gradient editor: a coloured bar with draggable stop handles.
// { label, stops, onChange } — stops: Array<{ at: 0..1, color: '#hex' }>
// Returns a DOM element. Caller is responsible for inserting it.
export function gradientStopsRow({ label, stops: initialStops, onChange }) {
  // Work on a local mutable copy.
  const local = { stops: (initialStops || [{ at: 0, color: '#000000' }, { at: 1, color: '#FFFFFF' }]).slice() };

  const container = document.createElement('div');
  container.className = 'gradient-stops-row';

  if (label) {
    const lbl = document.createElement('div');
    lbl.className = 'effect-label gradient-stops-label';
    lbl.textContent = label;
    container.appendChild(lbl);
  }

  const wrap = document.createElement('div');
  wrap.className = 'gradient-editor';
  container.appendChild(wrap);

  const bar = document.createElement('div');
  bar.className = 'gradient-bar';
  bar.style.background = _stopsToCss(local.stops);
  wrap.appendChild(bar);

  const handles = document.createElement('div');
  handles.className = 'gradient-handles';
  wrap.appendChild(handles);

  const hint = document.createElement('div');
  hint.className = 'gradient-hint';
  hint.textContent = 'Click bar to add · drag handle to move · double-click to remove';
  container.appendChild(hint);

  function refreshBar() {
    bar.style.background = _stopsToCss(local.stops);
  }

  function placeHandle(idx) {
    const stop = local.stops[idx];
    const h = document.createElement('div');
    h.className = 'gradient-handle';
    h.style.background = stop.color;
    h.style.left = `${stop.at * 100}%`;
    h.title = `${stop.color} @ ${(stop.at * 100).toFixed(0)}%`;

    const colorInp = document.createElement('input');
    colorInp.type = 'color';
    colorInp.value = stop.color;
    colorInp.className = 'gradient-handle-color';
    h.appendChild(colorInp);
    colorInp.addEventListener('input', (e) => {
      local.stops[idx] = { ...local.stops[idx], color: e.target.value };
      onChange(local.stops.slice());
      h.style.background = e.target.value;
      refreshBar();
    });

    let dragging = false;
    let moved = false;
    h.addEventListener('mousedown', (e) => {
      if (e.target === colorInp) return;
      e.preventDefault();
      dragging = true;
      moved = false;
    });
    const onMove = (e) => {
      if (!dragging) return;
      const rect = bar.getBoundingClientRect();
      const at = _clamp((e.clientX - rect.left) / rect.width, 0, 1);
      if (Math.abs(at - local.stops[idx].at) > 0.001) moved = true;
      local.stops[idx] = { ...local.stops[idx], at };
      h.style.left = `${at * 100}%`;
      h.title = `${local.stops[idx].color} @ ${(at * 100).toFixed(0)}%`;
      onChange(local.stops.slice());
      refreshBar();
    };
    const onUp = () => { dragging = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    h.addEventListener('click', (e) => { if (moved) e.stopPropagation(); });
    h.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (local.stops.length <= 2) return;
      local.stops.splice(idx, 1);
      onChange(local.stops.slice());
      rebuildHandles();
    });
    handles.appendChild(h);
  }

  function rebuildHandles() {
    handles.innerHTML = '';
    local.stops.forEach((_, idx) => placeHandle(idx));
    refreshBar();
  }

  rebuildHandles();

  bar.addEventListener('click', (e) => {
    if (local.stops.length >= 8) return;
    const rect = bar.getBoundingClientRect();
    const at = _clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const sorted = local.stops.slice().sort((a, b) => a.at - b.at);
    const color = _sampleStops(sorted, at);
    local.stops.push({ at, color });
    onChange(local.stops.slice());
    rebuildHandles();
  });

  // Allow caller to push updated stops into the widget externally.
  container.updateStops = (newStops) => {
    local.stops = newStops.slice();
    rebuildHandles();
  };

  return container;
}

// ---------- Internal helpers (not exported) ----------
function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function _stopsToCss(stops) {
  const sorted = stops.slice().sort((a, b) => a.at - b.at);
  return `linear-gradient(to right, ${sorted.map((s) => `${s.color} ${(s.at * 100).toFixed(1)}%`).join(', ')})`;
}

function _hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 };
}

function _rgbToHex(r, g, b) {
  const to2 = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function _sampleStops(sorted, at) {
  let s = 0;
  while (s < sorted.length - 2 && sorted[s + 1].at < at) s++;
  const a = sorted[s], b = sorted[s + 1] || sorted[s];
  const span = (b.at - a.at) || 1;
  const k = _clamp((at - a.at) / span, 0, 1);
  const ca = _hexToRgb(a.color), cb = _hexToRgb(b.color);
  const lerp = (x, y, t) => x + (y - x) * t;
  return _rgbToHex(lerp(ca.r, cb.r, k), lerp(ca.g, cb.g, k), lerp(ca.b, cb.b, k));
}

// ---------- tripleSlider ----------
// A single horizontal track with three drag handles for Levels: black (lo),
// gamma (mid), and white (hi). The track shows a black→grey→white gradient.
// Double-click a handle to reset to its default. Scroll wheel nudges value.
//
// @param {object} opts
//   label   {string}  Row label (e.g. 'Levels')
//   lo      {number}  Black point, 0..254
//   mid     {number}  Gamma, 0.05..9.99
//   hi      {number}  White point, 1..255
//   onChange  {function({lo, mid, hi})}
//
// Returns a DOM element.
export function tripleSlider({ label, lo: initLo, mid: initMid, hi: initHi, onChange }) {
  let lo = _clamp(initLo ?? 0, 0, 254);
  let hi = _clamp(initHi ?? 255, 1, 255);
  let mid = _clamp(initMid ?? 1, 0.05, 9.99);

  const wrap = document.createElement('div');
  wrap.className = 'triple-slider-row';

  if (label) {
    const lbl = document.createElement('div');
    lbl.className = 'effect-label triple-slider-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);
  }

  const track = document.createElement('div');
  track.className = 'triple-slider-track';
  wrap.appendChild(track);

  const readout = document.createElement('div');
  readout.className = 'triple-slider-readout';
  wrap.appendChild(readout);

  // --- helpers ---
  function loFrac()  { return lo / 255; }
  function hiFrac()  { return hi / 255; }
  // gamma handle lives between lo and hi on the track
  function midFrac() {
    const loF = loFrac();
    const hiF = hiFrac();
    // map mid (gamma) 0.05..9.99 to 0..1 within the lo..hi band
    // We place the midpoint handle at a fraction that represents the neutral
    // point: when mid=1, it sits at the centre of [lo, hi].
    // Map: mid=1 → 0.5 (centre), <1 → right of centre, >1 → left of centre.
    // Formula: linearFrac = 1 - (gamma - 1) / (gamma_max - 1) *0.5 + offset...
    // Simpler: place it proportional to log space.
    const logNorm = Math.log(mid) / Math.log(9.99); // -∞..1, centred at 0 when mid=1
    const frac = 0.5 - logNorm * 0.45; // inverted: high gamma → left
    return loF + _clamp(frac, 0.01, 0.99) * (hiF - loF);
  }

  function updateGradient() {
    const loP = (loFrac() * 100).toFixed(1);
    const hiP = (hiFrac() * 100).toFixed(1);
    track.style.background = `linear-gradient(to right, #000 0%, #000 ${loP}%, #888 ${((loFrac() + hiFrac()) / 2 * 100).toFixed(1)}%, #fff ${hiP}%, #fff 100%)`;
  }

  function updateReadout() {
    readout.textContent = `B ${lo}  γ ${mid.toFixed(2)}  W ${hi}`;
  }

  function notify() { onChange({ lo, mid, hi }); }

  // --- handle factory ---
  function makeHandle(cls, getFrac, defVal, onDrag) {
    const h = document.createElement('div');
    h.className = `triple-slider-handle ${cls}`;
    h.style.left = `${getFrac() * 100}%`;
    h.title = cls;

    let dragging = false;
    h.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      const onMove = (ev) => {
        if (!dragging) return;
        const rect = track.getBoundingClientRect();
        const frac = _clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        onDrag(frac);
        h.style.left = `${getFrac() * 100}%`;
        updateGradient();
        updateReadout();
        notify();
        // Reposition mid handle too (it depends on lo/hi)
        if (midHandleEl) midHandleEl.style.left = `${midFrac() * 100}%`;
      };
      const onUp = () => {
        dragging = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    h.addEventListener('dblclick', () => {
      onDrag(defVal / 255, true /* isDefault */);
      h.style.left = `${getFrac() * 100}%`;
      if (midHandleEl) midHandleEl.style.left = `${midFrac() * 100}%`;
      updateGradient();
      updateReadout();
      notify();
    });

    h.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const frac = _clamp(getFrac() + dir / 255, 0, 1);
      onDrag(frac);
      h.style.left = `${getFrac() * 100}%`;
      if (midHandleEl) midHandleEl.style.left = `${midFrac() * 100}%`;
      updateGradient();
      updateReadout();
      notify();
    }, { passive: false });

    return h;
  }

  const loHandle = makeHandle('triple-handle-lo', loFrac, 0,
    (frac, isDef) => {
      if (isDef) { lo = 0; return; }
      lo = _clamp(Math.round(frac * 255), 0, hi - 1);
    },
  );

  const hiHandle = makeHandle('triple-handle-hi', hiFrac, 255,
    (frac, isDef) => {
      if (isDef) { hi = 255; return; }
      hi = _clamp(Math.round(frac * 255), lo + 1, 255);
    },
  );

  // Gamma handle: dragging maps position within [lo,hi] band to gamma log-space.
  let midHandleEl = null;
  const gammaHandle = makeHandle('triple-handle-mid', midFrac, 1,
    (frac, isDef) => {
      if (isDef) { mid = 1; return; }
      // frac is within [loFrac, hiFrac]. Convert to local [0,1] then to log-space gamma.
      const loF = loFrac(); const hiF = hiFrac();
      const span = hiF - loF;
      const local = span > 0.001 ? _clamp((frac - loF) / span, 0.01, 0.99) : 0.5;
      // invert: local=0.5 → mid=1; local<0.5 → mid<1; local>0.5 → mid<1 (curve right)
      const logNorm = (0.5 - local) / 0.45;
      mid = _clamp(Math.exp(logNorm * Math.log(9.99)), 0.05, 9.99);
      mid = Math.round(mid * 100) / 100;
    },
  );
  midHandleEl = gammaHandle;

  // Double-click reset gamma to 1
  gammaHandle.addEventListener('dblclick', () => {
    mid = 1;
    gammaHandle.style.left = `${midFrac() * 100}%`;
    updateGradient();
    updateReadout();
    notify();
  });

  track.appendChild(loHandle);
  track.appendChild(hiHandle);
  track.appendChild(gammaHandle);

  updateGradient();
  updateReadout();

  return wrap;
}
