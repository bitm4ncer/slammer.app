// Radial quick-select wheel surrounding the footer colour circle (Phase 21
// "Ctrl+Space radial effect picker", evolved into a permanent surface).
//
// 8 slots evenly distributed around a full circle (45° apart). Only the
// top hemisphere is visible — clip-path masks the lower half. Rotation in
// 45° steps brings hidden slots up into the visible arc.
//
// Interaction:
//   • Up / Down arrows on the LEFT rotate the wheel ±45°.
//   • Three-dots on the RIGHT opens the assignment flyout — pick a filter,
//     tool, or PANEL plugin (e.g. fal.ai), then click a slot.
//   • Scrolling while hovering the colour circle rotates the wheel.
//   • Clicking a filled slot:
//       - filter/tool → adds the effect to the active layer
//       - panel       → opens the plugin window via openPluginWindow.
//   • Hovering a slot shows the plugin's name as a small label above it.
//
// Storage: slammer:quick-wheel-slots — array length 8, each entry either
//   null (empty) or { effectId, icon }.

import { listPlugins, getPlugin, makeEffectInstance } from '../plugins/registry.js';
import { openPluginWindow } from './plugin-host.js';

const STORAGE_KEY    = 'slammer:quick-wheel-slots';
const SLOT_COUNT     = 8;
const STEP_DEG       = 360 / SLOT_COUNT; // 45°
const SLOT_OFFSET    = STEP_DEG / 2;     // 22.5° — keeps slots off the equator
const SLOT_RADIUS    = 78;               // px from centre to slot icon centre
const ROTATE_RIPPLE  = 'rotate-ripple';

const DEFAULT_SLOTS = [
  { effectId: 'blur',         icon: 'feather' },
  { effectId: 'drop-shadow',  icon: 'square-caret-down' },
  { effectId: 'twirl',        icon: 'arrows-spin' },
  { effectId: 'grain',        icon: 'wave-square' },
  null, null, null, null,
];

function loadSlots() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(raw) && raw.length === SLOT_COUNT) return raw;
  } catch {}
  return DEFAULT_SLOTS.slice();
}
function saveSlots(slots) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slots)); } catch {}
}

export function initQuickSelectWheel({ document: doc, anchorEl }) {
  if (!anchorEl) return;

  let slots = loadSlots();
  let rotation = 0;
  let assignMode = null;

  // ── Wheel container — visual half-disc only. Controls live OUTSIDE so
  //    they aren't clipped by the half-disc clip-path and stay above the
  //    footer line. ────────────────────────────────────────────────────
  const wheel = window.document.createElement('div');
  wheel.className = 'quick-wheel';
  wheel.innerHTML = `
    <svg class="quick-wheel-bg" viewBox="-130 -130 260 260" aria-hidden="true">
      <!-- Static translucent half-disc background fills the visible
           hemisphere so the wheel reads as a discrete surface. The
           diameter line at y=0 acts as the closing edge. -->
      <path d="M -128 0 A 128 128 0 0 0 128 0 Z" fill="rgba(0, 0, 0, 0.72)" />
      <!-- Rotating spoke rotor + concentric gear rings. The whole group
           rotates as a unit so the gear marks travel with the slots. -->
      <g class="quick-wheel-rotor">
        ${spokes()}
        <circle cx="0" cy="0" r="118" fill="none" stroke="rgba(255, 255, 255, 0.4)"  stroke-width="2"></circle>
        <circle cx="0" cy="0" r="62"  fill="none" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1.2"></circle>
        ${tickMarks()}
      </g>
    </svg>
    <div class="quick-wheel-slot-rotor"></div>
  `;
  window.document.body.appendChild(wheel);
  const slotRotor = wheel.querySelector('.quick-wheel-slot-rotor');
  const rotor     = wheel.querySelector('.quick-wheel-rotor');

  // ── Controls — fixed-positioned siblings of the wheel. They sit
  //    ABOVE the footer (bottom: 40px clears the 36 px footer + 4 px
  //    breathing room) and flank the wheel left/right. ───────────────
  const controls = window.document.createElement('div');
  controls.className = 'quick-wheel-controls';
  controls.innerHTML = `
    <div class="quick-wheel-nav-stack">
      <button class="quick-wheel-key quick-wheel-nav--up"   aria-label="Rotate wheel up"><i class="fas fa-caret-up"></i></button>
      <button class="quick-wheel-key quick-wheel-nav--down" aria-label="Rotate wheel down"><i class="fas fa-caret-down"></i></button>
    </div>
    <button class="quick-wheel-key quick-wheel-config" aria-label="Configure wheel slots"><i class="fas fa-ellipsis"></i></button>
  `;
  window.document.body.appendChild(controls);

  function spokes() {
    const lines = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const a = (i * STEP_DEG - 90) * Math.PI / 180;
      const x1 = Math.cos(a) * 28;   // start outside the central hub
      const y1 = Math.sin(a) * 28;
      const x2 = Math.cos(a) * 118;
      const y2 = Math.sin(a) * 118;
      lines.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(255,255,255,0.32)" stroke-width="1.6"></line>`);
    }
    return lines.join('');
  }

  // 24 short tick marks around the outer rim — gear / dial detail.
  function tickMarks() {
    const ticks = [];
    for (let i = 0; i < 24; i++) {
      const a = (i * 15 - 90) * Math.PI / 180;
      const x1 = Math.cos(a) * 110;
      const y1 = Math.sin(a) * 110;
      const x2 = Math.cos(a) * 118;
      const y2 = Math.sin(a) * 118;
      ticks.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(255,255,255,0.28)" stroke-width="1"></line>`);
    }
    return ticks.join('');
  }

  // Build slot DOM ONCE — slots stay anchored at their fixed polar
  // positions; only the rotor wrappers rotate. Inner content
  // counter-rotates so icons stay upright (Affinity / iOS dial style).
  function buildSlots() {
    slotRotor.innerHTML = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const angleDeg = SLOT_OFFSET + i * STEP_DEG;
      const a = (angleDeg - 90) * Math.PI / 180;
      const x = Math.cos(a) * SLOT_RADIUS;
      const y = Math.sin(a) * SLOT_RADIUS;

      const btn = window.document.createElement('button');
      btn.className = 'quick-wheel-slot';
      btn.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      btn.setAttribute('data-slot', String(i));
      btn.innerHTML = `
        <span class="quick-wheel-slot-counter">
          <i class="fas"></i>
          <span class="quick-wheel-slot-label"></span>
        </span>
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSlotClick(i);
      });
      slotRotor.appendChild(btn);
    }
  }

  // Update slot CONTENTS (icon + label + filled/empty class) without
  // disturbing positions — used after assign / clear / rotation steps.
  function paintSlotContents() {
    const slotEls = slotRotor.querySelectorAll('.quick-wheel-slot');
    for (let i = 0; i < SLOT_COUNT; i++) {
      const el = slotEls[i];
      if (!el) continue;
      const slot = slots[i];
      const plugin = slot ? getPlugin(slot.effectId) : null;
      const labelText = slot ? (plugin?.name || slot.effectId) : 'Empty';
      const iconName = slot?.icon || 'plus';
      el.classList.toggle('is-filled', !!slot);
      el.classList.toggle('is-empty',  !slot);
      el.classList.toggle('is-assigning', !!assignMode);
      el.querySelector('i').className = `fas fa-${iconName}`;
      el.querySelector('.quick-wheel-slot-label').textContent = labelText;
    }
  }

  // Apply the current rotation to the rotors + counter-rotate icon
  // wrappers so the icons stay upright as the wheel turns. CSS handles
  // the actual animation via the transition declarations.
  function paintRotation() {
    rotor.style.transform = `rotate(${rotation}deg)`;
    slotRotor.style.transform = `rotate(${rotation}deg)`;
    slotRotor.querySelectorAll('.quick-wheel-slot-counter').forEach((c) => {
      c.style.transform = `rotate(${-rotation}deg)`;
    });
  }

  function paint() {
    paintSlotContents();
    paintRotation();
  }

  function onSlotClick(i) {
    if (assignMode) {
      slots[i] = { effectId: assignMode.effectId, icon: assignMode.icon };
      saveSlots(slots);
      assignMode = null;
      hideAssignFlyout();
      paint();
      return;
    }
    const slot = slots[i];
    if (!slot) {
      openAssignFlyout(i);
      return;
    }
    apply(slot.effectId);
  }

  function apply(effectId) {
    const plugin = getPlugin(effectId);
    if (!plugin) return;

    // Panel plugins open their floating window via the plugin host.
    if (plugin.type === 'panel') {
      openPluginWindow(effectId);
      return;
    }

    // Filter / tool plugins are added to the active layer's effect stack.
    const layer = doc.activeLayer;
    if (!layer) {
      console.warn('[quick-wheel] no active layer — select a layer first');
      return;
    }
    const inst = makeEffectInstance(effectId);
    if (!inst) return;
    if (plugin.type === 'tool') {
      for (const e2 of layer.effects) {
        if (getPlugin(e2.pluginId)?.type === 'tool') {
          doc.setEffectProp(layer.id, e2.id, 'expanded', false);
        }
      }
      inst.expanded = true;
    }
    doc.addEffect(layer.id, inst);
  }

  function rotateBy(steps) {
    // Don't normalise mod 360 here — keeping the cumulative angle lets
    // CSS transitions take the SHORTER path through 0/360 instead of
    // springing 315° backwards when you cross the boundary.
    rotation += steps * STEP_DEG;
    rotor.classList.add(ROTATE_RIPPLE);
    paintRotation();
    setTimeout(() => rotor.classList.remove(ROTATE_RIPPLE), 480);
  }

  controls.querySelector('.quick-wheel-nav--up')  .addEventListener('click', (e) => { e.stopPropagation(); rotateBy(-1); });
  controls.querySelector('.quick-wheel-nav--down').addEventListener('click', (e) => { e.stopPropagation(); rotateBy(+1); });
  controls.querySelector('.quick-wheel-config')   .addEventListener('click', (e) => { e.stopPropagation(); openAssignFlyout(null); });

  anchorEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    rotateBy(e.deltaY > 0 ? +1 : -1);
  }, { passive: false });

  // ── Assignment flyout ─────────────────────────────────────────────────
  let flyout = null;

  function openAssignFlyout(prefilledSlotIndex) {
    if (flyout) { hideAssignFlyout(); return; }
    flyout = window.document.createElement('div');
    flyout.className = 'quick-wheel-assign-flyout';

    const filters = listPlugins({ type: 'filter' });
    const tools   = listPlugins({ type: 'tool' });
    const panels  = listPlugins({ type: 'panel' });
    const all = [...filters, ...tools, ...panels].sort((a, b) => a.name.localeCompare(b.name));

    flyout.innerHTML = `
      <div class="quick-wheel-assign-head">
        <span>${prefilledSlotIndex != null ? `Pick effect for slot ${prefilledSlotIndex + 1}` : 'Pick effect, then click a slot'}</span>
        <button class="quick-wheel-assign-close" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <div class="quick-wheel-assign-list">
        ${all.map((p) => `
          <button class="quick-wheel-assign-item" data-id="${p.id}" data-icon="${p.icon || 'puzzle-piece'}" data-kind="${p.type}">
            <i class="fas fa-${p.icon || 'puzzle-piece'}"></i>
            <span class="quick-wheel-assign-name">${escapeHtml(p.name)}</span>
            <span class="quick-wheel-assign-kind">${labelForType(p.type)}</span>
          </button>
        `).join('')}
      </div>
      <div class="quick-wheel-assign-hint">Right-click a filled slot to clear.</div>
    `;
    window.document.body.appendChild(flyout);

    const r = controls.querySelector('.quick-wheel-config').getBoundingClientRect();
    const fw = flyout.offsetWidth;
    const fh = flyout.offsetHeight;
    let left = r.right + 6;
    let top  = r.top - fh + r.height; // anchor flyout's bottom-left near the button
    left = Math.min(window.innerWidth - fw - 8, Math.max(8, left));
    top  = Math.min(window.innerHeight - fh - 8, Math.max(8, top));
    flyout.style.left = `${left}px`;
    flyout.style.top  = `${top}px`;

    flyout.querySelector('.quick-wheel-assign-close').addEventListener('click', hideAssignFlyout);
    flyout.querySelectorAll('.quick-wheel-assign-item').forEach((el) => {
      el.addEventListener('click', () => {
        assignMode = { effectId: el.dataset.id, icon: el.dataset.icon };
        if (prefilledSlotIndex != null) {
          onSlotClick(prefilledSlotIndex);
        } else {
          paint();
        }
      });
    });

    setTimeout(() => {
      window.addEventListener('mousedown', onOutside, { capture: true });
    });
  }

  function onOutside(e) {
    if (!flyout) return;
    if (flyout.contains(e.target)) return;
    if (e.target.closest('.quick-wheel')) return;
    if (e.target.closest('.quick-wheel-controls')) return;
    hideAssignFlyout();
  }

  function hideAssignFlyout() {
    window.removeEventListener('mousedown', onOutside, { capture: true });
    if (flyout) { flyout.remove(); flyout = null; }
    if (assignMode) { assignMode = null; paint(); }
  }

  // Right-click clears.
  slotRotor.addEventListener('contextmenu', (e) => {
    const btn = e.target.closest('.quick-wheel-slot');
    if (!btn) return;
    const i = +btn.dataset.slot;
    if (slots[i]) {
      e.preventDefault();
      slots[i] = null;
      saveSlots(slots);
      paintSlotContents();
    }
  });

  buildSlots();
  paint();
}

function labelForType(t) {
  if (t === 'filter') return 'Effect';
  if (t === 'tool')   return 'Tool';
  if (t === 'panel')  return 'Plugin';
  return t || '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
