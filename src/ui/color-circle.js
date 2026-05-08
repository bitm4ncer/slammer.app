// Footer color circle — small dial that toggles the central Color Hub
// popover. Lives at the golden-section line in wheel mode; collapses to a
// 18 px footer-left swatch in dot mode (Settings → Workflow → Color hub).

import { getActive, onActiveChange } from '../core/colors.js';
import { getSettings, onSettingsChange } from './settings-popup.js';
import { toggleColorHub } from './color-hub.js';

export function initColorCircle({ buttonEl, swatchEl }) {
  if (!buttonEl || !swatchEl) return;

  function paintSwatch() {
    swatchEl.style.background = getActive();
  }
  paintSwatch();
  onActiveChange(paintSwatch);

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

  buttonEl.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleColorHub(buttonEl);
  });
}
