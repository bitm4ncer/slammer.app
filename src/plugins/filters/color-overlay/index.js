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

  defaultParams() { return { color: '#8aff8c', mode: 'tint', amount: 100 }; },

  process(imageData, params) {
    const { r: cr, g: cg, b: cb } = hexToRgb(params.color || '#8aff8c');
    const mode = params.mode || 'tint';
    const a = Math.max(0, Math.min(100, params.amount ?? 100)) / 100;
    if (a === 0) return imageData;
    const d = imageData.data;
    if (mode === 'solid') {
      // Replace RGB with the chosen colour, blend by amount, keep alpha untouched.
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = lerp(d[i],     cr, a);
        d[i + 1] = lerp(d[i + 1], cg, a);
        d[i + 2] = lerp(d[i + 2], cb, a);
      }
    } else {
      // Tint: multiply each pixel by the chosen colour (normalised), blend by amount.
      const fr = cr / 255, fg = cg / 255, fb = cb / 255;
      for (let i = 0; i < d.length; i += 4) {
        const tr = d[i]     * fr;
        const tg = d[i + 1] * fg;
        const tb = d[i + 2] * fb;
        d[i]     = lerp(d[i],     tr, a);
        d[i + 1] = lerp(d[i + 1], tg, a);
        d[i + 2] = lerp(d[i + 2], tb, a);
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
    root.appendChild(sliderRow({
      label: 'Amount', min: 0, max: 100, step: 1, value: params.amount ?? 100, defaultValue: 100, suffix: '%',
      onChange: (v) => onChange({ amount: v }),
    }));
    return root;
  },
};

function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}
