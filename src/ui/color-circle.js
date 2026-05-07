// Footer color circle (Phase 23a) — shows the active colour, click to open
// the colour popover. The full HSL-triangle popover lands in 23b; for now
// the flyout has a minimal placeholder so the wiring is testable end-to-end:
//   • current active swatch
//   • a 'random pastel' button (sanity check that setActive flows through)
//   • the recent swatches grid (already powered by getSwatches/addSwatch)
//   • a 'Save current' button that writes the active hex into swatches.

import { getActive, setActive, onActiveChange, getSwatches, addSwatch, onSwatchesChange } from '../core/colors.js';

export function initColorCircle({ buttonEl, swatchEl }) {
  if (!buttonEl || !swatchEl) return;

  function paintSwatch() {
    swatchEl.style.background = getActive();
  }
  paintSwatch();
  onActiveChange(paintSwatch);

  let flyout = null;
  buttonEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (flyout) { closeFlyout(); return; }
    openFlyout();
  });

  function openFlyout() {
    flyout = document.createElement('div');
    flyout.className = 'color-flyout color-flyout--placeholder';
    document.body.appendChild(flyout);
    paintFlyout();
    onSwatchesChange(paintFlyout);

    const r = buttonEl.getBoundingClientRect();
    const w = flyout.offsetWidth;
    const h = flyout.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    let top = r.top - h - 10;
    if (top < 8) top = r.bottom + 10;
    flyout.style.left = `${left}px`;
    flyout.style.top  = `${top}px`;

    setTimeout(() => {
      window.addEventListener('mousedown', onOutside, { capture: true });
    });
  }

  function paintFlyout() {
    if (!flyout) return;
    const active = getActive();
    const swatches = getSwatches();
    flyout.innerHTML = `
      <div class="color-flyout-head">
        <span class="color-flyout-active" style="background:${active}"></span>
        <code class="color-flyout-hex">${active.toUpperCase()}</code>
      </div>
      <div class="color-flyout-actions">
        <button class="color-flyout-btn" data-act="save">Save</button>
        <button class="color-flyout-btn" data-act="random">Random</button>
      </div>
      <div class="color-flyout-section-label">Recent</div>
      <div class="color-flyout-swatches">
        ${swatches.length === 0
          ? '<div class="color-flyout-empty">No saved swatches</div>'
          : swatches.slice(0, 24).map((hex) => `
              <button class="color-flyout-swatch" data-hex="${hex}" title="${hex.toUpperCase()}" style="background:${hex}"></button>
            `).join('')}
      </div>
    `;

    flyout.querySelectorAll('.color-flyout-swatch').forEach((el) => {
      el.addEventListener('click', () => setActive(el.dataset.hex));
    });
    flyout.querySelector('[data-act="save"]')?.addEventListener('click', () => addSwatch(getActive()));
    flyout.querySelector('[data-act="random"]')?.addEventListener('click', () => {
      const h = Math.floor(Math.random() * 360);
      const s = 55 + Math.floor(Math.random() * 25);
      const l = 60 + Math.floor(Math.random() * 15);
      setActive(hslToHex(h, s, l));
    });
  }

  function onOutside(e) {
    if (!flyout) return;
    if (flyout.contains(e.target) || buttonEl.contains(e.target)) return;
    closeFlyout();
  }

  function closeFlyout() {
    window.removeEventListener('mousedown', onOutside, { capture: true });
    if (flyout) { flyout.remove(); flyout = null; }
  }
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to255 = (n) => Math.round(255 * f(n));
  const hex = (n) => to255(n).toString(16).padStart(2, '0');
  return `#${hex(0)}${hex(8)}${hex(4)}`;
}
