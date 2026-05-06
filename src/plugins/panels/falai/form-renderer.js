// Schema-driven form renderer for fal.ai models.
// Reads a model's `fields` array (see catalog.js), produces:
//   { el, getValues(), reset() }
//
// Each field type renders into an existing slammer settings-row chrome
// (so the form looks consistent with the rest of the app).

import { createDropZone } from '../_shared/drop-zone.js';

export function renderForm({ model, ctx }) {
  const root = document.createElement('div');
  root.className = 'falai-form';

  const state = {};         // current values per field key
  const widgets = {};       // refs we may need later (drop zones, etc.)

  for (const field of model.fields || []) {
    const row = document.createElement('div');
    row.className = 'plugin-section falai-field';
    row.dataset.fieldType = field.type;

    const labelText = field.label || field.key;

    if (field.type === 'textarea') {
      const id = `falai-${model.id}-${field.key}`.replace(/[^a-z0-9-]/gi, '-');
      row.innerHTML = `
        <label class="settings-label" for="${id}">${escapeHtml(labelText)}${field.required ? ' *' : ''}</label>
        <textarea id="${id}" class="plugin-textarea" rows="${field.rows || 3}" placeholder="${escapeAttr(field.placeholder || '')}"></textarea>
      `;
      const ta = row.querySelector('textarea');
      state[field.key] = field.default ?? '';
      ta.value = state[field.key];
      ta.addEventListener('input', () => { state[field.key] = ta.value; });
    }

    else if (field.type === 'text') {
      const id = `falai-${model.id}-${field.key}`.replace(/[^a-z0-9-]/gi, '-');
      row.innerHTML = `
        <label class="settings-label" for="${id}">${escapeHtml(labelText)}${field.required ? ' *' : ''}</label>
        <input type="text" id="${id}" class="settings-text-input" placeholder="${escapeAttr(field.placeholder || '')}" />
      `;
      const inp = row.querySelector('input');
      state[field.key] = field.default ?? '';
      inp.value = state[field.key];
      inp.addEventListener('input', () => { state[field.key] = inp.value; });
    }

    else if (field.type === 'image') {
      row.innerHTML = `<div class="settings-label">${escapeHtml(labelText)}${field.required ? ' *' : ''}</div>`;
      const dz = createDropZone({
        ctx,
        label: 'Drop layer or image',
      });
      row.appendChild(dz.el);
      widgets[field.key] = { kind: 'image', dz, asArray: !!field.asArray };
      // Value is materialised at submit time (via blobPromise).
    }

    else if (field.type === 'enum') {
      const opts = field.options || [];
      const def = field.default ?? opts[0];
      state[field.key] = def;
      row.innerHTML = `
        <span class="settings-label">${escapeHtml(labelText)}</span>
        <div class="settings-control export-pillgroup falai-pillgroup" data-key="${escapeAttr(field.key)}">
          ${opts.map((v) => `<button class="effect-pill ${v === def ? 'active' : ''}" data-v="${escapeAttr(String(v))}">${escapeHtml(String(v))}</button>`).join('')}
        </div>
      `;
      const grp = row.querySelector('.falai-pillgroup');
      grp.querySelectorAll('.effect-pill').forEach((b) => {
        b.addEventListener('click', () => {
          const raw = b.dataset.v;
          // Coerce numeric options back to numbers if the schema's options are numbers.
          const isNumeric = opts.every((o) => typeof o === 'number');
          state[field.key] = isNumeric ? Number(raw) : raw;
          grp.querySelectorAll('.effect-pill').forEach((x) => x.classList.toggle('active', x === b));
        });
      });
    }

    else if (field.type === 'slider') {
      const def = field.default ?? field.min;
      state[field.key] = def;
      const id = `falai-${model.id}-${field.key}`.replace(/[^a-z0-9-]/gi, '-');
      row.innerHTML = `
        <label class="settings-label" for="${id}">${escapeHtml(labelText)} <code class="settings-readout" data-readout>${formatNum(def, field.step)}</code></label>
        <div class="settings-control">
          <input type="range" id="${id}" min="${field.min}" max="${field.max}" step="${field.step || 0.1}" value="${def}" />
        </div>
      `;
      const rng = row.querySelector('input[type="range"]');
      const readout = row.querySelector('[data-readout]');
      rng.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        state[field.key] = v;
        readout.textContent = formatNum(v, field.step);
      });
    }

    else if (field.type === 'number') {
      const def = field.default ?? field.min ?? 0;
      state[field.key] = def;
      const id = `falai-${model.id}-${field.key}`.replace(/[^a-z0-9-]/gi, '-');
      row.innerHTML = `
        <label class="settings-label" for="${id}">${escapeHtml(labelText)}</label>
        <div class="settings-control">
          <input type="number" id="${id}" class="settings-text-input" min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" value="${def}" />
        </div>
      `;
      const inp = row.querySelector('input');
      inp.addEventListener('input', () => { state[field.key] = Number(inp.value); });
    }

    else if (field.type === 'toggle') {
      const def = !!field.default;
      state[field.key] = def;
      const id = `falai-${model.id}-${field.key}`.replace(/[^a-z0-9-]/gi, '-');
      row.innerHTML = `
        <label class="settings-label" for="${id}">${escapeHtml(labelText)}</label>
        <label class="effect-toggle-row settings-toggle-bare" for="${id}">
          <input type="checkbox" id="${id}" ${def ? 'checked' : ''} />
          <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
        </label>
      `;
      row.querySelector('input').addEventListener('change', (e) => { state[field.key] = e.target.checked; });
    }

    root.appendChild(row);
  }

  async function getValues() {
    const out = { ...state };
    // Materialise image fields (Blob inputs become Files for fal.subscribe to upload).
    for (const [key, w] of Object.entries(widgets)) {
      if (w.kind === 'image') {
        const sel = w.dz.value;
        if (!sel) continue;
        const blob = await sel.blobPromise();
        if (!blob) continue;
        // Convert Blob → File so fal.ai's storage upload sets a clean filename.
        const file = blob instanceof File ? blob : new File([blob], sel.name || 'input.png', { type: blob.type || 'image/png' });
        out[key] = w.asArray ? [file] : file;
      }
    }
    return out;
  }

  function getRequiredMissing() {
    const missing = [];
    for (const f of model.fields || []) {
      if (!f.required) continue;
      if (f.type === 'image') {
        const w = widgets[f.key];
        if (!w?.dz?.value) missing.push(f.label || f.key);
      } else {
        const v = state[f.key];
        if (v == null || v === '') missing.push(f.label || f.key);
      }
    }
    return missing;
  }

  return { el: root, getValues, getRequiredMissing };
}

function formatNum(v, step = 1) {
  if (step >= 1) return String(Math.round(v));
  const decimals = String(step).split('.')[1]?.length ?? 2;
  return Number(v).toFixed(decimals);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
