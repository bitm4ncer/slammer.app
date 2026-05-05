// Shared DOM helpers for plugin UIs.

import { createKnob } from './knob.js';
import { createNumericInput } from './numeric-input.js';

export function makeRoot(extra = '') {
  const el = document.createElement('div');
  el.className = `effect-inline-controls ${extra}`;
  return el;
}

export function makeToolRoot(extra = '') {
  const el = document.createElement('div');
  el.className = `effect-tool-controls ${extra}`;
  return el;
}

export function sliderRow({ label, min, max, step = 1, value, defaultValue, onChange, format, suffix, snapWithShift = 0 }) {
  const row = document.createElement('label');
  row.className = 'effect-slider-row';

  const lbl = document.createElement('span');
  lbl.className = 'effect-label';
  lbl.textContent = label;
  row.appendChild(lbl);

  const knob = createKnob({
    size: 28,
    min, max, step,
    value,
    defaultValue: defaultValue !== undefined ? defaultValue : value,
    snapWithShift,
    onChange: (v) => {
      numWrap.setValue(format ? format(v) : v);
      onChange(format ? format(v) : v);
    },
  });
  row.appendChild(knob);

  const numWrap = createNumericInput({
    min, max, step,
    value: format ? format(value) : value,
    suffix,
    onChange: (v) => {
      knob.setValue(v);
      onChange(v);
    },
  });
  row.appendChild(numWrap);

  return row;
}

export function pillGroup({ label, options, value, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-tool-row';
  wrap.innerHTML = `<span class="effect-label">${label}</span><div class="effect-pill-group"></div>`;
  const group = wrap.querySelector('.effect-pill-group');
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `effect-pill ${opt.value === value ? 'active' : ''}`;
    btn.dataset.value = opt.value;
    btn.textContent = opt.label || opt.value;
    btn.addEventListener('click', () => {
      group.querySelectorAll('.effect-pill').forEach((p) => p.classList.toggle('active', p.dataset.value === String(opt.value)));
      onChange(opt.value);
    });
    group.appendChild(btn);
  }
  return wrap;
}

export function selectRow({ label, options, value, onChange }) {
  const row = document.createElement('label');
  row.className = 'effect-slider-row';
  row.innerHTML = `
    <span class="effect-label">${label}</span>
    <select class="effect-select" style="grid-column: 2 / span 2"></select>
  `;
  const sel = row.querySelector('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label || opt.value;
    if (opt.value === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', (e) => onChange(e.target.value));
  return row;
}

export function colorRow({ label, value, onChange }) {
  const row = document.createElement('label');
  row.className = 'effect-slider-row';
  row.innerHTML = `
    <span class="effect-label">${label}</span>
    <input type="color" value="${value}" style="grid-column: 2 / span 2; height: 24px; padding: 0; border-radius: 3px; border: 1px solid var(--vhs-shadow);" />
  `;
  row.querySelector('input').addEventListener('input', (e) => onChange(e.target.value));
  return row;
}
