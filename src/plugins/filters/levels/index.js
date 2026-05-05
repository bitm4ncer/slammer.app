// Levels — Black / Mid (gamma) / White Point on luminance with per-channel application.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'levels',
  name: 'Levels',
  version: '1.0.0',
  type: 'filter',
  icon: 'sliders',
  category: 'color',

  defaultParams() { return { black: 0, mid: 1.0, white: 255 }; },

  process(imageData, params) {
    const black = clampN(params.black ?? 0, 0, 254);
    const white = clampN(params.white ?? 255, black + 1, 255);
    const mid = Math.max(0.05, Math.min(9.99, params.mid ?? 1));
    const range = white - black;
    if (range <= 0) return imageData;
    const invGamma = 1 / mid;
    // Build LUT.
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const norm = (i - black) / range;
      if (norm <= 0) lut[i] = 0;
      else if (norm >= 1) lut[i] = 255;
      else lut[i] = Math.round(Math.pow(norm, invGamma) * 255);
    }
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Black', min: 0, max: 254, step: 1, value: params.black ?? 0, defaultValue: 0,
      onChange: (v) => onChange({ black: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Mid (γ)', min: 0.1, max: 4, step: 0.01, value: params.mid ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ mid: v }),
    }));
    root.appendChild(sliderRow({
      label: 'White', min: 1, max: 255, step: 1, value: params.white ?? 255, defaultValue: 255,
      onChange: (v) => onChange({ white: v }),
    }));
    return root;
  },
};

function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
