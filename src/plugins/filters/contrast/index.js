// Contrast — classic c=(259*(C+255))/(255*(259-C)) formula on each channel.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'contrast',
  name: 'Contrast',
  version: '1.0.0',
  type: 'filter',
  icon: 'circle-half-stroke',
  category: 'image',

  defaultParams() { return { value: 0 }; },

  process(imageData, params) {
    const c = params.value ?? 0;
    if (!c) return imageData;
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp255(factor * (d[i] - 128) + 128);
      d[i + 1] = clamp255(factor * (d[i + 1] - 128) + 128);
      d[i + 2] = clamp255(factor * (d[i + 2] - 128) + 128);
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Value', min: -255, max: 255, step: 1, value: params.value ?? 0, defaultValue: 0,
      onChange: (v) => onChange({ value: v }),
    }));
    return root;
  },
};

function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
