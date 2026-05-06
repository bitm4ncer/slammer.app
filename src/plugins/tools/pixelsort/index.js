// Pixel Sort tool — sorts pixels along rows/columns within mask thresholds.
// Direction: horizontal | vertical. Criteria: brightness | hue | saturation.

import { sliderRow, pillGroup, makeToolRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'pixelsort',
  name: 'Pixel Sort',
  version: '1.0.0',
  type: 'tool',
  icon: 'arrows-up-down-left-right',
  category: 'glitch',

  defaultParams() {
    return {
      direction: 'horizontal',
      criteria: 'brightness',
      threshold: 9,
      amount: 1.0,
    };
  },

  process(imageData, params, ctx) {
    const dir = params.direction || 'horizontal';
    const crit = params.criteria || 'brightness';
    const threshold = (params.threshold ?? 9) / 100; // 0..1
    const amount = Math.max(0, Math.min(1, params.amount ?? 1));
    const d = imageData.data;
    const w = imageData.width, h = imageData.height;

    // Score-from-source: when an upstream effect (e.g. Dither) has quantised the
    // pipeline buffer to binary or low-variance output, scoring on `d` finds no
    // sortable variation. Fall back to the layer's pre-stack source pixels for
    // the score, while still writing sort permutations into `d`. Dimensions
    // must match (the renderer guarantees this for the source).
    const src = (ctx && ctx.sourceImageData
      && ctx.sourceImageData.width === w
      && ctx.sourceImageData.height === h)
      ? ctx.sourceImageData.data
      : d;

    function score(r, g, b) {
      if (crit === 'brightness') return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      if (crit === 'saturation') {
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        return max === 0 ? 0 : (max - min) / max;
      }
      // hue
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const delta = max - min;
      if (!delta) return 0;
      let hue;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      return hue / 360;
    }

    function sortLine(linePixels) {
      // linePixels: { i (data index), s (score) }[]; we sort spans where s > threshold.
      let i = 0;
      while (i < linePixels.length) {
        if (linePixels[i].s < threshold) { i++; continue; }
        let j = i;
        while (j < linePixels.length && linePixels[j].s >= threshold) j++;
        if (j - i > 1) {
          const span = linePixels.slice(i, j).sort((a, b) => a.s - b.s);
          // Read original colors first then write back.
          const colors = span.map((p) => [d[p.i], d[p.i + 1], d[p.i + 2], d[p.i + 3]]);
          for (let k = 0; k < span.length; k++) {
            const p = linePixels[i + k];
            const c = colors[k];
            // Apply amount as a blend.
            d[p.i]     = d[p.i]     + (c[0] - d[p.i])     * amount;
            d[p.i + 1] = d[p.i + 1] + (c[1] - d[p.i + 1]) * amount;
            d[p.i + 2] = d[p.i + 2] + (c[2] - d[p.i + 2]) * amount;
          }
        }
        i = j;
      }
    }

    if (dir === 'horizontal') {
      for (let y = 0; y < h; y++) {
        const line = new Array(w);
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          line[x] = { i: idx, s: score(src[idx], src[idx + 1], src[idx + 2]) };
        }
        sortLine(line);
      }
    } else {
      for (let x = 0; x < w; x++) {
        const line = new Array(h);
        for (let y = 0; y < h; y++) {
          const idx = (y * w + x) * 4;
          line[y] = { i: idx, s: score(src[idx], src[idx + 1], src[idx + 2]) };
        }
        sortLine(line);
      }
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeToolRoot();
    root.appendChild(pillGroup({
      label: 'Direction',
      variant: 'icon',
      options: [
        { value: 'horizontal', label: 'Horizontal', iconClass: 'arrows-left-right' },
        { value: 'vertical',   label: 'Vertical',   iconClass: 'arrows-up-down' },
      ],
      value: params.direction,
      onChange: (v) => onChange({ direction: v }),
    }));
    root.appendChild(pillGroup({
      label: 'Criteria',
      options: [
        { value: 'brightness', label: 'Brightness' },
        { value: 'saturation', label: 'Saturation' },
        { value: 'hue', label: 'Hue' },
      ],
      value: params.criteria,
      onChange: (v) => onChange({ criteria: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Threshold', min: 0, max: 100, step: 1, value: params.threshold, defaultValue: 9,
      onChange: (v) => onChange({ threshold: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Amount', min: 0, max: 1, step: 0.01, value: params.amount, defaultValue: 1.0,
      onChange: (v) => onChange({ amount: v }),
    }));
    return root;
  },
};
