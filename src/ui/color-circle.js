// Footer color circle — small dial that toggles the central Color Hub
// popover. Lives at the golden-section line in wheel mode; collapses to a
// 18 px footer-left swatch in dot mode (Settings → Workflow → Color hub).
//
// Phase 23 two-slot model: the dial visually carries BOTH active colours
// at once. Centre (.color-circle-swatch) shows the fill; the inset ring
// (.color-circle-stroke-ring) shows the stroke. Click the ring → hub opens
// focused on stroke; click the centre → focused on fill.

import { getActiveFill, getActiveStroke, onActiveChange } from '../core/colors.js';
import { getSettings, onSettingsChange } from './settings-popup.js';
import { toggleColorHub, openColorHub } from './color-hub.js';

export function initColorCircle({ buttonEl, swatchEl, strokeRingEl }) {
  if (!buttonEl || !swatchEl) return;

  function paint() {
    swatchEl.style.background = getActiveFill();
    if (strokeRingEl) strokeRingEl.style.borderColor = getActiveStroke();
  }
  paint();
  onActiveChange(paint);

  // Apply body class so the conditional CSS in layout.css can hide the
  // radial wheel + reposition the dial as a small footer-left swatch.
  function applyHubMode() {
    const mode = getSettings().colorHubMode === 'dot' ? 'dot' : 'wheel';
    document.body.classList.toggle('color-hub--dot', mode === 'dot');
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
