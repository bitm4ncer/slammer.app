// Color Overlay — Tint (luminance-preserving multiply) or Solid (RGB replace,
// alpha preserved — recolour a free-form PNG).

import { sliderRow, pillGroup, colorRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'color-overlay',
  name: 'Color Overlay',
  version: '1.0.0',
  type: 'filter',
  icon: 'fill-drip',
  category: 'color',

  defaultParams() { return { color: '#8aff8c', mode: 'tint' }; },

  process(imageData, params) {
    const { r: cr, g: cg, b: cb } = hexToRgb(params.color || '#8aff8c');
    const mode = params.mode || 'tint';
    const d = imageData.data;
    if (mode === 'solid') {
      // Replace RGB with the chosen colour, keep alpha untouched.
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = cr;
        d[i + 1] = cg;
        d[i + 2] = cb;
      }
    } else {
      // Tint: multiply each pixel by the chosen colour (normalised).
      const fr = cr / 255, fg = cg / 255, fb = cb / 255;
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = d[i]     * fr;
        d[i + 1] = d[i + 1] * fg;
        d[i + 2] = d[i + 2] * fb;
      }
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(colorRow({
      label: 'Color', value: params.color || '#8aff8c',
      onChange: (v) => onChange({ color: v }),
    }));
    root.appendChild(pillGroup({
      label: 'Mode',
      options: [
        { value: 'tint',  label: 'Tint' },
        { value: 'solid', label: 'Solid' },
      ],
      value: params.mode || 'tint',
      onChange: (v) => onChange({ mode: v }),
    }));
    return root;
  },
};

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}
