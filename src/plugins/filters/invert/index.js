// Invert — trivial filter, used end-to-end as the Phase 4a smoke test.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'invert',
  name: 'Invert',
  version: '1.0.0',
  type: 'filter',
  icon: 'adjust',
  category: 'image',

  defaultParams() {
    return { strength: 1 };
  },

  process(imageData, params) {
    const k = Math.max(0, Math.min(1, params.strength ?? 1));
    const d = imageData.data;
    if (k === 0) return imageData;
    if (k === 1) {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
    } else {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i] + (255 - 2 * d[i]) * k;
        d[i + 1] = d[i + 1] + (255 - 2 * d[i + 1]) * k;
        d[i + 2] = d[i + 2] + (255 - 2 * d[i + 2]) * k;
      }
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Strength', min: 0, max: 1, step: 0.01, value: params.strength ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ strength: v }),
    }));
    return root;
  },
};
