// Edge Detection — Sobel-style outline pass.

import { sliderRow, pillGroup, toggleRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'edge-detection',
  name: 'Edge Detection',
  version: '1.0.0',
  type: 'filter',
  icon: 'border-style',
  category: 'stylize',
  description: 'Trace contours with sobel edges',

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
            let mag = Math.sqrt(gx * gx + gy * gy) * strength;
            if (mag > 255) mag = 255;
            mags[(y * w + x) * 3 + c] = mag;
          }
        }
      }
    } else {
      // Luminance Sobel for mono and sourceTinted. Pre-compute luminance
      // ONCE into a Float32Array — the old version recomputed each pixel's
      // Y up to 9 times (once per neighbour position in the 3x3 window).
      // Same hypot replacement as below: Math.sqrt(gx*gx+gy*gy) is ~2x
      // faster than Math.hypot in V8.
      const lum = new Float32Array(w * h);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        lum[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) * 0.001;
      }
      for (let y = 1; y < h - 1; y++) {
        const upRow = (y - 1) * w;
        const midRow = y * w;
        const downRow = (y + 1) * w;
        for (let x = 1; x < w - 1; x++) {
          const l00 = lum[upRow + x - 1];
          const l01 = lum[upRow + x];
          const l02 = lum[upRow + x + 1];
          const l10 = lum[midRow + x - 1];
          const l12 = lum[midRow + x + 1];
          const l20 = lum[downRow + x - 1];
          const l21 = lum[downRow + x];
          const l22 = lum[downRow + x + 1];
          const gx = -l00 + l02 - 2 * l10 + 2 * l12 - l20 + l22;
          const gy = -l00 - 2 * l01 - l02 + l20 + 2 * l21 + l22;
          let mag = Math.sqrt(gx * gx + gy * gy) * strength;
          if (mag > 255) mag = 255;
          mags[midRow + x] = mag;
        }
      }
    }

    // ---------- Pass 2: threshold + (optional) dilate ----------
    // Threshold zaps weak pixels. Dilation then thickens edges into
    // adjacent zeroed pixels. The old version did a 5x5 max-scan inline
    // for EVERY zeroed pixel — O(W·H·r²). Same anti-pattern we fixed in
    // drop-shadow (commit 2862287). Use a separable sliding-max deque
    // (O(W·H) regardless of r) and merge: keep original where non-zero,
    // use dilated where zero.
    const r = thickness - 1;
    if (perChannel) {
      // Process each channel independently. Mags layout is RGBRGB...
      // — extract a channel into a tight buffer, threshold + dilate,
      // then write back interleaved at the end.
      const chanBuf = new Uint8ClampedArray(w * h);
      for (let c = 0; c < 3; c++) {
        for (let i = 0; i < w * h; i++) chanBuf[i] = mags[i * 3 + c];
        thresholdMagsInPlace(chanBuf, threshold);
        if (r > 0) {
          const dilated = dilateMax(chanBuf, w, h, r);
          for (let i = 0; i < w * h; i++) if (chanBuf[i] === 0) chanBuf[i] = dilated[i];
        }
        // Write back to imageData[c]
        for (let i = 0; i < w * h; i++) {
          const v = chanBuf[i];
          d[i * 4 + c] = invert ? (255 - v) : v;
        }
      }
    } else {
      thresholdMagsInPlace(mags, threshold);
      if (r > 0) {
        const dilated = dilateMax(mags, w, h, r);
        for (let i = 0; i < w * h; i++) if (mags[i] === 0) mags[i] = dilated[i];
      }
      if (colorMode === 'sourceTinted') {
        for (let i = 0; i < w * h; i++) d[i * 4 + 3] = mags[i];
      } else {
        // mono
        for (let i = 0; i < w * h; i++) {
          const out = invert ? (255 - mags[i]) : mags[i];
          d[i * 4]     = out;
          d[i * 4 + 1] = out;
          d[i * 4 + 2] = out;
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

// ---------------------------------------------------------------------------
// Helpers — same sliding-max-deque pattern as drop-shadow's dilateAlpha
// (van Herk-Gil-Werman). Replaces the old O(W·H·r²) inner-loop scan with
// O(W·H) total work, independent of r.
// ---------------------------------------------------------------------------

function thresholdMagsInPlace(mags, threshold) {
  if (threshold <= 0) return;
  for (let i = 0; i < mags.length; i++) if (mags[i] < threshold) mags[i] = 0;
}

function dilateMax(src, w, h, r) {
  const tmp = new Uint8ClampedArray(w * h);
  const out = new Uint8ClampedArray(w * h);
  const deqMax = Math.max(w, h);
  const deq = new Int32Array(deqMax);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    let head = 0, tail = 0;
    const preLimit = r < w ? r : w;
    for (let i = 0; i < preLimit; i++) {
      const v = src[rowOff + i];
      while (head < tail && src[rowOff + deq[tail - 1]] <= v) tail--;
      deq[tail++] = i;
    }
    for (let x = 0; x < w; x++) {
      const xr = x + r;
      if (xr < w) {
        const v = src[rowOff + xr];
        while (head < tail && src[rowOff + deq[tail - 1]] <= v) tail--;
        deq[tail++] = xr;
      }
      const xl = x - r;
      while (head < tail && deq[head] < xl) head++;
      tmp[rowOff + x] = src[rowOff + deq[head]];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let head = 0, tail = 0;
    const preLimit = r < h ? r : h;
    for (let i = 0; i < preLimit; i++) {
      const v = tmp[i * w + x];
      while (head < tail && tmp[deq[tail - 1] * w + x] <= v) tail--;
      deq[tail++] = i;
    }
    for (let y = 0; y < h; y++) {
      const yr = y + r;
      if (yr < h) {
        const v = tmp[yr * w + x];
        while (head < tail && tmp[deq[tail - 1] * w + x] <= v) tail--;
        deq[tail++] = yr;
      }
      const yl = y - r;
      while (head < tail && deq[head] < yl) head++;
      out[y * w + x] = tmp[deq[head] * w + x];
    }
  }
  return out;
}
