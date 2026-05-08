// Drop Shadow / Inner Shadow filter — alpha-aware, separable box-blur Gaussian.
// Supports polar (angle + distance) and cartesian (x + y) offset modes.
// Spread dilates the shadow alpha before blur via a separable max-filter pass.
//
// The pure compute lives in ./process-impl.js so a Web Worker can run it
// off the main thread (worker: true below). The renderer's pipeline routes
// worker-eligible plugins through src/core/effect-worker.js.

import { sliderRow, sliderRowLg, pillGroup, colorRow, toggleRow, selectRow, makeRoot, section } from '../../shared/ui-helpers.js';
import { createAngleDistanceWidget } from '../../shared/angle-distance-widget.js';
import { createXYPadWidget } from '../../shared/xy-pad-widget.js';
import { createKnobLg } from '../../shared/knob.js';
import { createNumericInput } from '../../shared/numeric-input.js';
import { processDropShadow } from './process-impl.js';

export default {
  id: 'drop-shadow',
  name: 'Drop Shadow',
  version: '1.0.0',
  type: 'filter',
  icon: 'square-caret-down',
  category: 'stylize',
  // Pipeline routes this through a Web Worker (drop-shadow's compute is
  // 50-150 ms at typical settings, so off-main-thread keeps the UI free).
  worker: true,

  defaultParams() {
    return {
      mode: 'polar',      // 'polar' | 'cartesian'
      angle: 135,         // degrees
      distance: 12,       // px
      offsetX: 0,         // px (cartesian)
      offsetY: 0,         // px (cartesian)
      color: '#000000',
      opacity: 60,        // 0-100 %
      blur: 8,            // px
      spread: 0,          // px
      blendMode: 'multiply',
      inner: false,
      knockout: false,
    };
  },

  // Compute lives in ./process-impl.js so the Web Worker can call it
  // directly. When worker: true, the pipeline never invokes this path
  // — the worker runs processDropShadow on its own thread. The
  // synchronous fallback below is used if the worker can't be created
  // (older browsers without OffscreenCanvas) or when a plugin caller
  // explicitly opts out of worker routing.
  process(imageData, params) {
    return processDropShadow(imageData, params);
  },

  renderUI(params, onChange) {
    const root = makeRoot('drop-shadow-effect');

    // ── DIRECTION ────────────────────────────────────────────────────────
    const dirWrap = document.createElement('div');
    dirWrap.className = 'effect-section';
    const dirHead = section('Direction');
    dirWrap.appendChild(dirHead);

    dirWrap.appendChild(pillGroup({
      label: 'Mode',
      options: [
        { value: 'polar',      label: 'Polar' },
        { value: 'cartesian',  label: 'XY' },
      ],
      value: params.mode || 'polar',
      onChange: (v) => onChange({ mode: v }),
    }));

    // Polar: angle-distance widget + L blur knob side by side
    const polarWrap = document.createElement('div');
    polarWrap.className = 'drop-shadow-mode-group drop-shadow-polar-row';
    polarWrap.appendChild(createAngleDistanceWidget({
      angle: params.angle ?? 135,
      distance: params.distance ?? 12,
      maxDistance: 500,
      visualMax: 200,
      size: 88,
      defaultAngle: 135,
      defaultDistance: 12,
      onChange: ({ angle, distance }) => onChange({ angle, distance }),
    }));
    const blurCol = document.createElement('div');
    blurCol.className = 'drop-shadow-blur-col';
    const blurLbl = document.createElement('span');
    blurLbl.className = 'effect-label';
    blurLbl.textContent = 'Blur';
    blurCol.appendChild(blurLbl);
    const blurKnob = createKnobLg({
      min: 0, max: 200, step: 1,
      value: params.blur ?? 8,
      onChange: (v) => {
        blurNum.setValue(v);
        onChange({ blur: v });
      },
    });
    blurCol.appendChild(blurKnob);
    const blurNum = createNumericInput({
      min: 0, max: 200, step: 1,
      value: params.blur ?? 8,
      suffix: 'px',
      onChange: (v) => {
        blurKnob.setValue(v);
        onChange({ blur: v });
      },
    });
    blurCol.appendChild(blurNum);
    polarWrap.appendChild(blurCol);
    dirWrap.appendChild(polarWrap);

    // Cartesian: XY pad (maps 0-100% → -500..+500)
    const cartWrap = document.createElement('div');
    cartWrap.className = 'drop-shadow-mode-group';
    cartWrap.appendChild(createXYPadWidget({
      x: ((params.offsetX ?? 0) + 500) / 10,
      y: ((params.offsetY ?? 0) + 500) / 10,
      defaultX: 50,
      defaultY: 50,
      onChange: ({ x, y }) => {
        const ox = Math.round((x - 50) * 10);
        const oy = Math.round((y - 50) * 10);
        onChange({ offsetX: ox, offsetY: oy });
      },
    }));
    cartWrap.appendChild(sliderRowLg({
      label: 'Blur', min: 0, max: 200, step: 1,
      value: params.blur ?? 8, defaultValue: 8, suffix: 'px',
      onChange: (v) => onChange({ blur: v }),
    }));
    dirWrap.appendChild(cartWrap);

    function updateModeVisibility(mode) {
      polarWrap.style.display = mode === 'polar'     ? '' : 'none';
      cartWrap.style.display  = mode === 'cartesian' ? '' : 'none';
    }
    updateModeVisibility(params.mode || 'polar');

    const modeGroup = dirWrap.querySelector('.effect-pill-group');
    if (modeGroup) {
      modeGroup.addEventListener('click', (e) => {
        const pill = e.target.closest('.effect-pill');
        if (pill) updateModeVisibility(pill.dataset.value);
      });
    }

    root.appendChild(dirWrap);

    // ── APPEARANCE ───────────────────────────────────────────────────────
    const apprWrap = document.createElement('div');
    apprWrap.className = 'effect-section';
    apprWrap.appendChild(section('Appearance'));

    apprWrap.appendChild(colorRow({
      label: 'Color',
      value: params.color || '#000000',
      onChange: (v) => onChange({ color: v }),
    }));

    apprWrap.appendChild(sliderRow({
      label: 'Opacity', min: 0, max: 100, step: 1,
      value: params.opacity ?? 60, defaultValue: 60, suffix: '%',
      onChange: (v) => onChange({ opacity: v }),
    }));

    apprWrap.appendChild(selectRow({
      label: 'Blend',
      options: [
        { value: 'multiply', label: 'Multiply' },
        { value: 'normal',   label: 'Normal' },
        { value: 'screen',   label: 'Screen' },
        { value: 'overlay',  label: 'Overlay' },
      ],
      value: params.blendMode || 'multiply',
      onChange: (v) => onChange({ blendMode: v }),
    }));

    root.appendChild(apprWrap);

    // ── EDGE ─────────────────────────────────────────────────────────────
    const edgeWrap = document.createElement('div');
    edgeWrap.className = 'effect-section';
    edgeWrap.appendChild(section('Edge'));

    edgeWrap.appendChild(sliderRow({
      label: 'Spread', min: 0, max: 100, step: 1,
      value: params.spread ?? 0, defaultValue: 0, suffix: 'px',
      onChange: (v) => onChange({ spread: v }),
    }));

    root.appendChild(edgeWrap);

    // ── OPTIONS ──────────────────────────────────────────────────────────
    const optsWrap = document.createElement('div');
    optsWrap.className = 'effect-section';
    optsWrap.appendChild(section('Options'));

    optsWrap.appendChild(toggleRow({
      label: 'Inner Shadow',
      value: !!params.inner,
      onChange: (v) => onChange({ inner: v }),
      align: 'lead',
    }));

    optsWrap.appendChild(toggleRow({
      label: 'Knockout',
      value: !!params.knockout,
      onChange: (v) => onChange({ knockout: v }),
      align: 'lead',
    }));

    root.appendChild(optsWrap);

    return root;
  },
};

// All compute helpers (clamp, hexToRgb, shiftAlpha, dilateAlpha,
// boxBlurAlpha + H/V passes, blendModeToComposite) live in
// ./process-impl.js so the worker can import them too. See that file
// for details on the O(W·H) sliding-max dilate, the 3-pass separable
// box blur, and the OffscreenCanvas-based blend-mode compositing.
