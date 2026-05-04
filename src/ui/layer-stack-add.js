// Layer Stack "+" picker — opens a portaled flyout listing every kind of thing
// you can add to the stack:
//   • Layers   — Image, Text, Text Box
//   • Effects  — every registered FILTER plugin (grouped by category). Picking
//                one creates an FX layer pre-loaded with that single filter.

import { listPlugins, getPlugin, makeEffectInstance } from '../plugins/registry.js';

const CATEGORY_ORDER = ['image', 'glitch', 'color'];
const CATEGORY_LABELS = { image: 'Image', glitch: 'Glitch', color: 'Color', other: 'Other' };

export function initLayerStackAdd({ document: doc, openTextLayer }) {
  const button = document.getElementById('btnAddStackItem');
  if (!button) return;

  let menu = null;

  function buildMenu() {
    const m = window.document.createElement('div');
    m.className = 'custom-dropdown-menu custom-dropdown-menu--portaled';

    // ---- Layers section ----
    appendGroup(m, 'Layers');
    appendItem(m, 'fa-image', 'Image', () => {
      const input = window.document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files || []);
        files.forEach((f) => doc.addImageLayer({ name: f.name || 'Image', source: f }));
      };
      input.click();
    });
    appendItem(m, 'fa-i-cursor', 'Text', () => {
      const layer = doc.addTextLayer({ text: { value: 'slammer', mode: 'text', boxWidth: 600 } });
      openTextLayer?.(layer);
    });
    appendItem(m, 'fa-pen-to-square', 'Text Box', () => {
      const layer = doc.addTextLayer({ text: { value: 'slammer', mode: 'textBox', boxWidth: 600 } });
      openTextLayer?.(layer);
    });

    // ---- Effects (filters only) section, grouped by plugin.category ----
    const filters = listPlugins({ type: 'filter' });
    if (filters.length) {
      const buckets = new Map();
      for (const p of filters) {
        const cat = CATEGORY_ORDER.includes(p.category) ? p.category : 'other';
        if (!buckets.has(cat)) buckets.set(cat, []);
        buckets.get(cat).push(p);
      }
      for (const arr of buckets.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
      const orderedCats = [...CATEGORY_ORDER, 'other'].filter((c) => buckets.has(c));
      for (const cat of orderedCats) {
        appendGroup(m, `Effects · ${CATEGORY_LABELS[cat] || cat}`);
        for (const p of buckets.get(cat)) {
          appendItem(m, `fa-${p.icon || 'puzzle-piece'}`, p.name, () => addFxLayerWithEffect(p.id, p.name));
        }
      }
    }
    return m;
  }

  function addFxLayerWithEffect(pluginId, displayName) {
    const layer = doc.addFxLayer({ name: displayName });
    const inst = makeEffectInstance(pluginId);
    if (inst) doc.addEffect(layer.id, inst);
  }

  function appendGroup(m, label) {
    const g = window.document.createElement('div');
    g.className = 'custom-dropdown-group';
    g.textContent = label;
    m.appendChild(g);
  }
  function appendItem(m, faIcon, label, onClick) {
    const it = window.document.createElement('div');
    it.className = 'custom-dropdown-item';
    it.innerHTML = `<i class="fas ${faIcon}"></i><span>${label}</span>`;
    it.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
      close();
    });
    m.appendChild(it);
  }

  function position() {
    if (!menu) return;
    const r = button.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom;
    const maxH = Math.min(420, Math.max(220, spaceBelow > 240 ? spaceBelow - 16 : r.top - 16));
    menu.style.maxHeight = `${maxH}px`;
    menu.style.width = '220px';
    menu.style.left = `${Math.max(8, r.right - 220)}px`;
    if (spaceBelow > 240 || spaceBelow > r.top) {
      menu.style.top = `${r.bottom + 6}px`;
      menu.style.bottom = '';
    } else {
      menu.style.top = '';
      menu.style.bottom = `${vh - r.top + 6}px`;
    }
  }

  function open() {
    if (menu) { close(); return; }
    menu = buildMenu();
    document.body.appendChild(menu);
    position();
    document.addEventListener('mousedown', onOutside, { capture: true });
    window.addEventListener('scroll', position, { capture: true, passive: true });
    window.addEventListener('resize', position);
  }
  function close() {
    if (!menu) return;
    if (menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
    document.removeEventListener('mousedown', onOutside, { capture: true });
    window.removeEventListener('scroll', position, { capture: true });
    window.removeEventListener('resize', position);
  }
  function onOutside(e) {
    if (button.contains(e.target)) return;
    if (menu && !menu.contains(e.target)) close();
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    open();
  });
}
