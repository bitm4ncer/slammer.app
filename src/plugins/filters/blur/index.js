// Blur — separable box blur, 3 passes for a Gaussian-ish profile.

import { sliderRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'blur',
  name: 'Blur',
  version: '1.0.0',
  type: 'filter',
  icon: 'droplet',
  category: 'adjust',

  defaultParams() { return { radius: 4 }; },

  process(imageData, params) {
    const r = Math.max(0, Math.min(60, Math.floor(params.radius ?? 0)));
    if (r <= 0) return imageData;
    const w = imageData.width;
    const h = imageData.height;
    let a = new Uint8ClampedArray(imageData.data);
    let b = new Uint8ClampedArray(a.length);
    for (let pass = 0; pass < 3; pass++) {
      boxBlurH(a, b, w, h, r);
      boxBlurV(b, a, w, h, r);
    }
    imageData.data.set(a);
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    root.appendChild(sliderRow({
      label: 'Radius', min: 0, max: 40, step: 1, value: params.radius ?? 4,
      onChange: (v) => onChange({ radius: v }),
    }));
    return root;
  },
};

function boxBlurH(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let rs = 0, gs = 0, bs = 0, as = 0;
    const row = y * w;
    for (let i = -r; i <= r; i++) {
      const x = Math.max(0, Math.min(w - 1, i));
      const idx = (row + x) * 4;
      rs += src[idx]; gs += src[idx + 1]; bs += src[idx + 2]; as += src[idx + 3];
    }
    for (let x = 0; x < w; x++) {
      const out = (row + x) * 4;
      dst[out] = rs / div;
      dst[out + 1] = gs / div;
      dst[out + 2] = bs / div;
      dst[out + 3] = as / div;
      const xAdd = Math.min(w - 1, x + r + 1);
      const xRem = Math.max(0, x - r);
      const aIdx = (row + xAdd) * 4;
      const rIdx = (row + xRem) * 4;
      rs += src[aIdx] - src[rIdx];
      gs += src[aIdx + 1] - src[rIdx + 1];
      bs += src[aIdx + 2] - src[rIdx + 2];
      as += src[aIdx + 3] - src[rIdx + 3];
    }
  }
}
function boxBlurV(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let rs = 0, gs = 0, bs = 0, as = 0;
    for (let i = -r; i <= r; i++) {
      const y = Math.max(0, Math.min(h - 1, i));
      const idx = (y * w + x) * 4;
      rs += src[idx]; gs += src[idx + 1]; bs += src[idx + 2]; as += src[idx + 3];
    }
    for (let y = 0; y < h; y++) {
      const out = (y * w + x) * 4;
      dst[out] = rs / div;
      dst[out + 1] = gs / div;
      dst[out + 2] = bs / div;
      dst[out + 3] = as / div;
      const yAdd = Math.min(h - 1, y + r + 1);
      const yRem = Math.max(0, y - r);
      const aIdx = (yAdd * w + x) * 4;
      const rIdx = (yRem * w + x) * 4;
      rs += src[aIdx] - src[rIdx];
      gs += src[aIdx + 1] - src[rIdx + 1];
      bs += src[aIdx + 2] - src[rIdx + 2];
      as += src[aIdx + 3] - src[rIdx + 3];
    }
  }
}
