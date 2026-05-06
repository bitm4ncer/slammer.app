// Levels — Black / Mid (gamma) / White Point on luminance with per-channel application.

import { makeRoot, tripleSlider } from '../../shared/ui-helpers.js';

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
    root.appendChild(tripleSlider({
      label: 'Levels',
      lo: params.black ?? 0,
      mid: params.mid ?? 1,
      hi: params.white ?? 255,
      onChange: ({ lo, mid, hi }) => onChange({ black: lo, mid, white: hi }),
    }));
    return root;
  },
};

function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
