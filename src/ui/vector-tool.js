// Vector-tool — properties panel that appears in the side-panel-bottom when
// a vector layer is active. Same mounting pattern as the Typo panel.
//
// Phase 13a contents:
//   • Fill (Solid / Gradient / None) with color or 2-stop gradient editor
//   • Stroke (Solid / Gradient / Gradient-along-stroke / None) with width,
//     alignment, cap, join, dash preset
//   • Path bbox readout (read-only — full edit comes in 13b)

import { sliderRow } from '../plugins/shared/ui-helpers.js';
import { DEFAULT_VECTOR_FILL, DEFAULT_VECTOR_STROKE } from '../core/layer.js';
import { createGradientEditor } from '../plugins/shared/gradient-editor.js';

// Pills use icons instead of text labels for the type rows.
//   Solid    = filled square        (fa-square)
//   Gradient = gradient swatch      (fa-fill-drip — best FA proxy)
//   Along    = gradient along path  (fa-arrow-trend-up)
//   None     = nothing / blocked    (fa-ban)
const FILL_TYPES   = [
  { v: 'solid',    icon: 'fa-square',          title: 'Solid color' },
  { v: 'gradient', icon: 'fa-fill-drip',       title: 'Gradient fill' },
  { v: 'none',     icon: 'fa-ban',             title: 'No fill' },
];
const STROKE_TYPES = [
  { v: 'solid',         icon: 'fa-square',          title: 'Solid color' },
  { v: 'gradient',      icon: 'fa-fill-drip',       title: 'Gradient stroke' },
  { v: 'gradientAlong', icon: 'fa-arrow-trend-up',  title: 'Gradient along the stroke direction' },
  { v: 'none',          icon: 'fa-ban',             title: 'No stroke' },
];
const STROKE_ALIGN = [{ v: 'inside', l: 'Inside' }, { v: 'center', l: 'Center' }, { v: 'outside', l: 'Outside' }];
const STROKE_CAP   = [{ v: 'butt', l: 'Butt' }, { v: 'round', l: 'Round' }, { v: 'square', l: 'Square' }];
const STROKE_JOIN  = [{ v: 'miter', l: 'Miter' }, { v: 'round', l: 'Round' }, { v: 'bevel', l: 'Bevel' }];

export function initVectorTool({ document: doc }) {
  const panel = document.createElement('div');
  panel.className = 'vector-tool-panel text-tool-panel';   // share base styling with Typo panel
  panel.style.display = 'none';
  panel.innerHTML = `
    <h3><i class="fas fa-bezier-curve"></i> Vector</h3>

    <div class="effect-slider-row">
      <span class="effect-label">Fill</span>
      <div class="vector-pills" data-host="fill-type"></div>
    </div>
    <div class="effect-slider-row" data-row="fill-color">
      <span class="effect-label">Color</span>
      <input type="color" data-key="fillColor" />
    </div>
    <div data-host="fill-gradient"></div>

    <div class="effect-slider-row">
      <span class="effect-label">Stroke</span>
      <div class="vector-pills" data-host="stroke-type"></div>
    </div>
    <div class="effect-slider-row" data-row="stroke-color">
      <span class="effect-label">Color</span>
      <input type="color" data-key="strokeColor" />
    </div>
    <div data-host="stroke-gradient"></div>
    <div data-host="stroke-width"></div>
    <div class="effect-slider-row" data-row="stroke-align">
      <span class="effect-label">Align</span>
      <div class="vector-pills" data-host="stroke-align"></div>
    </div>
    <div class="effect-slider-row" data-row="stroke-cap">
      <span class="effect-label">Cap</span>
      <div class="vector-pills" data-host="stroke-cap"></div>
    </div>
    <div class="effect-slider-row" data-row="stroke-join">
      <span class="effect-label">Join</span>
      <div class="vector-pills" data-host="stroke-join"></div>
    </div>
  `;

  // Mount above the Effects card (same as Typo panel).
  const effectsGroup = document.querySelector('.effects-group');
  const host = effectsGroup?.parentNode || document.querySelector('.side-panel-bottom') || document.querySelector('.side-panel');
  if (effectsGroup && effectsGroup.parentNode === host) host.insertBefore(panel, effectsGroup);
  else host.appendChild(panel);

  const fillTypeHost      = panel.querySelector('[data-host=fill-type]');
  const fillColorRow      = panel.querySelector('[data-row=fill-color]');
  const fillColorInput    = panel.querySelector('input[data-key=fillColor]');
  const fillGradHost      = panel.querySelector('[data-host=fill-gradient]');
  const strokeTypeHost    = panel.querySelector('[data-host=stroke-type]');
  const strokeColorRow    = panel.querySelector('[data-row=stroke-color]');
  const strokeColorInput  = panel.querySelector('input[data-key=strokeColor]');
  const strokeGradHost    = panel.querySelector('[data-host=stroke-gradient]');
  const strokeWidthHost   = panel.querySelector('[data-host=stroke-width]');
  const strokeAlignHost   = panel.querySelector('[data-host=stroke-align]');
  const strokeCapHost     = panel.querySelector('[data-host=stroke-cap]');
  const strokeJoinHost    = panel.querySelector('[data-host=stroke-join]');
  const strokeAlignRow    = panel.querySelector('[data-row=stroke-align]');
  const strokeCapRow      = panel.querySelector('[data-row=stroke-cap]');
  const strokeJoinRow     = panel.querySelector('[data-row=stroke-join]');

  // Build pill buttons inside a host. Returns the array of buttons.
  // Opts may carry { icon, title } for icon-pills or { l } for text-pills.
  function buildPills(host, opts, onPick) {
    host.innerHTML = '';
    return opts.map((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vector-pill' + (opt.icon ? ' vector-pill--icon' : '');
      b.dataset.value = opt.v;
      if (opt.icon) {
        b.innerHTML = `<i class="fas ${opt.icon}"></i>`;
        b.title = opt.title || opt.v;
      } else {
        b.textContent = opt.l;
      }
      b.addEventListener('click', () => onPick(opt.v));
      host.appendChild(b);
      return b;
    });
  }

  let activePathIdx = 0;          // first sub-path is the editable target for now
  let pillsBuilt = false;
  let fillTypeBtns, strokeTypeBtns, strokeAlignBtns, strokeCapBtns, strokeJoinBtns;

  function ensurePills() {
    if (pillsBuilt) return;
    fillTypeBtns = buildPills(fillTypeHost, FILL_TYPES, (v) => setFillType(v));
    strokeTypeBtns = buildPills(strokeTypeHost, STROKE_TYPES, (v) => setStrokeType(v));
    strokeAlignBtns = buildPills(strokeAlignHost, STROKE_ALIGN, (v) => setStrokeProp({ align: v }));
    strokeCapBtns = buildPills(strokeCapHost, STROKE_CAP, (v) => setStrokeProp({ cap: v }));
    strokeJoinBtns = buildPills(strokeJoinHost, STROKE_JOIN, (v) => setStrokeProp({ join: v }));
    pillsBuilt = true;
  }

  function activeLayer() { return doc.activeLayer; }
  function activePath() {
    const l = activeLayer();
    if (!l || l.type !== 'vector') return null;
    return l.vector.paths[activePathIdx] || l.vector.paths[0] || null;
  }

  function setFillType(type) {
    const l = activeLayer(); const p = activePath(); if (!l || !p) return;
    const cur = p.fill || DEFAULT_VECTOR_FILL();
    let next;
    if (type === 'solid')         next = { ...DEFAULT_VECTOR_FILL(), color: cur.color || '#ffffff' };
    else if (type === 'none')     next = { type: 'none' };
    else if (type === 'gradient') next = {
      type: 'gradient', gradientType: 'linear',
      stops: cur.stops || [{ at: 0, color: '#ffffff' }, { at: 1, color: '#000000' }],
      from: cur.from || { x: 0, y: 0.5 }, to: cur.to || { x: 1, y: 0.5 },
    };
    doc.setVectorFill(l.id, activePathIdx, next);
  }

  function setStrokeType(type) {
    const l = activeLayer(); const p = activePath(); if (!l || !p) return;
    const cur = p.stroke || DEFAULT_VECTOR_STROKE();
    let next;
    if (type === 'none') next = { ...cur, type: 'none' };
    else if (type === 'solid')        next = { ...DEFAULT_VECTOR_STROKE(), ...cur, type: 'solid' };
    else if (type === 'gradient')     next = {
      ...DEFAULT_VECTOR_STROKE(), ...cur, type: 'gradient', alongPath: false,
      gradientType: 'linear',
      stops: cur.stops || [{ at: 0, color: '#ffffff' }, { at: 1, color: '#000000' }],
      from: cur.from || { x: 0, y: 0.5 }, to: cur.to || { x: 1, y: 0.5 },
    };
    else if (type === 'gradientAlong') next = {
      ...DEFAULT_VECTOR_STROKE(), ...cur, type: 'gradient', alongPath: true,
      gradientType: 'linear',
      stops: cur.stops || [{ at: 0, color: '#ffffff' }, { at: 1, color: '#000000' }],
      from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 },
    };
    doc.setVectorStroke(l.id, activePathIdx, next);
  }

  function setStrokeProp(patch) {
    const l = activeLayer(); const p = activePath(); if (!l || !p) return;
    doc.setVectorStroke(l.id, activePathIdx, { ...(p.stroke || DEFAULT_VECTOR_STROKE()), ...patch });
  }

  // ---------- Inputs ----------
  fillColorInput.addEventListener('input', () => {
    const l = activeLayer(); const p = activePath(); if (!l || !p) return;
    doc.setVectorFill(l.id, activePathIdx, { ...(p.fill || DEFAULT_VECTOR_FILL()), type: 'solid', color: fillColorInput.value });
  });
  strokeColorInput.addEventListener('input', () => {
    const l = activeLayer(); const p = activePath(); if (!l || !p) return;
    doc.setVectorStroke(l.id, activePathIdx, { ...(p.stroke || DEFAULT_VECTOR_STROKE()), type: 'solid', color: strokeColorInput.value });
  });

  function rebuild() {
    const l = activeLayer();
    if (!l || l.type !== 'vector') { panel.style.display = 'none'; return; }
    panel.style.display = '';
    ensurePills();
    activePathIdx = Math.min(activePathIdx, (l.vector.paths.length || 1) - 1);
    if (activePathIdx < 0) activePathIdx = 0;
    const p = l.vector.paths[activePathIdx] || { fill: DEFAULT_VECTOR_FILL(), stroke: DEFAULT_VECTOR_STROKE() };

    const fillType = (p.fill && p.fill.type) || 'none';
    fillTypeBtns.forEach((b) => b.classList.toggle('active', b.dataset.value === fillType));
    fillColorRow.style.display = fillType === 'solid' ? '' : 'none';
    if (fillType === 'gradient') {
      mountGradientEditor(fillGradHost, p.fill, (next) => doc.setVectorFill(l.id, activePathIdx, next));
    } else {
      fillGradHost.innerHTML = '';
    }
    if (fillType === 'solid') fillColorInput.value = p.fill.color || '#ffffff';

    let strokeType = (p.stroke && p.stroke.type) || 'none';
    if (strokeType === 'gradient' && p.stroke.alongPath) strokeType = 'gradientAlong';
    strokeTypeBtns.forEach((b) => b.classList.toggle('active', b.dataset.value === strokeType));
    const strokeOn = strokeType !== 'none';
    strokeColorRow.style.display = strokeType === 'solid' ? '' : 'none';
    if (strokeType === 'gradient' || strokeType === 'gradientAlong') {
      mountGradientEditor(strokeGradHost, p.stroke, (next) => doc.setVectorStroke(l.id, activePathIdx, next));
    } else {
      strokeGradHost.innerHTML = '';
    }
    strokeWidthHost.style.display  = strokeOn ? '' : 'none';
    strokeAlignRow.style.display = strokeOn ? '' : 'none';
    strokeCapRow.style.display   = strokeOn ? '' : 'none';
    strokeJoinRow.style.display  = strokeOn ? '' : 'none';
    if (strokeType === 'solid') strokeColorInput.value = p.stroke.color || '#000000';

    if (strokeOn) {
      strokeWidthHost.innerHTML = '';
      strokeWidthHost.appendChild(sliderRow({
        label: 'Width', min: 0, max: 200, step: 0.5,
        value: p.stroke.width ?? 2, defaultValue: 2,
        onChange: (v) => setStrokeProp({ width: v }),
      }));
      strokeAlignBtns.forEach((b) => b.classList.toggle('active', b.dataset.value === (p.stroke.align || 'center')));
      strokeCapBtns.forEach((b) => b.classList.toggle('active', b.dataset.value === (p.stroke.cap || 'butt')));
      strokeJoinBtns.forEach((b) => b.classList.toggle('active', b.dataset.value === (p.stroke.join || 'miter')));
    }
  }

  // Mount a real multi-stop gradient editor (same component as the
  // Gradient Map filter) into the given host element.
  function mountGradientEditor(host, spec, commit) {
    if (!spec || spec.type !== 'gradient') return;
    const row = document.createElement('div');
    row.className = 'effect-slider-row vector-grad-row';
    const label = document.createElement('span');
    label.className = 'effect-label';
    label.textContent = 'Stops';
    row.appendChild(label);
    const slot = document.createElement('div');
    slot.className = 'vector-grad-slot';
    row.appendChild(slot);
    const editor = createGradientEditor({
      stops: spec.stops,
      hint: false,
      onChange: (stops) => commit({ ...spec, stops }),
    });
    slot.appendChild(editor.root);
    host.innerHTML = '';
    host.appendChild(row);
  }

  doc.subscribe((e) => {
    if (e.type === 'layer:active' || e.type === 'layer:added' || e.type === 'layer:removed' || e.type === 'doc:loaded') {
      rebuild();
    }
    if (e.type === 'layer:vectorChanged') {
      const l = activeLayer();
      if (l && l.id === e.id) rebuild();
    }
  });

  rebuild();
}
