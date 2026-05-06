// Export popup — region (frame|visible), format (PNG|JPEG), quality, scale,
// background, filename. Drives io/export-png.exportImage().
// Floating window via the shared floating-window factory.

import { exportImage } from '../io/export-png.js';
import { createFloatingWindow } from './floating-window.js';

const SETTINGS_KEY = 'slammer:lastExportSettings';

function loadLast() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}
function saveLast(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

let openHandle = null;

export function openExportPopup({ document: doc, renderer }) {
  if (openHandle) { openHandle.focus(); return; }

  const last = loadLast();
  const hasFrame = !!(doc.state.exportFrame && doc.state.exportFrame.w > 0);
  const initial = {
    region: hasFrame ? (last.region || 'frame') : 'visible',
    format: last.format || 'png',
    quality: last.quality ?? 92,
    scale: last.scale || 1,
    background: last.background || 'transparent',
    customBg: last.customBg || '#ffffff',
    filename: doc.state.name || 'slammer',
  };

  const handle = createFloatingWindow({
    id: 'export',
    title: 'Export',
    iconHTML: '<i class="fas fa-file-export"></i>',
    defaultGeometry: { w: 460, h: 540 },
    minSize: { w: 360, h: 320 },
    className: 'export-window',
  });
  openHandle = handle;
  handle.onClose(() => { openHandle = null; });

  handle.body.innerHTML = `
    <div class="settings-section">
      <div class="settings-row">
        <span class="settings-label">Region</span>
        <div class="settings-control export-pillgroup" data-key="region">
          <button class="effect-pill ${initial.region === 'frame' ? 'active' : ''}" data-v="frame" ${hasFrame ? '' : 'disabled'}>Export frame</button>
          <button class="effect-pill ${initial.region === 'visible' ? 'active' : ''}" data-v="visible">Visible</button>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-label">Format</span>
        <div class="settings-control export-pillgroup" data-key="format">
          <button class="effect-pill ${initial.format === 'png' ? 'active' : ''}" data-v="png">PNG</button>
          <button class="effect-pill ${initial.format === 'jpeg' ? 'active' : ''}" data-v="jpeg">JPEG</button>
        </div>
      </div>

      <div class="settings-row export-quality" ${initial.format === 'jpeg' ? '' : 'hidden'}>
        <label class="settings-label" for="exportQuality">Quality <code class="settings-readout" id="exportQualityReadout">${initial.quality}</code></label>
        <div class="settings-control">
          <input type="range" id="exportQuality" min="1" max="100" step="1" value="${initial.quality}" />
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-label">Scale</span>
        <div class="settings-control export-pillgroup" data-key="scale">
          <button class="effect-pill ${initial.scale === 1 ? 'active' : ''}" data-v="1">1×</button>
          <button class="effect-pill ${initial.scale === 2 ? 'active' : ''}" data-v="2">2×</button>
          <button class="effect-pill ${initial.scale === 4 ? 'active' : ''}" data-v="4">4×</button>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-label">Background</span>
        <div class="settings-control export-bg-row">
          <div class="export-pillgroup" data-key="background">
            <button class="effect-pill ${initial.background === 'transparent' ? 'active' : ''}" data-v="transparent">Transparent</button>
            <button class="effect-pill ${initial.background === '#ffffff' ? 'active' : ''}" data-v="#ffffff">White</button>
            <button class="effect-pill ${initial.background === '#000000' ? 'active' : ''}" data-v="#000000">Black</button>
            <button class="effect-pill ${initial.background === 'custom' ? 'active' : ''}" data-v="custom">Custom</button>
          </div>
          <input type="color" id="exportCustomBg" value="${initial.customBg}" ${initial.background === 'custom' ? '' : 'hidden'} />
        </div>
      </div>

      <div class="settings-row">
        <label class="settings-label" for="exportFilename">Filename</label>
        <div class="settings-control">
          <input type="text" id="exportFilename" class="effect-num" style="width: 100%; padding: 5px 8px;" value="${initial.filename}" />
        </div>
      </div>
    </div>

    <div class="settings-section export-actions">
      <button class="settings-clear" data-act="close">Cancel</button>
      <button class="export-go" id="exportGo">Export</button>
    </div>
  `;

  const state = { ...initial };

  function pillBind(groupKey, transform = (v) => v) {
    const grp = handle.body.querySelector(`.export-pillgroup[data-key="${groupKey}"]`);
    if (!grp) return;
    grp.querySelectorAll('.effect-pill').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const v = transform(b.dataset.v);
        state[groupKey] = v;
        grp.querySelectorAll('.effect-pill').forEach((x) => x.classList.toggle('active', x === b));
        if (groupKey === 'format') {
          handle.body.querySelector('.export-quality').toggleAttribute('hidden', v !== 'jpeg');
        }
        if (groupKey === 'background') {
          handle.body.querySelector('#exportCustomBg').toggleAttribute('hidden', v !== 'custom');
        }
      });
    });
  }
  pillBind('region');
  pillBind('format');
  pillBind('scale', (v) => parseInt(v, 10));
  pillBind('background');

  const qSlider = handle.body.querySelector('#exportQuality');
  const qReadout = handle.body.querySelector('#exportQualityReadout');
  qSlider.addEventListener('input', (e) => {
    state.quality = parseInt(e.target.value, 10);
    qReadout.textContent = state.quality;
  });
  handle.body.querySelector('#exportCustomBg').addEventListener('input', (e) => { state.customBg = e.target.value; });
  handle.body.querySelector('#exportFilename').addEventListener('input', (e) => { state.filename = e.target.value; });

  handle.body.querySelector('#exportGo').addEventListener('click', () => {
    const bg = state.background === 'transparent' ? null
      : state.background === 'custom' ? state.customBg
      : state.background;
    saveLast({
      region: state.region, format: state.format, quality: state.quality,
      scale: state.scale, background: state.background, customBg: state.customBg,
    });
    exportImage({
      renderer,
      document: doc,
      region: state.region,
      format: state.format,
      quality: (state.quality ?? 92) / 100,
      scale: state.scale,
      background: bg,
      filename: state.filename,
    });
    handle.close();
  });
}
