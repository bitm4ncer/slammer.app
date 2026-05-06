// Vector-effects panel — list + add UI for vector-filter plugin
// instances on the active vector layer. Rendered into a dedicated card
// inside the Vector tool panel; mirrors the existing Effects card but
// only shows plugins of type 'vector-filter' and writes to
// layer.vectorEffects.

import { listPlugins, getPlugin, makeEffectInstance } from '../plugins/registry.js';

export function initVectorEffectsPanel({ document: doc, host }) {
  const panel = document.createElement('div');
  panel.className = 'vector-fx-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="vector-fx-header">
      <h3><i class="fas fa-magic"></i> Vector Effects</h3>
      <button type="button" class="vector-fx-add" title="Add vector effect">
        <i class="fas fa-plus"></i>
      </button>
    </div>
    <div class="vector-fx-stack" data-host="stack"></div>
    <div class="vector-fx-picker" data-host="picker" hidden></div>
  `;
  host.appendChild(panel);

  const addBtn = panel.querySelector('.vector-fx-add');
  const stack  = panel.querySelector('[data-host=stack]');
  const picker = panel.querySelector('[data-host=picker]');

  function activeLayer() { return doc.activeLayer; }

  function buildPicker() {
    picker.innerHTML = '';
    const layer = activeLayer();
    const isGroup = layer && layer.type === 'group';
    const plugins = listPlugins({ type: 'vector-filter' }).slice();
    // Sort: when a group is active, multi-preferred plugins (Metaball,
    // Boolean — anything that's most useful with N source paths) float
    // to the top of the picker.
    if (isGroup) {
      plugins.sort((a, b) => (b.multiPathPreferred === true) - (a.multiPathPreferred === true));
    }
    if (!plugins.length) {
      picker.innerHTML = '<div class="vector-fx-picker-empty">No vector effects available.</div>';
      return;
    }
    for (const p of plugins) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vector-fx-picker-item';
      const tag = (isGroup && p.multiPathPreferred) ? '<span class="vector-fx-picker-tag" title="Best on multiple shapes">✨</span>' : '';
      b.innerHTML = `<i class="fas fa-${p.icon || 'circle'}"></i><span>${p.name}</span>${tag}`;
      b.addEventListener('click', () => {
        const cur = activeLayer();
        if (!cur) return;
        const okType = cur.type === 'vector' || (cur.type === 'group' && doc.isVectorOnlyGroup?.(cur.id));
        if (!okType) return;
        const inst = makeEffectInstance(p.id);
        if (!inst) return;
        doc.addVectorEffect(cur.id, inst);
        picker.hidden = true;
      });
      picker.appendChild(b);
    }
  }

  addBtn.addEventListener('click', () => {
    if (picker.hidden) buildPicker();
    picker.hidden = !picker.hidden;
  });

  // Click outside the picker closes it.
  document.addEventListener('click', (e) => {
    if (picker.hidden) return;
    if (panel.contains(e.target)) return;
    picker.hidden = true;
  });

  function renderEffectInstance(eff) {
    const plugin = getPlugin(eff.pluginId);
    const card = document.createElement('div');
    card.className = 'vector-fx-card' + (eff.enabled === false ? ' is-disabled' : '');
    card.dataset.id = eff.id;
    card.innerHTML = `
      <div class="vector-fx-card-head">
        <button class="vector-fx-toggle" title="${eff.enabled === false ? 'Enable' : 'Disable'}">
          <i class="fas fa-${eff.enabled === false ? 'eye-slash' : 'eye'}"></i>
        </button>
        <span class="vector-fx-card-name">
          <i class="fas fa-${plugin?.icon || 'circle'}"></i>
          ${plugin?.name || eff.pluginId}
        </span>
        <button class="vector-fx-collapse" title="${eff.expanded === false ? 'Expand' : 'Collapse'}">
          <i class="fas fa-chevron-${eff.expanded === false ? 'right' : 'down'}"></i>
        </button>
        <button class="vector-fx-remove" title="Remove">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="vector-fx-card-body" ${eff.expanded === false ? 'hidden' : ''}></div>
    `;
    const body = card.querySelector('.vector-fx-card-body');
    if (plugin) {
      const params = eff.params || plugin.defaultParams();
      const ui = plugin.renderUI(params, (patch) => {
        const layer = activeLayer();
        if (!layer) return;
        doc.setVectorEffectParams(layer.id, eff.id, patch);
      });
      if (ui) body.appendChild(ui);
    } else {
      body.textContent = `Plugin "${eff.pluginId}" not registered.`;
    }
    card.querySelector('.vector-fx-toggle').addEventListener('click', () => {
      const layer = activeLayer();
      if (!layer) return;
      doc.setVectorEffectProp(layer.id, eff.id, 'enabled', !(eff.enabled !== false));
    });
    card.querySelector('.vector-fx-collapse').addEventListener('click', () => {
      const layer = activeLayer();
      if (!layer) return;
      doc.setVectorEffectProp(layer.id, eff.id, 'expanded', eff.expanded === false);
    });
    card.querySelector('.vector-fx-remove').addEventListener('click', () => {
      const layer = activeLayer();
      if (!layer) return;
      doc.removeVectorEffect(layer.id, eff.id);
    });
    return card;
  }

  function rebuild() {
    const layer = activeLayer();
    const isVectorish =
      layer && (
        layer.type === 'vector'
        || (layer.type === 'group' && doc.isVectorOnlyGroup?.(layer.id))
      );
    if (!isVectorish) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    // Header label adapts so the user knows the effects target the
    // group's path union (Metaball etc. is the headline use-case).
    const heading = panel.querySelector('h3');
    if (heading) {
      heading.innerHTML = `<i class="fas fa-magic"></i> Vector Effects${layer.type === 'group' ? ' (Group)' : ''}`;
    }
    stack.innerHTML = '';
    const fx = layer.vectorEffects || [];
    if (!fx.length) {
      const empty = document.createElement('div');
      empty.className = 'vector-fx-empty';
      empty.textContent = 'No vector effects yet — click + to add';
      stack.appendChild(empty);
      return;
    }
    for (const eff of fx) stack.appendChild(renderEffectInstance(eff));
  }

  doc.subscribe((e) => {
    if (
      e.type === 'layer:active' || e.type === 'layer:added' ||
      e.type === 'layer:removed' || e.type === 'doc:loaded' ||
      e.type === 'vectorEffect:added' || e.type === 'vectorEffect:removed' ||
      e.type === 'vectorEffect:propChanged' || e.type === 'vectorEffect:reordered'
    ) rebuild();
  });

  rebuild();
}
