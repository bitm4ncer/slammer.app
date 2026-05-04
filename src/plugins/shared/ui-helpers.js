// Shared DOM helpers for plugin UIs.

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

export function sliderRow({ label, min, max, step = 1, value, onChange, format }) {
  const row = document.createElement('label');
  row.className = 'effect-slider-row';
  row.innerHTML = `
    <span class="effect-label">${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
    <input type="number" min="${min}" max="${max}" step="${step}" value="${value}" class="effect-num" />
  `;
  const range = row.querySelector('input[type=range]');
  const num = row.querySelector('input[type=number]');
  const sync = (val, source) => {
    let v = parseFloat(val);
    if (Number.isNaN(v)) return;
    v = Math.max(parseFloat(min), Math.min(parseFloat(max), v));
    if (source !== 'range') range.value = String(v);
    if (source !== 'num') num.value = String(v);
    onChange(format ? format(v) : v);
  };
  range.addEventListener('input', (e) => sync(e.target.value, 'range'));
  num.addEventListener('input', (e) => sync(e.target.value, 'num'));
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
