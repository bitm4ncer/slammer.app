// Edge Detection — Sobel-style outline pass.

import { sliderRow, pillGroup, toggleRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'edge-detection',
  name: 'Edge Detection',
  version: '1.0.0',
  type: 'filter',
  icon: 'border-style',
  category: 'stylize',

  defaultParams() {
    return { strength: 1, threshold: 0, thickness: 1, invert: false, colorMode: 'mono' };
  },

  process(imageData, params) {
    const { width: w, height: h, data: d } = imageData;
    const strength = params.strength ?? 1;
    const threshold = params.threshold ?? 0;
    const thickness = Math.max(1, Math.min(3, params.thickness ?? 1));
    const invert = params.invert ?? false;
    const colorMode = params.colorMode ?? 'mono';

    const perChannel = colorMode === 'perChannel';
    const channels = perChannel ? 3 : 1;
    const mags = new Uint8ClampedArray(w * h * channels);

    // ---------- Pass 1: Sobel gradient magnitude ----------
    if (perChannel) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const base = (y * w + x) * 4;
          const up = base - w * 4;
          const down = base + w * 4;
          for (let c = 0; c < 3; c++) {
            const gx =
              - d[up - 4 + c] + d[up + 4 + c]
              - 2 * d[base - 4 + c] + 2 * d[base + 4 + c]
              - d[down - 4 + c] + d[down + 4 + c];
            const gy =
              - d[up - 4 + c] - 2 * d[up + c] - d[up + 4 + c]
              + d[down - 4 + c] + 2 * d[down + c] + d[down + 4 + c];
            const mag = Math.min(255, Math.hypot(gx, gy) * strength);
            mags[(y * w + x) * 3 + c] = mag;
          }
        }
      }
    } else {
      // Luminance Sobel for mono and sourceTinted.
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const base = (y * w + x) * 4;
          const up = base - w * 4;
          const down = base + w * 4;
          const l00 = (d[up - 4] * 299 + d[up - 3] * 587 + d[up - 2] * 114) / 1000;
          const l01 = (d[up] * 299 + d[up + 1] * 587 + d[up + 2] * 114) / 1000;
          const l02 = (d[up + 4] * 299 + d[up + 5] * 587 + d[up + 6] * 114) / 1000;
          const l10 = (d[base - 4] * 299 + d[base - 3] * 587 + d[base - 2] * 114) / 1000;
          const l12 = (d[base + 4] * 299 + d[base + 5] * 587 + d[base + 6] * 114) / 1000;
          const l20 = (d[down - 4] * 299 + d[down - 3] * 587 + d[down - 2] * 114) / 1000;
          const l21 = (d[down] * 299 + d[down + 1] * 587 + d[down + 2] * 114) / 1000;
          const l22 = (d[down + 4] * 299 + d[down + 5] * 587 + d[down + 6] * 114) / 1000;
          const gx = -l00 + l02 - 2 * l10 + 2 * l12 - l20 + l22;
          const gy = -l00 - 2 * l01 - l02 + l20 + 2 * l21 + l22;
          const mag = Math.min(255, Math.hypot(gx, gy) * strength);
          mags[y * w + x] = mag;
        }
      }
    }

    // ---------- Pass 2: threshold, dilate, write ----------
    const r = thickness - 1; // dilation radius: 1→0, 2→1, 3→2

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const base = (y * w + x) * 4;

        if (perChannel) {
          for (let c = 0; c < 3; c++) {
            let mag = mags[(y * w + x) * 3 + c];
            if (mag < threshold) mag = 0;
            // Dilation
            if (r > 0 && mag === 0) {
              let maxVal = 0;
              for (let dy = -r; dy <= r; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= h) continue;
                for (let dx = -r; dx <= r; dx++) {
                  const nx = x + dx;
                  if (nx < 0 || nx >= w) continue;
                  const v = mags[(ny * w + nx) * 3 + c];
                  if (v > maxVal) maxVal = v;
                }
              }
              mag = maxVal;
            }
            d[base + c] = invert ? (255 - mag) : mag;
          }
        } else if (colorMode === 'sourceTinted') {
          let mag = mags[y * w + x];
          if (mag < threshold) mag = 0;
          if (r > 0 && mag === 0) {
            let maxVal = 0;
            for (let dy = -r; dy <= r; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const v = mags[ny * w + nx];
                if (v > maxVal) maxVal = v;
              }
            }
            mag = maxVal;
          }
          d[base + 3] = mag; // alpha = edge magnitude
          // RGB stays source
        } else {
          // mono
          let mag = mags[y * w + x];
          if (mag < threshold) mag = 0;
          if (r > 0 && mag === 0) {
            let maxVal = 0;
            for (let dy = -r; dy <= r; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              for (let dx = -r; dx <= r; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const v = mags[ny * w + nx];
                if (v > maxVal) maxVal = v;
              }
            }
            mag = maxVal;
          }
          const out = invert ? (255 - mag) : mag;
          d[base] = out;
          d[base + 1] = out;
          d[base + 2] = out;
        }
      }
    }

    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Strength', min: 0, max: 1, step: 0.01, value: params.strength ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ strength: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Threshold', min: 0, max: 255, step: 1, value: params.threshold ?? 0, defaultValue: 0,
      onChange: (v) => onChange({ threshold: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Thickness', min: 1, max: 3, step: 1, value: params.thickness ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ thickness: v }),
    }));
    root.appendChild(toggleRow({
      label: 'Invert', value: params.invert ?? false,
      onChange: (v) => onChange({ invert: v }),
    }));
    root.appendChild(pillGroup({
      label: 'Colour',
      options: [
        { value: 'mono', label: 'Mono' },
        { value: 'perChannel', label: 'RGB' },
        { value: 'sourceTinted', label: 'Tint' },
      ],
      value: params.colorMode ?? 'mono',
      onChange: (v) => onChange({ colorMode: v }),
    }));
    return root;
  },
};
