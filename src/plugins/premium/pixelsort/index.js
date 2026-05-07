// Pixel Sort tool — sorts pixels along rows/columns within mask thresholds.
// Direction: horizontal | vertical. Criteria: brightness | hue | saturation.

import { sliderRow, pillGroup, makeToolRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'pixelsort',
  name: 'Pixel Sort',
  version: '1.0.0',
  type: 'tool',
  icon: 'arrow-down-wide-short',          // sorted bars — visually evokes pixel-row reordering
  category: 'glitch',
  pro: true,
  pack: 'glitch-pack',

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
        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
        return max === 0 ? 0 : (max - min) / max;
      }
      // hue
      const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
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

    // Reusable per-line buffers. Old code allocated a fresh Array of {i, s}
    // objects per row/column AND a fresh slice + map of [r,g,b,a] arrays
    // per span — dozens of MB of garbage on a 2k canvas.
    const lineLen = w > h ? w : h;
    const positions = new Int32Array(lineLen);   // data offsets
    const scores    = new Float32Array(lineLen); // sort keys
    const sortBuf   = new Int32Array(lineLen);   // working indices for each span
    const tmpR = new Uint8ClampedArray(lineLen);
    const tmpG = new Uint8ClampedArray(lineLen);
    const tmpB = new Uint8ClampedArray(lineLen);

    function processLine(N) {
      let i = 0;
      while (i < N) {
        if (scores[i] < threshold) { i++; continue; }
        let j = i;
        while (j < N && scores[j] >= threshold) j++;
        const len = j - i;
        if (len > 1) {
          // Sort by ascending score using a Int32Array view of indices into
          // the line. Comparator reads the (separate) scores array.
          for (let k = 0; k < len; k++) sortBuf[k] = i + k;
          sortBuf.subarray(0, len).sort((a, b) => scores[a] - scores[b]);
          // Snapshot colours at the sorted positions before writing back.
          for (let k = 0; k < len; k++) {
            const di = positions[sortBuf[k]];
            tmpR[k] = d[di];
            tmpG[k] = d[di + 1];
            tmpB[k] = d[di + 2];
          }
          for (let k = 0; k < len; k++) {
            const di = positions[i + k];
            d[di]     = d[di]     + (tmpR[k] - d[di])     * amount;
            d[di + 1] = d[di + 1] + (tmpG[k] - d[di + 1]) * amount;
            d[di + 2] = d[di + 2] + (tmpB[k] - d[di + 2]) * amount;
          }
        }
        i = j;
      }
    }

    if (dir === 'horizontal') {
      for (let y = 0; y < h; y++) {
        const rowOff = y * w * 4;
        for (let x = 0; x < w; x++) {
          const idx = rowOff + x * 4;
          positions[x] = idx;
          scores[x] = score(src[idx], src[idx + 1], src[idx + 2]);
        }
        processLine(w);
      }
    } else {
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const idx = (y * w + x) * 4;
          positions[y] = idx;
          scores[y] = score(src[idx], src[idx + 1], src[idx + 2]);
        }
        processLine(h);
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
