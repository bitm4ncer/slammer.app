// variable-axis-controls — render one slider per fvar axis the active font
// exposes. Writes through to doc.setTextVariation(axisTag, value).

import { sliderRow } from '../../plugins/shared/ui-helpers.js';

// Friendly labels for the standard axes.
const AXIS_LABELS = {
  wght: 'Weight',
  wdth: 'Width',
  slnt: 'Slant',
  ital: 'Italic',
  opsz: 'Optical Size',
  GRAD: 'Grade',
  XOPQ: 'Thick Stroke',
  YOPQ: 'Thin Stroke',
  YTLC: 'Lowercase Height',
  YTUC: 'Uppercase Height',
  YTAS: 'Ascender Height',
  YTDE: 'Descender Depth',
  YTFI: 'Figure Height',
  MONO: 'Monospace',
  CASL: 'Casual',
  CRSV: 'Cursive',
};

// Render axes split into two groups:
//   - "primary": just `wght` (Weight) — shown in the main Typo panel
//   - "secondary": every other axis (opsz, wdth, slnt, ital, GRAD, …) —
//     hidden inside Advanced Typography so the panel stays clean.
//
// Pass { only: 'primary' | 'secondary' } to control which group renders.
export function renderVariableAxes(host, { meta, value, onChange, only = 'all' }) {
  host.innerHTML = '';
  if (!meta || !meta.variable || !meta.axes || !meta.axes.length) return;
  for (const axis of meta.axes) {
    const isPrimary = axis.tag === 'wght';
    if (only === 'primary' && !isPrimary) continue;
    if (only === 'secondary' && isPrimary) continue;
    const label = AXIS_LABELS[axis.tag] || axis.name || axis.tag;
    const cur = (value && value[axis.tag] != null) ? value[axis.tag] : (axis.default ?? axis.min);
    const stepGuess = (axis.max - axis.min) > 50 ? 1 : 0.1;
    // Hold Shift while dragging the wght knob to snap to standard 100-step
    // weights (100, 200, …, 900) — matches how static fonts are picked.
    const snapWithShift = axis.tag === 'wght' ? 100 : 0;
    host.appendChild(sliderRow({
      label,
      min: axis.min,
      max: axis.max,
      step: stepGuess,
      value: cur,
      defaultValue: axis.default ?? axis.min,
      snapWithShift,
      onChange: (v) => onChange(axis.tag, v),
    }));
  }
}

// Convenience: how many secondary axes does this font expose? Used to
// decide whether the Advanced Typography axes group should render at all.
export function secondaryAxisCount(meta) {
  if (!meta?.variable || !meta.axes) return 0;
  return meta.axes.filter((a) => a.tag !== 'wght').length;
}
