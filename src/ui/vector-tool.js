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
//   Solid    = filled circle (currentColor)
//   Gradient = inline-SVG gradient swatch (literal black→white gradient)
//   Along    = gradient along path (fa-arrow-trend-up)
//   None     = empty circle outline   (fa-ban)
const SOLID_SVG    = '<svg viewBox="0 0 12 12" width="11" height="11"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg>';
const GRADIENT_SVG = '<svg viewBox="0 0 12 12" width="11" height="11"><defs><linearGradient id="vpgr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><circle cx="6" cy="6" r="5" fill="url(#vpgr)" stroke="currentColor" stroke-width="0.6"/></svg>';
const ALONG_SVG    = '<svg viewBox="0 0 14 12" width="13" height="11"><defs><linearGradient id="vpga" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><path d="M 1 9 C 4 9, 4 3, 7 3 S 10 9, 13 9" fill="none" stroke="url(#vpga)" stroke-width="2.4" stroke-linecap="round"/></svg>';
const NONE_SVG     = '<svg viewBox="0 0 12 12" width="11" height="11"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1"/><line x1="2.5" y1="9.5" x2="9.5" y2="2.5" stroke="currentColor" stroke-width="1"/></svg>';

const FILL_TYPES   = [
  { v: 'solid',    svg: SOLID_SVG,    title: 'Solid color' },
  { v: 'gradient', svg: GRADIENT_SVG, title: 'Gradient fill' },
  { v: 'none',     svg: NONE_SVG,     title: 'No fill' },
];
const STROKE_TYPES = [
  { v: 'solid',         svg: SOLID_SVG,    title: 'Solid color' },
  { v: 'gradient',      svg: GRADIENT_SVG, title: 'Gradient stroke' },
  { v: 'gradientAlong', svg: ALONG_SVG,    title: 'Gradient along the stroke direction' },
  { v: 'none',          svg: NONE_SVG,     title: 'No stroke' },
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

  // Build pill buttons inside a host. Opts may carry:
  //   { svg, title }   inline-SVG icon
  //   { icon, title }  Font Awesome icon class
  //   { l }            plain text label
  function buildPills(host, opts, onPick) {
    host.innerHTML = '';
    return opts.map((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vector-pill' + (opt.svg || opt.icon ? ' vector-pill--icon' : '');
      b.dataset.value = opt.v;
      if (opt.svg) {
        b.innerHTML = opt.svg;
        b.title = opt.title || opt.v;
      } else if (opt.icon) {
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
      clearGradientEditor(fillGradHost);
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
      clearGradientEditor(strokeGradHost);
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

  // Mount a real multi-stop gradient editor into the given host. Reuses the
  // editor across rebuilds — without this, dragging a stop fires onChange
  // → vectorChanged → rebuild → editor recreated → handle destroyed mid-drag.
  // We track the live editor on the host and just push the new stops.
  function mountGradientEditor(host, spec, commit) {
    if (!spec || spec.type !== 'gradient') return;
    const existing = host._editor;
    if (existing) {
      // Same kind of spec — only update stops (preserve drag state).
      // Skip the update if the stops are referentially equal (we wrote them
      // and the round-trip just brought them back) to avoid a setStops
      // rebuild that would still glitch the handle.
      if (existing.lastStops !== spec.stops) {
        existing.setStops(spec.stops);
        existing.lastStops = spec.stops;
      }
      return;
    }
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
      onChange: (stops) => {
        // Mark the stops as "ours" so the next mountGradientEditor doesn't
        // try to push them back into the editor (which would reset drag).
        editor.lastStops = stops;
        commit({ ...spec, stops });
      },
    });
    editor.lastStops = spec.stops;
    slot.appendChild(editor.root);
    host.innerHTML = '';
    host.appendChild(row);
    host._editor = editor;
  }
  // Drop the cached editor when the host should fully reset (type change
  // away from gradient, or layer change).
  function clearGradientEditor(host) {
    host._editor = null;
    host.innerHTML = '';
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
