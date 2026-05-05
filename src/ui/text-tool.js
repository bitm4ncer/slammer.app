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
const LOCAL_FONTS = new Set(['Chicago', 'GlyphWorld-Mountain', 'GothicPixels', 'Inter']);
export function ensureGoogleFont(family) {
  if (!family) return;
  if (loadedGoogleFonts.has(family)) return;
  if (LOCAL_FONTS.has(family)) {
    loadedGoogleFonts.add(family);
    return;
  }
  loadedGoogleFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

// Walk a doc snapshot, inject any missing Google-font <link> tags, then await
// the browser's font-loading machinery so canvas rasterising picks them up.
export async function preloadFontsForDoc(doc) {
  const fonts = new Set();
  for (const layer of doc.layers || []) {
    if (layer?.type === 'text' && layer.text?.font) fonts.add(layer.text.font);
  }
  for (const f of fonts) ensureGoogleFont(f);
  if (document.fonts?.ready) await document.fonts.ready;
  // Belt-and-braces: also explicitly load the size/weight combos we use for text rasterising.
  if (document.fonts?.load) {
    const probes = [];
    for (const layer of doc.layers || []) {
      if (layer?.type === 'text' && layer.text) {
        const t = layer.text;
        probes.push(document.fonts.load(`${t.weight || 400} ${t.size || 96}px "${t.font}"`));
      }
    }
    if (probes.length) await Promise.allSettled(probes);
  }
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
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
        <option value="justify">Justified</option>
      </select>
    </label>
    <div data-host="letterSpacing"></div>
    <div data-host="lineHeight"></div>
    <div data-host="boxWidth"></div>
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
  const boxHost = panel.querySelector('[data-host=boxWidth]');

  function rebuild(layer) {
    const t = layer.text;
    const mode = t.mode || 'text';
    textarea.value = t.value;
    fontSel.value = t.font;
    colorInp.value = t.color || '#FFFFFF';
    alignSel.value = t.align || 'left';
    sizeHost.innerHTML = ''; sizeHost.appendChild(sliderRow({
      label: 'Size', min: 8, max: 600, step: 1, value: t.size, defaultValue: 96,
      onChange: (v) => doc.setTextProp(layer.id, 'size', v),
    }));
    weightHost.innerHTML = ''; weightHost.appendChild(sliderRow({
      label: 'Weight', min: 100, max: 900, step: 100, value: t.weight, defaultValue: 400,
      onChange: (v) => doc.setTextProp(layer.id, 'weight', v),
    }));
    lsHost.innerHTML = ''; lsHost.appendChild(sliderRow({
      label: 'Tracking', min: -200, max: 200, step: 0.5, value: t.letterSpacing, defaultValue: 0,
      onChange: (v) => doc.setTextProp(layer.id, 'letterSpacing', v),
    }));
    lhHost.innerHTML = ''; lhHost.appendChild(sliderRow({
      label: 'Line Ht', min: 0.2, max: 3, step: 0.05, value: t.lineHeight, defaultValue: 1.2,
      onChange: (v) => doc.setTextProp(layer.id, 'lineHeight', v),
    }));
    // Box-width slider appears only in Text Box mode.
    if (boxHost) {
      boxHost.innerHTML = '';
      if (mode === 'textBox') {
        boxHost.appendChild(sliderRow({
          label: 'Box Width', min: 80, max: 4000, step: 1, value: t.boxWidth ?? 600, defaultValue: 600,
          onChange: (v) => doc.setTextProp(layer.id, 'boxWidth', v),
        }));
      }
    }
  }

  textarea.addEventListener('input', () => {
    const layer = doc.activeLayer;
    if (layer && layer.type === 'text') doc.setTextProp(layer.id, 'value', textarea.value);
  });
  fontSel.addEventListener('change', async () => {
    const layer = doc.activeLayer;
    if (!layer || layer.type !== 'text') return;
    const family = fontSel.value;
    ensureGoogleFont(family);
    // Explicitly load this size/weight combo. document.fonts.ready alone resolves
    // before a freshly-injected <link> has even started fetching, so the rasteriser
    // would otherwise miss it on the first paint.
    if (document.fonts?.load) {
      const t = layer.text;
      try { await document.fonts.load(`${t.weight || 400} ${t.size || 96}px "${family}"`); } catch {}
    }
    doc.setTextProp(layer.id, 'font', family);
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
