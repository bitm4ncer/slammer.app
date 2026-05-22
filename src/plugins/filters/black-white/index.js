// Black & White — channel-mixer B&W conversion with per-channel weights and tint.

import { sliderRow, toggleRow, makeRoot } from '../../shared/ui-helpers.js';

function hslToRgb(h, s, l) {
  h /= 360;
  const a = s * Math.min(l, 1 - l);
  const k = (n) => (n + h * 12) % 12;
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

export default {
  id: 'black-white',
  name: 'Black & White',
  version: '1.0.0',
  type: 'filter',
  icon: 'circle-half-stroke',
  category: 'image',
  description: 'Channel-mixed monochrome conversion',

  defaultParams() {
    return {
      red: 30, green: 59, blue: 11,
      normalize: true,
      tintHue: 30, tintStrength: 0,
      preserveTone: false,
    };
  },

  process(imageData, params) {
    const d = imageData.data;
    const rW = params.red ?? 30;
    const gW = params.green ?? 59;
    const bW = params.blue ?? 11;
    const normalize = params.normalize !== false;
    const tintHue = params.tintHue ?? 30;
    const tintStrength = Math.max(0, Math.min(100, params.tintStrength ?? 0));
    const preserveTone = params.preserveTone ?? false;

    const div = normalize ? Math.max(1, rW + gW + bW) : 100;
    const tintMix = tintStrength / 100;
    const [tR, tG, tB] = hslToRgb(tintHue, 0.5, 0.5);

    let toneScale = 1;

    if (preserveTone) {
      let srcSum = 0;
      let mixSum = 0;
      const count = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const srcLuma = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        const grey = (d[i] * rW + d[i + 1] * gW + d[i + 2] * bW) / div;
        srcSum += srcLuma;
        mixSum += grey;
      }
      const srcAvg = srcSum / count;
      const mixAvg = mixSum / count;
      toneScale = mixAvg > 0 ? srcAvg / mixAvg : 1;
    }

    for (let i = 0; i < d.length; i += 4) {
      let grey = (d[i] * rW + d[i + 1] * gW + d[i + 2] * bW) / div;
      grey *= toneScale;
      grey = Math.max(0, Math.min(255, grey));

      if (tintMix > 0) {
        d[i] = grey + (tR - grey) * tintMix;
        d[i + 1] = grey + (tG - grey) * tintMix;
        d[i + 2] = grey + (tB - grey) * tintMix;
      } else {
        d[i] = grey;
        d[i + 1] = grey;
        d[i + 2] = grey;
      }
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Red', min: -200, max: 300, step: 1, value: params.red ?? 30, defaultValue: 30,
      onChange: (v) => onChange({ red: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Green', min: -200, max: 300, step: 1, value: params.green ?? 59, defaultValue: 59,
      onChange: (v) => onChange({ green: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Blue', min: -200, max: 300, step: 1, value: params.blue ?? 11, defaultValue: 11,
      onChange: (v) => onChange({ blue: v }),
    }));
    root.appendChild(toggleRow({
      label: 'Normalize', value: params.normalize !== false,
      onChange: (v) => onChange({ normalize: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Tint Hue', min: 0, max: 360, step: 1, value: params.tintHue ?? 30, defaultValue: 30,
      onChange: (v) => onChange({ tintHue: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Tint Strength', min: 0, max: 100, step: 1, value: params.tintStrength ?? 0, defaultValue: 0,
      onChange: (v) => onChange({ tintStrength: v }),
    }));
    root.appendChild(toggleRow({
      label: 'Preserve Tone', value: params.preserveTone ?? false,
      onChange: (v) => onChange({ preserveTone: v }),
    }));
    return root;
  },
};
