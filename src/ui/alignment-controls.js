// Alignment controls — 6 icon buttons in the footer that align the active
// layer to the export frame. Visible only when both a frame is set AND there
// is an active non-FX layer.

// Inline SVG icons — proper layout-alignment glyphs (vertical/horizontal
// reference bar + two object rectangles aligned to it). FontAwesome Free
// doesn't ship the "objects-align-*" set, so we draw them ourselves.
const SVG = {
  alignLeft: `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="1" width="1" height="14"/><rect x="3" y="3" width="9" height="3"/><rect x="3" y="10" width="6" height="3"/></svg>`,
  centerH:   `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="7.5" y="1" width="1" height="14"/><rect x="3.5" y="3" width="9" height="3"/><rect x="5"   y="10" width="6" height="3"/></svg>`,
  alignRight:`<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="14" y="1" width="1" height="14"/><rect x="4" y="3" width="9" height="3"/><rect x="7" y="10" width="6" height="3"/></svg>`,
  alignTop:  `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="1" width="14" height="1"/><rect x="3" y="3" width="3" height="9"/><rect x="10" y="3" width="3" height="6"/></svg>`,
  centerV:   `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="7.5" width="14" height="1"/><rect x="3" y="3.5" width="3" height="9"/><rect x="10" y="5"   width="3" height="6"/></svg>`,
  alignBot:  `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="14" width="14" height="1"/><rect x="3" y="4" width="3" height="9"/><rect x="10" y="7" width="3" height="6"/></svg>`,
};

const ACTIONS = [
  [SVG.alignLeft,  'Align left',          'h', 'left'],
  [SVG.centerH,    'Center horizontally', 'h', 'center'],
  [SVG.alignRight, 'Align right',         'h', 'right'],
  [SVG.alignTop,   'Align top',           'v', 'top'],
  [SVG.centerV,    'Center vertically',   'v', 'middle'],
  [SVG.alignBot,   'Align bottom',        'v', 'bottom'],
];

export function initAlignmentControls({ document: doc, container }) {
  if (!container) return;

  // Build buttons once.
  container.innerHTML = ACTIONS.map(([svg, title, axis, mode]) =>
    `<button class="tb-btn tb-btn--icon align-btn" data-axis="${axis}" data-mode="${mode}" title="${title} (frame)" aria-label="${title}">${svg}</button>`
  ).join('');

  container.querySelectorAll('.align-btn').forEach((btn) => {
    btn.addEventListener('click', () => align(btn.dataset.axis, btn.dataset.mode));
  });

  function sync() {
    const f = doc.state.exportFrame;
    const active = doc.activeLayer;
    const visible = !!(f && f.w > 0 && f.h > 0 && active && active.type !== 'fx');
    container.hidden = !visible;
  }
  doc.subscribe((e) => {
    if (e.type === 'doc:exportFrame'
      || e.type === 'layer:active'
      || e.type === 'layer:added'
      || e.type === 'layer:removed'
      || e.type === 'doc:loaded') sync();
  });
  sync();

  function align(axis, mode) {
    const f = doc.state.exportFrame;
    const layer = doc.activeLayer;
    if (!f || !layer || layer.type === 'fx') return;
    const ns = layer.naturalSize || { w: 0, h: 0 };
    const sx = layer.transform.scaleX || 1;
    const sy = layer.transform.scaleY || 1;
    const lw = ns.w * sx;
    const lh = ns.h * sy;
    let nx = layer.transform.x;
    let ny = layer.transform.y;
    if (axis === 'h') {
      if (mode === 'left')   nx = f.x;
      if (mode === 'center') nx = f.x + (f.w - lw) / 2;
      if (mode === 'right')  nx = f.x + f.w - lw;
    } else {
      if (mode === 'top')    ny = f.y;
      if (mode === 'middle') ny = f.y + (f.h - lh) / 2;
      if (mode === 'bottom') ny = f.y + f.h - lh;
    }
    doc.setLayerTransform(layer.id, { x: nx, y: ny });
  }
}
