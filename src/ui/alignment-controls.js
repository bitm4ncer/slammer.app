// Alignment controls — 6 icon buttons in the footer that align the active
// layer to the export frame. Visible only when both a frame is set AND there
// is an active non-FX layer.

const ACTIONS = [
  ['fa-align-left',          'Align left',           'h', 'left'],
  ['fa-align-center',        'Center horizontally',  'h', 'center'],
  ['fa-align-right',         'Align right',          'h', 'right'],
  ['fa-arrow-up-to-line',    'Align top',            'v', 'top'],
  ['fa-grip-lines',          'Center vertically',    'v', 'middle'],
  ['fa-arrow-down-to-line',  'Align bottom',         'v', 'bottom'],
];

export function initAlignmentControls({ document: doc, container }) {
  if (!container) return;

  // Build buttons once.
  container.innerHTML = ACTIONS.map(([icon, title, axis, mode]) =>
    `<button class="tb-btn tb-btn--icon align-btn" data-axis="${axis}" data-mode="${mode}" title="${title} (frame)" aria-label="${title}">
       <i class="fas ${icon}"></i>
     </button>`
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
