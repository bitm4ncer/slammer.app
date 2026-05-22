// Gradient Map — luminance-to-colour mapping using an N-stop gradient.
// Pre-builds a 256-entry LUT once per process() call for fast per-pixel lookup.

import { sliderRow, makeRoot, gradientStopsRow } from '../../shared/ui-helpers.js';

export default {
  id: 'gradient-map',
  name: 'Gradient Map',
  version: '1.0.0',
  type: 'filter',
  icon: 'arrow-up-right-dots',
  category: 'color',
  description: 'Remap luminance to a gradient',

  defaultParams() {
    return {
      stops: [
        { at: 0,   color: '#000000' },
        { at: 1,   color: '#FFFFFF' },
      ],
    };
  },

  process(imageData, params) {
    const stops = sortedStops(params.stops);
    if (stops.length < 2) return imageData;
    const lut = buildLut(stops);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      const off = lum * 3;
      d[i]     = lut[off];
      d[i + 1] = lut[off + 1];
      d[i + 2] = lut[off + 2];
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { stops: (params.stops || defaultStops()).slice() };

    // Gradient stop editor (shared helper).
    const editor = gradientStopsRow({
      label: null,
      stops: local.stops,
      onChange: (newStops) => {
        local.stops = newStops;
        onChange({ stops: newStops });
      },
    });
    root.appendChild(editor);

    return root;
  },
};

function defaultStops() { return [{ at: 0, color: '#000000' }, { at: 1, color: '#FFFFFF' }]; }
function sortedStops(stops) { return (stops || defaultStops()).slice().sort((a, b) => a.at - b.at); }

// 256-entry RGB LUT (Uint8ClampedArray, 256 * 3) from sorted stops.
function buildLut(stops) {
  const lut = new Uint8ClampedArray(256 * 3);
  let s = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    while (s < stops.length - 2 && stops[s + 1].at < t) s++;
    const a = stops[s], b = stops[s + 1] || stops[s];
    const span = (b.at - a.at) || 1;
    const k = clamp((t - a.at) / span, 0, 1);
    const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
    lut[i * 3]     = lerp(ca.r, cb.r, k) | 0;
    lut[i * 3 + 1] = lerp(ca.g, cb.g, k) | 0;
    lut[i * 3 + 2] = lerp(ca.b, cb.b, k) | 0;
  }
  return lut;
}


function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}
