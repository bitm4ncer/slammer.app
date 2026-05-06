// Document Size popup — pick a preset or enter a custom W × H, sets
// doc.state.exportFrame so the canvas overlay + alignment + export use it.
//
// "Document size" is intentionally framed as an EXPORT REGION, not a strict
// page boundary — layers can extend beyond it freely.

const PRESETS = [
  {
    label: 'Screens',
    items: [
      ['HD',         1280, 720],
      ['FHD',        1920, 1080],
      ['QHD',        2560, 1440],
      ['4K UHD',     3840, 2160],
    ],
  },
  {
    label: 'Social',
    items: [
      ['IG Square',     1080, 1080],
      ['IG Portrait',   1080, 1350],
      ['IG Story',      1080, 1920],
      ['Twitter Post',  1200, 675],
      ['Twitter Header',1500, 500],
      ['FB Cover',      1200, 630],
      ['YT Thumb',      1280, 720],
      ['LinkedIn Banner',1584, 396],
    ],
  },
  {
    label: 'Print @ 300 dpi',
    items: [
      ['A6',  1240,  1748],
      ['A5',  1748,  2480],
      ['A4',  2480,  3508],
      ['A3',  3508,  4961],
      ['A2',  4961,  7016],
      ['A1',  7016,  9933],
      ['A0',  9933, 14043],
    ],
  },
];

export function initDocumentSizePopup({ document: doc, view, button }) {
  if (!button) return;
  let backdrop = null;

  // ── Active-state highlight ──────────────────────────────────────────────
  const xSpan = button.querySelector('.btn-doc-size-x');

  function syncActiveState() {
    const active = !!doc.state.exportFrame;
    button.classList.toggle('btn-doc-size--active', active);
    // xSpan visibility is handled by CSS (.btn-doc-size--active .btn-doc-size-x)
    // but we also toggle [hidden] so the CSS gotcha defence fires correctly.
    if (xSpan) xSpan.hidden = !active;
  }

  if (xSpan) {
    xSpan.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent popup from opening
      doc.setExportFrame(null);
    });
  }

  doc.subscribe((e) => {
    if (e.type === 'doc:exportFrame' || e.type === 'doc:loaded') syncActiveState();
  });

  // Sync immediately in case a frame is already set (e.g. after project restore).
  syncActiveState();

  function open() {
    if (backdrop) return;
    const cur = doc.state.exportFrame;
    backdrop = window.document.createElement('div');
    backdrop.className = 'settings-backdrop';
    backdrop.innerHTML = `
      <div class="settings-modal docsize-modal" role="dialog" aria-label="Document size">
        <div class="settings-header">
          <span><i class="fas fa-vector-square"></i> Document Size</span>
          <button class="settings-close" data-act="close" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>

        <div class="settings-section">
          <div class="settings-row">
            <span class="settings-label">Custom</span>
            <div class="settings-control docsize-custom">
              <input type="number" id="docW" min="16" max="20000" value="${cur?.w || 1920}" />
              <span class="docsize-x">×</span>
              <input type="number" id="docH" min="16" max="20000" value="${cur?.h || 1080}" />
              <button class="settings-apply" id="docApply">Set</button>
            </div>
          </div>
        </div>

        <div class="settings-section docsize-presets">
          ${PRESETS.map((g) => `
            <div class="docsize-group-label">${g.label}</div>
            <div class="docsize-grid">
              ${g.items.map(([name, w, h]) => `
                <button class="docsize-card" data-w="${w}" data-h="${h}" data-name="${name}">
                  <span class="docsize-card-name">${name}</span>
                  <span class="docsize-card-dim">${w} × ${h}</span>
                </button>
              `).join('')}
            </div>
          `).join('')}
        </div>

        <div class="settings-section settings-meta">
          <button class="settings-clear" id="docClear">Clear frame</button>
        </div>
      </div>
    `;
    window.document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
    });
    backdrop.querySelector('#docApply').addEventListener('click', () => {
      const w = parseInt(backdrop.querySelector('#docW').value, 10);
      const h = parseInt(backdrop.querySelector('#docH').value, 10);
      if (!(w > 0) || !(h > 0)) return;
      apply({ name: 'Custom', w, h });
      close();
    });
    backdrop.querySelectorAll('.docsize-card').forEach((card) => {
      card.addEventListener('click', () => {
        const w = parseInt(card.dataset.w, 10);
        const h = parseInt(card.dataset.h, 10);
        const name = card.dataset.name || 'Custom';
        apply({ name, w, h });
        close();
      });
    });
    backdrop.querySelector('#docClear').addEventListener('click', () => {
      doc.setExportFrame(null);
      close();
    });
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    backdrop._onKey = onKey;
  }
  function close() {
    if (!backdrop) return;
    document.removeEventListener('keydown', backdrop._onKey);
    backdrop.remove();
    backdrop = null;
  }

  function apply({ name, w, h }) {
    // Centre the frame in the current viewport (in world coordinates).
    const stage = view.stage;
    const sx = stage.scaleX();
    const cx = (stage.width() / 2 - stage.x()) / sx;
    const cy = (stage.height() / 2 - stage.y()) / sx;
    doc.setExportFrame({ name, w, h, x: cx - w / 2, y: cy - h / 2 });
  }

  button.addEventListener('click', open);
  return { open, close };
}
