// Text-tool — typography panel that appears in the Effects column when a text layer is active.

import { sliderRow } from '../plugins/shared/ui-helpers.js';

const FONT_OPTIONS = [
  { value: 'Chicago', label: 'Chicago' },
  { value: 'GlyphWorld-Mountain', label: 'GlyphWorld' },
  { value: 'GothicPixels', label: 'Gothic Pixels' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Rajdhani', label: 'Rajdhani (Google)' },
  { value: 'Orbitron', label: 'Orbitron (Google)' },
  { value: 'Space Mono', label: 'Space Mono (Google)' },
];

const loadedGoogleFonts = new Set();
function ensureGoogleFont(family) {
  if (!family) return;
  if (loadedGoogleFonts.has(family)) return;
  if (['Chicago', 'GlyphWorld-Mountain', 'GothicPixels', 'Inter'].includes(family)) {
    loadedGoogleFonts.add(family);
    return;
  }
  loadedGoogleFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

export function initTextTool({ document: doc }) {
  const panel = document.createElement('div');
  panel.className = 'text-tool-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <h3><i class="fas fa-font"></i> Typography</h3>
    <textarea class="text-tool-textarea" data-key="value" rows="2"></textarea>
    <label class="effect-slider-row">
      <span class="effect-label">Font</span>
      <select class="effect-select" data-key="font" style="grid-column: 2 / span 2">
        ${FONT_OPTIONS.map((f) => `<option value="${f.value}">${f.label}</option>`).join('')}
      </select>
    </label>
    <div data-host="size"></div>
    <div data-host="weight"></div>
    <label class="effect-slider-row">
      <span class="effect-label">Color</span>
      <input type="color" data-key="color" style="grid-column: 2 / span 2; height: 24px; padding: 0; border: 1px solid var(--vhs-shadow); border-radius: 3px;" />
    </label>
    <label class="effect-slider-row">
      <span class="effect-label">Align</span>
      <select class="effect-select" data-key="align" style="grid-column: 2 / span 2">
        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
      </select>
    </label>
    <div data-host="letterSpacing"></div>
    <div data-host="lineHeight"></div>
  `;
  // Mount inside the contextual (bottom) section, just above the Effects group.
  const effectsGroup = document.querySelector('.effects-group');
  const host = effectsGroup?.parentNode || document.querySelector('.side-panel-bottom') || document.querySelector('.side-panel');
  if (effectsGroup && effectsGroup.parentNode === host) host.insertBefore(panel, effectsGroup);
  else host.appendChild(panel);

  const textarea = panel.querySelector('textarea[data-key=value]');
  const fontSel = panel.querySelector('select[data-key=font]');
  const colorInp = panel.querySelector('input[data-key=color]');
  const alignSel = panel.querySelector('select[data-key=align]');
  const sizeHost = panel.querySelector('[data-host=size]');
  const weightHost = panel.querySelector('[data-host=weight]');
  const lsHost = panel.querySelector('[data-host=letterSpacing]');
  const lhHost = panel.querySelector('[data-host=lineHeight]');

  function rebuild(layer) {
    const t = layer.text;
    textarea.value = t.value;
    fontSel.value = t.font;
    colorInp.value = t.color || '#FFFFFF';
    alignSel.value = t.align || 'left';
    sizeHost.innerHTML = ''; sizeHost.appendChild(sliderRow({
      label: 'Size', min: 8, max: 600, step: 1, value: t.size,
      onChange: (v) => doc.setTextProp(layer.id, 'size', v),
    }));
    weightHost.innerHTML = ''; weightHost.appendChild(sliderRow({
      label: 'Weight', min: 100, max: 900, step: 100, value: t.weight,
      onChange: (v) => doc.setTextProp(layer.id, 'weight', v),
    }));
    lsHost.innerHTML = ''; lsHost.appendChild(sliderRow({
      label: 'Tracking', min: -10, max: 60, step: 0.5, value: t.letterSpacing,
      onChange: (v) => doc.setTextProp(layer.id, 'letterSpacing', v),
    }));
    lhHost.innerHTML = ''; lhHost.appendChild(sliderRow({
      label: 'Line Ht', min: 0.6, max: 3, step: 0.05, value: t.lineHeight,
      onChange: (v) => doc.setTextProp(layer.id, 'lineHeight', v),
    }));
  }

  textarea.addEventListener('input', () => {
    const layer = doc.activeLayer;
    if (layer && layer.type === 'text') doc.setTextProp(layer.id, 'value', textarea.value);
  });
  fontSel.addEventListener('change', () => {
    const layer = doc.activeLayer;
    if (!layer || layer.type !== 'text') return;
    ensureGoogleFont(fontSel.value);
    // Wait briefly for font to apply before reraster.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => doc.setTextProp(layer.id, 'font', fontSel.value));
    } else {
      doc.setTextProp(layer.id, 'font', fontSel.value);
    }
  });
  colorInp.addEventListener('input', () => {
    const layer = doc.activeLayer;
    if (layer && layer.type === 'text') doc.setTextProp(layer.id, 'color', colorInp.value);
  });
  alignSel.addEventListener('change', () => {
    const layer = doc.activeLayer;
    if (layer && layer.type === 'text') doc.setTextProp(layer.id, 'align', alignSel.value);
  });

  function syncVisibility() {
    const layer = doc.activeLayer;
    if (layer && layer.type === 'text') {
      panel.style.display = '';
      rebuild(layer);
    } else {
      panel.style.display = 'none';
    }
  }

  doc.subscribe((e) => {
    if (e.type === 'layer:active' || e.type === 'layer:added' || e.type === 'doc:loaded' || e.type === 'layer:removed') {
      syncVisibility();
    }
    if (e.type === 'layer:textChanged') {
      const layer = doc.activeLayer;
      if (layer && layer.id === e.id) {
        // Avoid full rebuild on every keystroke — only update inputs that differ.
      }
    }
  });

  syncVisibility();
  return { focus: (layer) => doc.setActiveLayer(layer.id) };
}
