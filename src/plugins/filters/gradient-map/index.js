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
      // Visual gradient bar with draggable position handles per stop.
      const wrap = document.createElement('div');
      wrap.className = 'gradient-editor';
      const bar = document.createElement('div');
      bar.className = 'gradient-bar';
      bar.style.background = stopsToCss(local.stops);
      wrap.appendChild(bar);
      const handles = document.createElement('div');
      handles.className = 'gradient-handles';
      wrap.appendChild(handles);
      root.appendChild(wrap);

      function refreshBar() {
        bar.style.background = stopsToCss(local.stops);
      }

      function placeHandle(idx) {
        const stop = local.stops[idx];
        const h = document.createElement('div');
        h.className = 'gradient-handle';
        h.style.background = stop.color;
        h.style.left = `${stop.at * 100}%`;
        h.title = `${stop.color} @ ${(stop.at * 100).toFixed(0)}%`;

        // Hidden colour input so click on the handle (without drag) opens picker.
        const colorInp = document.createElement('input');
        colorInp.type = 'color';
        colorInp.value = stop.color;
        colorInp.className = 'gradient-handle-color';
        h.appendChild(colorInp);
        colorInp.addEventListener('input', (e) => {
          local.stops[idx] = { ...local.stops[idx], color: e.target.value };
          onChange({ stops: local.stops });
          h.style.background = e.target.value;
          refreshBar();
        });

        // Drag to reposition; double-click to remove (min 2 stops).
        let dragging = false;
        let moved = false;
        h.addEventListener('mousedown', (e) => {
          if (e.target === colorInp) return;
          e.preventDefault();
          dragging = true;
          moved = false;
        });
        const onMove = (e) => {
          if (!dragging) return;
          const rect = bar.getBoundingClientRect();
          const at = clamp((e.clientX - rect.left) / rect.width, 0, 1);
          if (Math.abs(at - local.stops[idx].at) > 0.001) moved = true;
          local.stops[idx] = { ...local.stops[idx], at };
          h.style.left = `${at * 100}%`;
          h.title = `${local.stops[idx].color} @ ${(at * 100).toFixed(0)}%`;
          onChange({ stops: local.stops });
          refreshBar();
        };
        const onUp = () => { dragging = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        // Click without drag → open colour picker (the input is invisible but
        // intercepts the click natively).
        h.addEventListener('click', (e) => {
          if (moved) e.stopPropagation();
        });
        h.addEventListener('dblclick', (e) => {
          e.preventDefault();
          if (local.stops.length <= 2) return;
          local.stops.splice(idx, 1);
          onChange({ stops: local.stops });
          rebuild();
        });
        handles.appendChild(h);
      }
      local.stops.forEach((_, idx) => placeHandle(idx));

      // Click empty spot on the bar to add a new stop there.
      bar.addEventListener('click', (e) => {
        if (local.stops.length >= 8) return;
        const rect = bar.getBoundingClientRect();
        const at = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const sorted = local.stops.slice().sort((a, b) => a.at - b.at);
        const color = sampleStops(sorted, at);
        local.stops.push({ at, color });
        onChange({ stops: local.stops });
        rebuild();
      });

      // Hint row + amount slider.
      const hint = document.createElement('div');
      hint.className = 'gradient-hint';
      hint.textContent = 'Click bar to add · drag handle to move · double-click to remove';
      root.appendChild(hint);

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
