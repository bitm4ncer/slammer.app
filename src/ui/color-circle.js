// Footer color circle — small dial that toggles the central Color Hub
// popover. Lives at the golden-section line in wheel mode; collapses to a
// 18 px footer-left swatch in dot mode (Settings → Workflow → Color hub).
//
// Phase 23 two-slot model: the dial visually carries BOTH active colours
// at once. Centre (.color-circle-swatch) shows the fill; the inset ring
// (.color-circle-stroke-ring) shows the stroke. Click the ring → hub opens
// focused on stroke; click the centre → focused on fill.

import { onActiveChange } from '../core/colors.js';
import { getSettings, onSettingsChange } from './settings-popup.js';
import { toggleColorHub, openColorHub } from './color-hub.js';
import { getEffectiveStyle, onEffectiveStyleChange } from './selection-style.js';

export function initColorCircle({ buttonEl, swatchEl, strokeRingEl }) {
  if (!buttonEl || !swatchEl) return;

  function paint() {
    // Reads the EFFECTIVE style — selected layer's fill/stroke if any,
    // active state otherwise. Illustrator-style: switching layers swaps
    // the dial colours immediately.
    const style = getEffectiveStyle();
    swatchEl.classList.toggle('is-none', style.fillKind === 'none');
    if (style.fillKind === 'gradient') {
      const g = style.fillGradient;
      swatchEl.style.background = `linear-gradient(90deg, ${g.stops.map(s => `${s.color} ${s.at*100}%`).join(', ')})`;
    } else if (style.fillKind !== 'none') {
      swatchEl.style.background = style.fill;
    }
    if (strokeRingEl) {
      strokeRingEl.classList.toggle('is-none', style.strokeKind === 'none');
      strokeRingEl.classList.toggle('is-gradient', style.strokeKind === 'gradient');
      if (style.strokeKind === 'gradient') {
        // CSS gradients on circular borders are a chrome quirk minefield
        // (border-image ignores border-radius; mask + background works
        // but only on the spec-compliant code path). SVG with
        // <circle stroke="url(#grad)"> is bulletproof — the stroke
        // follows the circle exactly. Inject an inline SVG once per
        // gradient change.
        const g = style.strokeGradient;
        const stops = g.stops.map((s, i) => `<stop offset="${s.at*100}%" stop-color="${s.color}"/>`).join('');
        // Linear gradient at angle 90° (left → right) so the swatch
        // mirrors the gradient track in the popover (which also uses
        // a fixed 90° preview, ignoring the actual rendering angle).
        strokeRingEl.innerHTML = `
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%;border-radius:50%;display:block;">
            <defs>
              <linearGradient id="colorCircleGrad" x1="0%" y1="50%" x2="100%" y2="50%">${stops}</linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="none" stroke="url(#colorCircleGrad)" stroke-width="16"/>
          </svg>
        `;
        strokeRingEl.style.borderColor = 'transparent';
        strokeRingEl.style.background = '';
      } else {
        // Solid stroke — back to border. Clear any SVG injection.
        strokeRingEl.innerHTML = '';
        strokeRingEl.style.background = '';
        strokeRingEl.style.borderColor = style.stroke;
      }
    }
  }
  paint();
  onEffectiveStyleChange(paint);
  onActiveChange(paint);   // belt + braces; effective-style covers both

  // Apply body class so the conditional CSS in layout.css can hide the
  // radial wheel + reposition the dial as a small footer-left swatch.
  // In WHEEL mode the dial lives inside .quick-wheel (re-parented at
  // boot in quick-select-wheel.js) so it lifts together with the wheel
  // when the colour hub opens. In DOT mode the wheel is hidden, so we
  // move the dial back into the footer so it stays visible.
  const footerHome = buttonEl.parentElement; // captured BEFORE re-parent
  function applyHubMode() {
    const mode = getSettings().colorHubMode === 'dot' ? 'dot' : 'wheel';
    document.body.classList.toggle('color-hub--dot', mode === 'dot');
    if (mode === 'dot') {
      if (footerHome && buttonEl.parentElement !== footerHome) {
        footerHome.appendChild(buttonEl);
      }
    } else {
      const wheel = document.querySelector('.quick-wheel');
      if (wheel && buttonEl.parentElement !== wheel) {
        wheel.appendChild(buttonEl);
      }
    }
  }
  applyHubMode();
  onSettingsChange((next) => {
    if (next?.colorHubMode != null) applyHubMode();
  });

  // Single click handler on the button — branch on event.target so the
  // stroke ring vs the fill centre open the hub focused on the right slot.
  // Idempotent re-bind: HMR can re-run initColorCircle without unmounting
  // the page; without removing the previous listener, every reload doubles
  // the handler count and one click fires two toggles (opens then
  // immediately closes the hub).
  if (buttonEl._colorCircleHandler) {
    buttonEl.removeEventListener('click', buttonEl._colorCircleHandler);
  }
  const onClick = (e) => {
    e.stopPropagation();
    const slot = (strokeRingEl && (e.target === strokeRingEl || strokeRingEl.contains(e.target)))
      ? 'stroke' : 'fill';
    toggleColorHub(buttonEl, slot);
  };
  buttonEl.addEventListener('click', onClick);
  buttonEl._colorCircleHandler = onClick;
}
