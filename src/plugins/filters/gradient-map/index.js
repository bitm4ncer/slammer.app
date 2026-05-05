// Gradient Map — luminance-to-colour mapping using an N-stop gradient.
// Pre-builds a 256-entry LUT once per process() call for fast per-pixel lookup.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'gradient-map',
  name: 'Gradient Map',
  version: '1.0.0',
  type: 'filter',
  icon: 'arrow-up-right-dots',
  category: 'color',

  defaultParams() {
    return {
      stops: [
        { at: 0,   color: '#000000' },
        { at: 1,   color: '#FFFFFF' },
      ],
      amount: 100,
    };
  },

  process(imageData, params) {
    const stops = sortedStops(params.stops);
    const a = clamp(params.amount ?? 100, 0, 100) / 100;
    if (a === 0 || stops.length < 2) return imageData;
    const lut = buildLut(stops);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      const off = lum * 3;
      d[i]     = lerp(d[i],     lut[off],     a);
      d[i + 1] = lerp(d[i + 1], lut[off + 1], a);
      d[i + 2] = lerp(d[i + 2], lut[off + 2], a);
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { stops: (params.stops || defaultStops()).slice(), amount: params.amount ?? 100 };

    function rebuild() {
      root.innerHTML = '';
      // Visual gradient bar (CSS linear-gradient from current stops).
      const bar = document.createElement('div');
      bar.className = 'gradient-bar';
      bar.style.background = stopsToCss(local.stops);
      root.appendChild(bar);

      // Per-stop swatch row + add button.
      const row = document.createElement('div');
      row.className = 'effect-swatch-row';
      const sortedIdx = local.stops
        .map((_, i) => i)
        .sort((a, b) => local.stops[a].at - local.stops[b].at);
      const canRemove = local.stops.length > 2;

      sortedIdx.forEach((origIdx) => {
        const stop = local.stops[origIdx];
        const sw = document.createElement('div');
        sw.className = 'effect-swatch palette-swatch';
        sw.style.background = stop.color;
        sw.innerHTML = `
          <input type="color" value="${stop.color}" />
          ${canRemove ? `<button class="palette-remove" title="Remove stop">×</button>` : ''}
        `;
        sw.querySelector('input').addEventListener('input', (e) => {
          local.stops[origIdx] = { ...local.stops[origIdx], color: e.target.value };
          onChange({ stops: local.stops });
          sw.style.background = e.target.value;
          bar.style.background = stopsToCss(local.stops);
        });
        const rm = sw.querySelector('.palette-remove');
        if (rm) rm.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          local.stops.splice(origIdx, 1);
          onChange({ stops: local.stops });
          rebuild();
        });
        row.appendChild(sw);
      });

      if (local.stops.length < 8) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'palette-add';
        add.title = 'Add stop';
        add.addEventListener('click', () => {
          // New stop midway between the two widest-gap neighbours.
          const sorted = local.stops.slice().sort((a, b) => a.at - b.at);
          let bestGap = 0; let at = 0.5;
          for (let i = 0; i < sorted.length - 1; i++) {
            const gap = sorted[i + 1].at - sorted[i].at;
            if (gap > bestGap) { bestGap = gap; at = (sorted[i].at + sorted[i + 1].at) / 2; }
          }
          // Interpolate the colour at that point.
          const color = sampleStops(sorted, at);
          local.stops.push({ at, color });
          onChange({ stops: local.stops });
          rebuild();
        });
        row.appendChild(add);
      }
      root.appendChild(row);

      root.appendChild(sliderRow({
        label: 'Amount', min: 0, max: 100, step: 1, value: local.amount, defaultValue: 100, suffix: '%',
        onChange: (v) => { local.amount = v; onChange({ amount: v }); },
      }));
    }

    rebuild();
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

function sampleStops(stops, at) {
  const sorted = stops.slice().sort((a, b) => a.at - b.at);
  let s = 0;
  while (s < sorted.length - 2 && sorted[s + 1].at < at) s++;
  const a = sorted[s], b = sorted[s + 1] || sorted[s];
  const span = (b.at - a.at) || 1;
  const k = clamp((at - a.at) / span, 0, 1);
  const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
  return rgbToHex(lerp(ca.r, cb.r, k), lerp(ca.g, cb.g, k), lerp(ca.b, cb.b, k));
}

function stopsToCss(stops) {
  return `linear-gradient(to right, ${sortedStops(stops).map((s) => `${s.color} ${(s.at * 100).toFixed(1)}%`).join(', ')})`;
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
function rgbToHex(r, g, b) {
  const to2 = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
