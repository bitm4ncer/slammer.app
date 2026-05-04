// Invert — trivial filter, used end-to-end as the Phase 4a smoke test.

export default {
  id: 'invert',
  name: 'Invert',
  version: '1.0.0',
  type: 'filter',
  icon: 'adjust',
  category: 'adjust',

  defaultParams() {
    return { strength: 1 };
  },

  process(imageData, params) {
    const k = Math.max(0, Math.min(1, params.strength ?? 1));
    const d = imageData.data;
    if (k === 0) return imageData;
    if (k === 1) {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
    } else {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i] + (255 - 2 * d[i]) * k;
        d[i + 1] = d[i + 1] + (255 - 2 * d[i + 1]) * k;
        d[i + 2] = d[i + 2] + (255 - 2 * d[i + 2]) * k;
      }
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = document.createElement('div');
    root.className = 'effect-inline-controls';
    root.innerHTML = `
      <label class="effect-slider-row">
        <span class="effect-label">Strength</span>
        <input type="range" min="0" max="1" step="0.01" value="${params.strength ?? 1}" />
        <input type="number" min="0" max="1" step="0.01" value="${params.strength ?? 1}" class="effect-num" />
      </label>
    `;
    const range = root.querySelector('input[type=range]');
    const num = root.querySelector('input[type=number]');
    const sync = (val) => {
      const v = Math.max(0, Math.min(1, parseFloat(val)));
      range.value = String(v);
      num.value = String(v);
      onChange({ strength: v });
    };
    range.addEventListener('input', (e) => sync(e.target.value));
    num.addEventListener('input', (e) => sync(e.target.value));
    return root;
  },
};
