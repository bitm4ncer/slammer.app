// Brightness — additive offset on RGB channels.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'brightness',
  name: 'Brightness',
  version: '1.0.0',
  type: 'filter',
  icon: 'sun',
  category: 'adjust',

  defaultParams() { return { value: 0 }; },

  process(imageData, params) {
    const v = Math.round((params.value ?? 0) * 2.55); // -100..100 → -255..255
    if (!v) return imageData;
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp255(d[i] + v);
      d[i + 1] = clamp255(d[i + 1] + v);
      d[i + 2] = clamp255(d[i + 2] + v);
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Value', min: -100, max: 100, step: 1, value: params.value ?? 0,
      onChange: (v) => onChange({ value: v }),
    }));
    return root;
  },
};

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
