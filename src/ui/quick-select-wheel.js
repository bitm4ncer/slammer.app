// Radial quick-select wheel surrounding the footer colour circle (Phase 21
// "Ctrl+Space radial effect picker", evolved into a permanent surface).
//
// 8 slots evenly distributed around a full circle (45° apart). Only the
// top hemisphere is visible — clip-path masks the lower half. Rotation in
// 45° steps brings hidden slots up into the visible arc.
//
// Interaction:
//   • Up / Down arrows on the LEFT rotate the wheel ±45°.
//   • Three-dots on the RIGHT opens the assignment flyout (pick an effect,
//     then click a slot — or click an occupied slot to clear it).
//   • Scrolling while hovering the colour circle rotates the wheel.
//   • Clicking an occupied slot adds that effect to the active layer.
//
// Storage: slammer:quick-wheel-slots — array length 8, each entry either
//   null (empty) or { effectId, icon }.

import { listPlugins, getPlugin, makeEffectInstance } from '../plugins/registry.js';

const STORAGE_KEY    = 'slammer:quick-wheel-slots';
const SLOT_COUNT     = 8;
const STEP_DEG       = 360 / SLOT_COUNT; // 45°
const SLOT_OFFSET    = STEP_DEG / 2;     // 22.5° — keeps slots off the equator
const ROTATE_RIPPLE  = 'rotate-ripple';  // class fired briefly during a step

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
  let rotation = 0; // degrees, multiples of STEP_DEG
  let assignMode = null; // when set: { effectId, icon } awaiting slot click

  // ── Container ──────────────────────────────────────────────────────────
  const root = window.document.createElement('div');
  root.className = 'quick-wheel';
  root.innerHTML = `
    <svg class="quick-wheel-bg" viewBox="-130 -130 260 260" aria-hidden="true">
      <g class="quick-wheel-rotor">
        <circle cx="0" cy="0" r="118" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1.2"></circle>
        ${spokes()}
      </g>
    </svg>
    <div class="quick-wheel-slots"></div>
    <div class="quick-wheel-nav">
      <button class="quick-wheel-nav-btn quick-wheel-nav--up"   aria-label="Rotate wheel up"><i class="fas fa-caret-up"></i></button>
      <button class="quick-wheel-nav-btn quick-wheel-nav--down" aria-label="Rotate wheel down"><i class="fas fa-caret-down"></i></button>
    </div>
    <button class="quick-wheel-config" aria-label="Configure wheel slots"><i class="fas fa-ellipsis"></i></button>
  `;
  window.document.body.appendChild(root);

  const slotsLayer = root.querySelector('.quick-wheel-slots');
  const rotor      = root.querySelector('.quick-wheel-rotor');

  function spokes() {
    // Spokes between every slot (8 spokes total). Clipping hides the lower
    // half so visually we see 5 spokes touching the outer arc in the
    // upper hemisphere.
    const lines = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const a = (i * STEP_DEG - 90) * Math.PI / 180; // -90 puts 0° at right; we want 0° at top
      const x = Math.cos(a) * 118;
      const y = Math.sin(a) * 118;
      lines.push(`<line x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,0.22)" stroke-width="1"></line>`);
    }
    return lines.join('');
  }

  function paint() {
    rotor.setAttribute('transform', `rotate(${rotation})`);
    slotsLayer.innerHTML = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      // Slot lives at the wedge bisector — 22.5° + N*45°. With rotation
      // applied, its on-screen angle = base + rotation.
      const angleDeg = SLOT_OFFSET + i * STEP_DEG + rotation;
      const a = (angleDeg - 90) * Math.PI / 180;
      const r = 78; // distance from centre
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;

      const slot = slots[i];
      const btn = window.document.createElement('button');
      btn.className = `quick-wheel-slot${slot ? ' is-filled' : ' is-empty'}${assignMode ? ' is-assigning' : ''}`;
      btn.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      btn.setAttribute('data-slot', String(i));
      const iconName = slot?.icon || 'plus';
      const plugin = slot ? getPlugin(slot.effectId) : null;
      btn.title = slot ? (plugin?.name || slot.effectId) : 'Empty slot';
      btn.innerHTML = `<i class="fas fa-${iconName}"></i>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSlotClick(i);
      });
      slotsLayer.appendChild(btn);
    }
  }

  function onSlotClick(i) {
    if (assignMode) {
      // Drop the pending effect into this slot (overwrites).
      slots[i] = { effectId: assignMode.effectId, icon: assignMode.icon };
      saveSlots(slots);
      assignMode = null;
      hideAssignFlyout();
      paint();
      return;
    }
    const slot = slots[i];
    if (!slot) {
      // Empty slot click without assign mode → open config.
      openAssignFlyout(i);
      return;
    }
    applyEffect(slot.effectId);
  }

  function applyEffect(effectId) {
    const layer = doc.activeLayer;
    if (!layer) {
      console.warn('[quick-wheel] no active layer — select a layer first');
      return;
    }
    const plugin = getPlugin(effectId);
    if (!plugin) return;
    const inst = makeEffectInstance(effectId);
    if (!inst) return;
    if (plugin.type === 'tool') {
      // Collapse other tools, expand this one.
      for (const e2 of layer.effects) {
        if (getPlugin(e2.pluginId)?.type === 'tool') {
          doc.setEffectProp(layer.id, e2.id, 'expanded', false);
        }
      }
      inst.expanded = true;
    }
    doc.addEffect(layer.id, inst);
  }

  // ── Rotation ──────────────────────────────────────────────────────────
  function rotateBy(steps) {
    rotation = (rotation + steps * STEP_DEG) % 360;
    rotor.classList.add(ROTATE_RIPPLE);
    paint();
    setTimeout(() => rotor.classList.remove(ROTATE_RIPPLE), 220);
  }

  root.querySelector('.quick-wheel-nav--up').addEventListener('click', (e) => { e.stopPropagation(); rotateBy(-1); });
  root.querySelector('.quick-wheel-nav--down').addEventListener('click', (e) => { e.stopPropagation(); rotateBy(+1); });

  // Scroll-on-anchor rotates the wheel.
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
    const all = [...filters, ...tools].sort((a, b) => a.name.localeCompare(b.name));

    flyout.innerHTML = `
      <div class="quick-wheel-assign-head">
        <span>${prefilledSlotIndex != null ? `Pick an effect for slot ${prefilledSlotIndex + 1}` : 'Pick an effect, then click a slot'}</span>
        <button class="quick-wheel-assign-close" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <div class="quick-wheel-assign-list">
        ${all.map((p) => `
          <button class="quick-wheel-assign-item" data-id="${p.id}" data-icon="${p.icon || 'puzzle-piece'}">
            <i class="fas fa-${p.icon || 'puzzle-piece'}"></i>
            <span>${p.name}</span>
          </button>
        `).join('')}
      </div>
      <div class="quick-wheel-assign-hint">Tip: click an occupied slot in this mode to overwrite it. Click empty slot to fill.</div>
    `;
    window.document.body.appendChild(flyout);

    // Position above the config button.
    const r = root.querySelector('.quick-wheel-config').getBoundingClientRect();
    const fw = flyout.offsetWidth;
    const fh = flyout.offsetHeight;
    let left = r.right + 6;
    let top  = r.top - fh / 2 + r.height / 2;
    // Clamp to viewport.
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
          paint(); // re-render with .is-assigning
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
    hideAssignFlyout();
  }

  function hideAssignFlyout() {
    window.removeEventListener('mousedown', onOutside, { capture: true });
    if (flyout) { flyout.remove(); flyout = null; }
    if (assignMode) { assignMode = null; paint(); }
  }

  root.querySelector('.quick-wheel-config').addEventListener('click', (e) => {
    e.stopPropagation();
    openAssignFlyout(null);
  });

  // Right-click an occupied slot clears it.
  slotsLayer.addEventListener('contextmenu', (e) => {
    const btn = e.target.closest('.quick-wheel-slot');
    if (!btn) return;
    const i = +btn.dataset.slot;
    if (slots[i]) {
      e.preventDefault();
      slots[i] = null;
      saveSlots(slots);
      paint();
    }
  });

  paint();
}
