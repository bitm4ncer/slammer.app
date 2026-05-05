// Hue — RGB → HSL → shift hue / sat / lit → RGB.

import { makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'hue',
  name: 'Hue',
  version: '1.1.0',
  type: 'filter',
  icon: 'palette',
  category: 'color',

  defaultParams() { return { hue: 0, saturation: 0, lightness: 0 }; },

  process(imageData, params) {
    const hueShift = (params.hue ?? 0) / 360;
    const satShift = (params.saturation ?? 0) / 100;
    const litShift = (params.lightness ?? 0) / 100;
    if (!hueShift && !satShift && !litShift) return imageData;
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const nh = (h + hueShift + 1) % 1;
      const ns = clamp01(s + satShift);
      const nl = clamp01(l + litShift);
      const [r, g, b] = hslToRgb(nh, ns, nl);
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot('hue-effect');

    root.appendChild(gradientSlider({
      label: 'Hue Shift',
      min: -180, max: 180, step: 1, value: params.hue ?? 0, suffix: '°',
      gradient: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
      onChange: (v) => onChange({ hue: v }),
    }));
    root.appendChild(gradientSlider({
      label: 'Saturation Shift',
      min: -100, max: 100, step: 1, value: params.saturation ?? 0, suffix: '%',
      gradient: 'linear-gradient(to right, #888 0%, #888 50%, #ff0000 100%)',
      onChange: (v) => onChange({ saturation: v }),
    }));
    root.appendChild(gradientSlider({
      label: 'Luminosity Shift',
      min: -100, max: 100, step: 1, value: params.lightness ?? 0, suffix: '%',
      gradient: 'linear-gradient(to right, #000 0%, #888 50%, #fff 100%)',
      onChange: (v) => onChange({ lightness: v }),
    }));

    return root;
  },
};

function gradientSlider({ label, min, max, step, value, suffix, gradient, onChange }) {
  const row = document.createElement('div');
  row.className = 'hue-grad-row';
  row.innerHTML = `
    <div class="hue-grad-label">${label}</div>
    <div class="hue-grad-controls">
      <div class="hue-grad-track" style="--grad: ${gradient};">
        <input type="range" class="hue-grad-input" min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>
      <input type="number" class="hue-grad-num" min="${min}" max="${max}" step="${step}" value="${value}" />
      <span class="hue-grad-suffix">${suffix || ''}</span>
    </div>
  `;
  const range = row.querySelector('.hue-grad-input');
  const num = row.querySelector('.hue-grad-num');

  range.addEventListener('input', () => {
    const v = parseFloat(range.value);
    num.value = v;
    onChange(v);
  });
  num.addEventListener('input', () => {
    let v = parseFloat(num.value);
    if (Number.isNaN(v)) return;
    v = Math.max(min, Math.min(max, v));
    range.value = v;
    onChange(v);
  });

  // Double-click anywhere on the track resets to 0 (or midpoint).
  row.querySelector('.hue-grad-track').addEventListener('dblclick', () => {
    const reset = (min < 0 && max > 0) ? 0 : Math.round((min + max) / 2);
    range.value = reset; num.value = reset; onChange(reset);
  });

  return row;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s; const l = (max + min) / 2;
  if (max === min) { h = 0; s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
