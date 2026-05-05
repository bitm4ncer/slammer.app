// Text-tool — typography panel that appears in the Effects column when a text layer is active.
// Phase 12: pluggable font sources (System / Google / Fontshare / Uploaded),
// pro picker popup, variable-axis sliders, OpenType features.

import { sliderRow } from '../plugins/shared/ui-helpers.js';
import { findFont } from './typography/font-sources.js';
import { loadFont, cssFamily } from './typography/font-loader.js';
import { openFontPicker } from './typography/font-picker.js';
import { renderVariableAxes } from './typography/variable-axis-controls.js';
import { renderFeaturesSection } from './typography/opentype-features.js';

// Re-export so existing call sites that imported preloadFontsForDoc / ensureGoogleFont
// from this module keep working. (Both are now owned by font-loader.js.)
export { preloadFontsForDoc } from './typography/font-loader.js';
export { loadFont as ensureGoogleFont } from './typography/font-loader.js';

const FEATURES_EXPANDED_KEY = 'slammer:typo:featuresExpanded';

export function initTextTool({ document: doc }) {
  const panel = document.createElement('div');
  panel.className = 'text-tool-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <h3><i class="fas fa-font"></i> Typo</h3>
    <textarea class="text-tool-textarea" data-key="value" rows="2"></textarea>

    <div class="effect-slider-row typo-font-row">
      <span class="effect-label">Font</span>
      <button type="button" class="typo-font-btn" data-act="open-picker">
        <span class="typo-font-name">Inter</span>
        <span class="typo-font-meta"></span>
        <i class="fas fa-chevron-down"></i>
      </button>
    </div>

    <div data-host="size"></div>
    <div data-host="weight-or-axes"></div>
    <div data-host="letterSpacing"></div>
    <div data-host="lineHeight"></div>
    <div class="effect-slider-row typo-style-row">
      <span class="effect-label">Style</span>
      <div class="typo-style-pills" data-host="style"></div>
    </div>
    <div class="effect-slider-row typo-boxmode-row">
      <span class="effect-label" title="When ON, text wraps to fit the box width (multi-line). When OFF, text flows on a single line per paragraph.">Box</span>
      <label class="effect-toggle-row settings-toggle-bare typo-boxmode-toggle">
        <input type="checkbox" data-key="boxMode" />
        <span class="effect-toggle-switch"><span class="effect-toggle-thumb"></span></span>
      </label>
    </div>
    <div data-host="boxWidth"></div>

    <div class="effect-slider-row">
      <span class="effect-label">Color</span>
      <input type="color" data-key="color" style="grid-column: 2 / span 2; height: 24px; padding: 0; border: 1px solid var(--vhs-shadow); border-radius: 3px;" />
    </div>
    <div class="effect-slider-row typo-align-row">
      <span class="effect-label">Align</span>
      <div class="typo-align-pills" data-host="align"></div>
    </div>
    <div class="effect-slider-row typo-transform-row">
      <span class="effect-label">Case</span>
      <div class="typo-transform-pills" data-host="transform"></div>
    </div>

    <div data-host="features"></div>
  `;
  // Mount inside the contextual (bottom) section, just above the Effects group.
  const effectsGroup = document.querySelector('.effects-group');
  const host = effectsGroup?.parentNode || document.querySelector('.side-panel-bottom') || document.querySelector('.side-panel');
  if (effectsGroup && effectsGroup.parentNode === host) host.insertBefore(panel, effectsGroup);
  else host.appendChild(panel);

  const textarea = panel.querySelector('textarea[data-key=value]');
  const fontBtn = panel.querySelector('[data-act=open-picker]');
  const fontNameEl = panel.querySelector('.typo-font-name');
  const fontMetaEl = panel.querySelector('.typo-font-meta');
  const colorInp = panel.querySelector('input[data-key=color]');
  const boxModeInp = panel.querySelector('input[data-key=boxMode]');
  const styleHost = panel.querySelector('[data-host=style]');
  const alignHost = panel.querySelector('[data-host=align]');
  const transformHost = panel.querySelector('[data-host=transform]');

  // Text transform pills — aA / AA / aa / Aa (none / UPPER / lower / Title)
  const TRANSFORM_OPTIONS = [
    { value: 'none',       label: 'aA', title: 'No transform' },
    { value: 'uppercase',  label: 'AA', title: 'UPPERCASE every character' },
    { value: 'lowercase',  label: 'aa', title: 'lowercase every character' },
    { value: 'capitalize', label: 'Aa', title: 'Capitalize First Letter Of Each Word' },
  ];
  for (const opt of TRANSFORM_OPTIONS) {
    const b = window.document.createElement('button');
    b.type = 'button';
    b.className = 'typo-feat-pill';
    b.dataset.value = opt.value;
    b.title = opt.title;
    b.textContent = opt.label;
    b.addEventListener('click', () => {
      const layer = doc.activeLayer;
      if (!layer || layer.type !== 'text') return;
      const cur = layer.text.transform || 'none';
      const next = (cur === opt.value && opt.value !== 'none') ? 'none' : opt.value;
      doc.setTextProp(layer.id, 'transform', next);
    });
    transformHost.appendChild(b);
  }

  // Style toggles — Bold / Italic / Underline / Strike. Built once; their
  // .active class is updated on every rebuild() so the visual reflects the
  // layer's current state.
  const STYLE_OPTIONS = [
    { key: 'bold',      label: 'B', title: 'Bold (forces weight 700)',         style: 'font-weight: 700;' },
    { key: 'italic',    label: 'I', title: 'Italic',                            style: 'font-style: italic;' },
    { key: 'underline', label: 'U', title: 'Underline',                         style: 'text-decoration: underline;' },
    { key: 'strike',    label: 'S', title: 'Strike-through',                    style: 'text-decoration: line-through;' },
  ];
  for (const opt of STYLE_OPTIONS) {
    const b = window.document.createElement('button');
    b.type = 'button';
    b.className = 'typo-style-btn';
    b.dataset.key = opt.key;
    b.title = opt.title;
    b.setAttribute('style', opt.style);
    b.textContent = opt.label;
    b.addEventListener('click', async () => {
      const layer = doc.activeLayer;
      if (!layer || layer.type !== 'text') return;
      const next = !layer.text[opt.key];
      // For italic: kick off a font-load probe at the right style so the
      // browser fetches the REAL italic cut from Google/Fontshare instead
      // of synthesising a skewed roman on the first paint.
      if (opt.key === 'italic' && next) {
        const meta = findFont(layer.text.font, layer.text.provider);
        if (meta) {
          await loadFont(meta); // refreshes the @font-face URL with ital styles
          const fam = cssFamily(meta) || layer.text.font;
          try { await document.fonts.load(`italic ${layer.text.weight || 400} ${layer.text.size || 96}px "${fam}"`); } catch {}
        }
      }
      doc.setTextProp(layer.id, opt.key, next);
      b.classList.toggle('active', next);
    });
    styleHost.appendChild(b);
  }
  const sizeHost = panel.querySelector('[data-host=size]');
  const weightOrAxesHost = panel.querySelector('[data-host=weight-or-axes]');
  const lsHost = panel.querySelector('[data-host=letterSpacing]');
  const lhHost = panel.querySelector('[data-host=lineHeight]');
  const boxHost = panel.querySelector('[data-host=boxWidth]');
  const featuresHost = panel.querySelector('[data-host=features]');

  // Build the 4 align icon buttons once (their active state updates on rebuild).
  const ALIGN_OPTIONS = [
    { value: 'left',    title: 'Align left',    svg: alignSvg('left') },
    { value: 'center',  title: 'Align center',  svg: alignSvg('center') },
    { value: 'right',   title: 'Align right',   svg: alignSvg('right') },
    { value: 'justify', title: 'Justify',       svg: alignSvg('justify') },
  ];
  for (const opt of ALIGN_OPTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'typo-align-btn';
    b.dataset.value = opt.value;
    b.title = opt.title;
    b.innerHTML = opt.svg;
    b.addEventListener('click', () => {
      const layer = doc.activeLayer;
      if (!layer || layer.type !== 'text') return;
      doc.setTextProp(layer.id, 'align', opt.value);
      for (const sib of alignHost.querySelectorAll('.typo-align-btn')) {
        sib.classList.toggle('active', sib === b);
      }
    });
    alignHost.appendChild(b);
  }

  let featuresExpanded = (() => {
    try { return localStorage.getItem(FEATURES_EXPANDED_KEY) === '1'; } catch { return false; }
  })();

  function rebuild(layer) {
    const t = layer.text;
    const mode = t.mode || 'text';
    const meta = findFont(t.font, t.provider);

    textarea.value = t.value;
    fontNameEl.textContent = meta?.display || t.font || 'Pick a font';
    fontMetaEl.textContent = meta ? `${meta.source}${meta.variable ? ' · VF' : ''}` : '';
    colorInp.value = t.color || '#FFFFFF';
    boxModeInp.checked = mode === 'textBox';
    for (const b of styleHost.querySelectorAll('.typo-style-btn')) {
      b.classList.toggle('active', !!t[b.dataset.key]);
    }
    const curAlign = t.align || 'left';
    for (const b of alignHost.querySelectorAll('.typo-align-btn')) {
      b.classList.toggle('active', b.dataset.value === curAlign);
    }
    const curTrans = t.transform || 'none';
    for (const b of transformHost.querySelectorAll('.typo-feat-pill')) {
      b.classList.toggle('active', b.dataset.value === curTrans);
    }

    sizeHost.innerHTML = '';
    sizeHost.appendChild(sliderRow({
      label: 'Size', min: 8, max: 600, step: 1, value: t.size, defaultValue: 96,
      onChange: (v) => doc.setTextProp(layer.id, 'size', v),
    }));

    // Weight slider OR the variable wght axis (primary) — only ONE knob in
    // the main panel. Other variable axes (opsz, wdth, slnt, …) live in the
    // Advanced Typography section so the common case stays uncluttered.
    weightOrAxesHost.innerHTML = '';
    const wghtAxis = meta?.axes?.find((a) => a.tag === 'wght');
    if (meta?.variable && wghtAxis) {
      renderVariableAxes(weightOrAxesHost, {
        meta,
        value: t.variation || {},
        only: 'primary',
        onChange: (axisTag, value) => doc.setTextVariation(layer.id, axisTag, value),
      });
    } else {
      weightOrAxesHost.appendChild(sliderRow({
        label: 'Weight', min: 100, max: 900, step: 100, value: t.weight, defaultValue: 400,
        onChange: (v) => doc.setTextProp(layer.id, 'weight', v),
      }));
    }

    lsHost.innerHTML = ''; lsHost.appendChild(sliderRow({
      label: 'Spacing', min: -200, max: 200, step: 0.5, value: t.letterSpacing, defaultValue: 0,
      onChange: (v) => doc.setTextProp(layer.id, 'letterSpacing', v),
    }));
    lhHost.innerHTML = ''; lhHost.appendChild(sliderRow({
      label: 'Line Height', min: 0.2, max: 3, step: 0.05, value: t.lineHeight, defaultValue: 1.2,
      onChange: (v) => doc.setTextProp(layer.id, 'lineHeight', v),
    }));
    if (boxHost) {
      boxHost.innerHTML = '';
      if (mode === 'textBox') {
        boxHost.appendChild(sliderRow({
          label: 'Box Width', min: 80, max: 4000, step: 1, value: t.boxWidth ?? 600, defaultValue: 600,
          onChange: (v) => doc.setTextProp(layer.id, 'boxWidth', v),
        }));
      }
    }

    // Advanced typography (collapsible) — also hosts the secondary variable
    // axes (opsz, wdth, slnt, …) so the main panel only shows the primary
    // Weight knob.
    renderFeaturesSection(featuresHost, {
      meta,
      features: t.features || {},
      transform: t.transform || 'none',
      variation: t.variation || {},
      expanded: featuresExpanded,
      onExpandChange: (next) => {
        featuresExpanded = next;
        try { localStorage.setItem(FEATURES_EXPANDED_KEY, next ? '1' : '0'); } catch {}
        rebuild(layer);
      },
      onToggle: (tag, on) => doc.setTextFeature(layer.id, tag, on),
      onTransform: (val) => doc.setTextProp(layer.id, 'transform', val),
      onVariationChange: (tag, v) => doc.setTextVariation(layer.id, tag, v),
    });
  }

  textarea.addEventListener('input', () => {
    const layer = doc.activeLayer;
    if (layer && layer.type === 'text') doc.setTextProp(layer.id, 'value', textarea.value);
  });
  colorInp.addEventListener('input', () => {
    const layer = doc.activeLayer;
    if (layer && layer.type === 'text') doc.setTextProp(layer.id, 'color', colorInp.value);
  });
  boxModeInp.addEventListener('change', () => {
    const layer = doc.activeLayer;
    if (!layer || layer.type !== 'text') return;
    const next = boxModeInp.checked ? 'textBox' : 'text';
    // When switching INTO textBox mode, seed boxWidth from the current
    // rendered width so wrapping starts from where the user already sees.
    if (next === 'textBox' && (!layer.text.boxWidth || layer.text.boxWidth < 40)) {
      const w = layer.naturalSize?.w || 600;
      doc.setTextProp(layer.id, 'boxWidth', Math.round(w));
    }
    doc.setTextProp(layer.id, 'mode', next);
  });

  // Open the picker.
  fontBtn.addEventListener('click', () => {
    const layer = doc.activeLayer;
    if (!layer || layer.type !== 'text') return;
    openFontPicker({
      current: { family: layer.text.font, provider: layer.text.provider || 'system' },
      anchor: fontBtn,
      onPick: async ({ family, provider }) => {
        const meta = findFont(family, provider);
        await loadFont(meta);
        // Store the CATALOG family (not cssFamily) so findFont() can resolve
        // the meta + axes again on rebuild. The renderer uses cssFamily for
        // the actual canvas font string via findFont → cssFamily(meta).
        doc.setTextProp(layer.id, 'font', family);
        doc.setTextProp(layer.id, 'provider', provider);
        if (meta?.variable && meta.axes?.find((a) => a.tag === 'wght')) {
          // Seed variation.wght from the current static weight if the new
          // axis covers it; otherwise drop into the axis default.
          const wghtAxis = meta.axes.find((a) => a.tag === 'wght');
          const cur = layer.text.weight || 400;
          const seed = (cur >= wghtAxis.min && cur <= wghtAxis.max) ? cur : wghtAxis.default;
          doc.setTextVariation(layer.id, 'wght', seed);
        }
        // Force a font-load probe at the layer's exact size so the canvas
        // rasteriser has the metrics right.
        const fam = cssFamily(meta) || family;
        try { await document.fonts.load(`${layer.text.weight || 400} ${layer.text.size || 96}px "${fam}"`); } catch {}
        // Touch the value to force a re-render of the canvas + this panel.
        rebuild(doc.activeLayer);
      },
    });
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
    // Re-render the panel when font / variation / features change so the
    // sliders + variable-axis section reflect the new state.
    if (e.type === 'layer:textChanged') {
      const layer = doc.activeLayer;
      if (layer && layer.id === e.id && (e.prop === 'font' || e.prop === 'provider' || e.prop === 'variation' || e.prop === 'features' || e.prop === 'transform' || e.prop === 'align' || e.prop === 'mode' || e.prop === 'boxWidth' || e.prop === 'bold' || e.prop === 'italic' || e.prop === 'underline' || e.prop === 'strike')) {
        rebuild(layer);
      }
    }
    // Live box-width readout updates while user is dragging a transformer
    // handle with Ctrl+Shift held — fast path that doesn't tear down knobs.
    if (e.type === 'layer:textBoxLive') {
      const layer = doc.activeLayer;
      if (layer && layer.id === e.id) {
        const input = boxHost.querySelector('input.effect-num');
        if (input) input.value = String(Math.round(e.value));
      }
    }
  });

  syncVisibility();
  return { focus: (layer) => doc.setActiveLayer(layer.id) };
}

// Inline SVG icons for the align buttons — same visual language as the
// alignment-strip in the footer (3 horizontal bars indicating alignment).
function alignSvg(kind) {
  const bar = (x, w) => `<rect x="${x}" y="0" width="${w}" height="1.6" rx="0.6" fill="currentColor"/>`;
  const lines = (() => {
    if (kind === 'left')    return [bar(1, 14), bar(1, 9),  bar(1, 12), bar(1, 7)];
    if (kind === 'right')   return [bar(1, 14), bar(6, 9),  bar(3, 12), bar(8, 7)];
    if (kind === 'center')  return [bar(1, 14), bar(3.5, 9),  bar(2, 12), bar(4.5, 7)];
    if (kind === 'justify') return [bar(1, 14), bar(1, 14), bar(1, 14), bar(1, 14)];
    return [];
  })();
  // 4 rows spaced 3px apart, total height 13.5
  const grouped = lines.map((rect, i) => rect.replace('y="0"', `y="${i * 3}"`)).join('');
  return `<svg viewBox="0 0 16 12" width="14" height="11" xmlns="http://www.w3.org/2000/svg">${grouped}</svg>`;
}
