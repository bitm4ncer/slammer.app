// Curves — per-channel tone curves applied via 256-entry LUTs.
// Master curve composes after the per-channel curves.

import { makeRoot } from '../../shared/ui-helpers.js';
import { createCurveEditor, buildLut } from './curve-editor.js';

const DEFAULT_PTS = () => [{ x: 0, y: 0 }, { x: 255, y: 255 }];

export default {
  id: 'curves',
  name: 'Curves',
  version: '1.0.0',
  type: 'filter',
  icon: 'chart-line',
  category: 'color',

  defaultParams() {
    return {
      master: DEFAULT_PTS(),
      r: DEFAULT_PTS(),
      g: DEFAULT_PTS(),
      b: DEFAULT_PTS(),
      active: 'master',
    };
  },

  process(imageData, params) {
    const lutR = buildLut(params.r || DEFAULT_PTS());
    const lutG = buildLut(params.g || DEFAULT_PTS());
    const lutB = buildLut(params.b || DEFAULT_PTS());
    const lutM = buildLut(params.master || DEFAULT_PTS());
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = lutM[lutR[d[i]]];
      d[i + 1] = lutM[lutG[d[i + 1]]];
      d[i + 2] = lutM[lutB[d[i + 2]]];
    }
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = {
      master: (params.master || DEFAULT_PTS()).map((p) => ({ ...p })),
      r: (params.r || DEFAULT_PTS()).map((p) => ({ ...p })),
      g: (params.g || DEFAULT_PTS()).map((p) => ({ ...p })),
      b: (params.b || DEFAULT_PTS()).map((p) => ({ ...p })),
      active: params.active || 'master',
    };

    // Channel selector
    const sel = document.createElement('div');
    sel.className = 'effect-pill-group curves-channel-row';
    const channels = [
      { value: 'master', label: 'Master', color: '#e8e8e8' },
      { value: 'r',      label: 'R',      color: '#ff6b6b' },
      { value: 'g',      label: 'G',      color: '#7ee787' },
      { value: 'b',      label: 'B',      color: '#6cb6ff' },
    ];
    function syncSel() {
      sel.querySelectorAll('.effect-pill').forEach((el) => {
        el.classList.toggle('active', el.dataset.value === local.active);
      });
    }
    for (const ch of channels) {
      const p = document.createElement('button');
      p.type = 'button';
      p.className = `effect-pill ${ch.value === local.active ? 'active' : ''}`;
      p.dataset.value = ch.value;
      p.textContent = ch.label;
      p.style.borderLeft = `3px solid ${ch.color}`;
      p.addEventListener('click', () => {
        local.active = ch.value;
        onChange({ active: ch.value });
        syncSel();
        editor.redraw();
      });
      sel.appendChild(p);
    }
    root.appendChild(sel);

    const editor = createCurveEditor({
      getPoints: () => local[local.active],
      setPoints: (pts) => {
        local[local.active] = pts;
        onChange({ [local.active]: pts });
      },
      channelColor: () => channels.find((c) => c.value === local.active)?.color || '#e8e8e8',
    });
    root.appendChild(editor.root);

    // Reset button — resets the active channel only.
    const resetRow = document.createElement('div');
    resetRow.className = 'curves-reset-row';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'effect-pill';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset channel';
    resetBtn.addEventListener('click', () => {
      local[local.active] = DEFAULT_PTS();
      onChange({ [local.active]: DEFAULT_PTS() });
      editor.redraw();
    });
    resetRow.appendChild(resetBtn);
    root.appendChild(resetRow);

    return root;
  },
};
