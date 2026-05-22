// Solarize — classic Sabattier effect. Invert pixels above (or below) a threshold.

import { sliderRow, toggleRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'solarize',
  name: 'Solarize',
  version: '1.0.0',
  type: 'filter',
  icon: 'sun',
  category: 'stylize',
  description: 'Invert tones above a threshold',

  defaultParams() {
    return { threshold: 128, inverse: false, perChannel: false };
  },

  process(imageData, params) {
    const threshold = params.threshold ?? 128;
    const inverse = params.inverse ?? false;
    const perChannel = params.perChannel ?? false;
    const d = imageData.data;

    if (perChannel) {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (inverse) {
          if (r < threshold) d[i] = 255 - r;
          if (g < threshold) d[i + 1] = 255 - g;
          if (b < threshold) d[i + 2] = 255 - b;
        } else {
          if (r > threshold) d[i] = 255 - r;
          if (g > threshold) d[i + 1] = 255 - g;
          if (b > threshold) d[i + 2] = 255 - b;
        }
      }
    } else {
      // Luminance-based comparison.
      // Using 299/587/114 weights for speed (integer-friendly).
      for (let i = 0; i < d.length; i += 4) {
        const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        const pass = inverse ? (y < threshold) : (y > threshold);
        if (pass) {
          d[i] = 255 - d[i];
          d[i + 1] = 255 - d[i + 1];
          d[i + 2] = 255 - d[i + 2];
        }
      }
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Threshold', min: 0, max: 255, step: 1, value: params.threshold ?? 128, defaultValue: 128,
      onChange: (v) => onChange({ threshold: v }),
    }));
    root.appendChild(toggleRow({
      label: 'Inverse', value: params.inverse ?? false,
      onChange: (v) => onChange({ inverse: v }),
    }));
    root.appendChild(toggleRow({
      label: 'Per-channel', value: params.perChannel ?? false,
      onChange: (v) => onChange({ perChannel: v }),
    }));
    return root;
  },
};
