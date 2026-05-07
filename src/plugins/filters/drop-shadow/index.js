// Drop Shadow / Inner Shadow filter — alpha-aware, separable box-blur Gaussian.
// Supports polar (angle + distance) and cartesian (x + y) offset modes.
// Spread dilates the shadow alpha before blur via a separable max-filter pass.

import { sliderRow, pillGroup, colorRow, toggleRow, selectRow, makeRoot } from '../../shared/ui-helpers.js';
import { createAngleDistanceWidget } from '../../shared/angle-distance-widget.js';

export default {
  id: 'drop-shadow',
  name: 'Drop Shadow',
  version: '1.0.0',
  type: 'filter',
  icon: 'square-caret-down',
  category: 'stylize',

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

  process(imageData, params) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    // --- resolve offset ---
    const mode = params.mode || 'polar';
    let ox, oy;
    if (mode === 'cartesian') {
      ox = clamp(params.offsetX ?? 0, -500, 500);
      oy = clamp(params.offsetY ?? 0, -500, 500);
    } else {
      const angle = (params.angle ?? 135) * Math.PI / 180;
      const dist  = clamp(params.distance ?? 12, 0, 500);
      ox = Math.round(Math.cos(angle) * dist);
      oy = Math.round(Math.sin(angle) * dist);
    }

    const blur    = clamp(Math.floor(params.blur    ?? 8),  0, 200);
    const spread  = clamp(Math.floor(params.spread  ?? 0),  0, 100);
    const opacity = clamp(params.opacity ?? 60, 0, 100) / 100;
    const inner   = !!params.inner;
    const knockout = !!params.knockout;
    const blendMode = params.blendMode || 'multiply';

    const [sR, sG, sB] = hexToRgb(params.color || '#000000');

    // 1. Extract alpha channel of source into a Float32 buffer.
    const alphaSrc = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      alphaSrc[i] = src[i * 4 + 3] / 255;
    }

    // 2. Spread: dilate alpha by 'spread' using a separable max-filter.
    let shadowAlpha = alphaSrc;
    if (spread > 0) {
      shadowAlpha = dilateAlpha(alphaSrc, W, H, spread);
    }

    // 3. Shift the alpha map by (ox, oy).
    //    Inner shadow inverts direction (shadow source inside shape, shifted opposite).
    const shiftX = inner ? -ox : ox;
    const shiftY = inner ? -oy : oy;
    shadowAlpha = shiftAlpha(shadowAlpha, W, H, shiftX, shiftY);

    // 4. Blur (3-pass box blur for Gaussian approximation).
    if (blur > 0) {
      shadowAlpha = boxBlurAlpha(shadowAlpha, W, H, blur);
    }

    // 5. For inner shadow: multiply shadow alpha by source alpha, then subtract
    //    layer alpha to leave only the rim/interior rim region.
    if (inner) {
      for (let i = 0; i < W * H; i++) {
        // rim = shadow * srcAlpha — ensures shadow stays inside shape
        shadowAlpha[i] = shadowAlpha[i] * alphaSrc[i];
      }
    }

    // 6. Apply opacity.
    for (let i = 0; i < W * H; i++) {
      shadowAlpha[i] *= opacity;
    }

    // 7. Composite. We'll use an offscreen canvas for blend-mode support.
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const octx = out.getContext('2d');

    // 7a. Draw the tinted shadow layer onto the offscreen canvas.
    const shadowData = octx.createImageData(W, H);
    const sd = shadowData.data;
    for (let i = 0; i < W * H; i++) {
      const a = Math.round(clamp(shadowAlpha[i], 0, 1) * 255);
      sd[i * 4]     = sR;
      sd[i * 4 + 1] = sG;
      sd[i * 4 + 2] = sB;
      sd[i * 4 + 3] = a;
    }

    if (inner) {
      // Inner: draw source first, then shadow on top with source-over.
      octx.putImageData(imageData, 0, 0);

      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = W; shadowCanvas.height = H;
      shadowCanvas.getContext('2d').putImageData(shadowData, 0, 0);

      octx.globalCompositeOperation = 'source-over';
      octx.drawImage(shadowCanvas, 0, 0);
    } else {
      // Drop: shadow behind the layer.
      // Draw shadow, then composite the source on top using source-over.
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = W; shadowCanvas.height = H;
      const sctx = shadowCanvas.getContext('2d');
      sctx.putImageData(shadowData, 0, 0);

      // Layer onto octx: shadow first (using chosen blend mode vs transparent bg
      // means multiply/screen etc. only matter when compositing against src pixels).
      // Standard approach: render shadow, then source on top.
      // For non-normal blendModes: use the mode when drawing the shadow over the source.

      // Draw source layer as base.
      octx.putImageData(imageData, 0, 0);

      // Draw shadow behind: use destination-over to draw under existing content.
      // But destination-over ignores blend modes. Instead:
      // Draw shadow on a temp canvas with the blend mode vs the source.
      const compCanvas = document.createElement('canvas');
      compCanvas.width = W; compCanvas.height = H;
      const cctx = compCanvas.getContext('2d');

      // Base: shadow
      cctx.putImageData(shadowData, 0, 0);

      // Layer source on top of shadow (source-over always for layer itself)
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = W; srcCanvas.height = H;
      srcCanvas.getContext('2d').putImageData(imageData, 0, 0);

      // Apply the blend mode to shadow vs source pixels via multiply etc.
      if (blendMode !== 'normal') {
        // Re-composite: source → then blend shadow on source
        // We want shadow BEHIND source but with blend. Technique:
        // 1) draw source, 2) draw shadow with blend (only affects where both overlap,
        //    which is already correct for multiply-darkening the src where shadow is).
        const blCanvas = document.createElement('canvas');
        blCanvas.width = W; blCanvas.height = H;
        const bctx = blCanvas.getContext('2d');
        bctx.putImageData(imageData, 0, 0);
        bctx.globalCompositeOperation = blendModeToComposite(blendMode);
        bctx.drawImage(shadowCanvas, 0, 0);
        // Now draw the blended shadow (where src overlaps shadow) over the raw shadow.
        cctx.drawImage(blCanvas, 0, 0);
      }

      // Paste final comp into octx
      octx.clearRect(0, 0, W, H);
      octx.putImageData(cctx.getImageData(0, 0, W, H), 0, 0);

      // Draw source on top of shadow with source-over.
      octx.globalCompositeOperation = 'source-over';
      octx.drawImage(srcCanvas, 0, 0);
    }

    // 8. Knockout: zero out pixels where source alpha > 0 → shadow only.
    const result = octx.getImageData(0, 0, W, H);
    if (knockout) {
      const rd = result.data;
      for (let i = 0; i < W * H; i++) {
        const srcA = src[i * 4 + 3];
        if (srcA > 0) {
          rd[i * 4 + 3] = 0;
          rd[i * 4]     = 0;
          rd[i * 4 + 1] = 0;
          rd[i * 4 + 2] = 0;
        }
      }
    }

    imageData.data.set(result.data);
    return imageData;
  },

  renderUI(params, onChange) {
    const root = makeRoot('drop-shadow-effect');

    // ── DIRECTION ────────────────────────────────────────────────────────
    const dirSection = section('Direction');

    dirSection.appendChild(pillGroup({
      label: 'Mode',
      options: [
        { value: 'polar',      label: 'Polar' },
        { value: 'cartesian',  label: 'XY' },
      ],
      value: params.mode || 'polar',
      onChange: (v) => onChange({ mode: v }),
    }));

    const polarWrap = document.createElement('div');
    polarWrap.className = 'drop-shadow-mode-group';
    polarWrap.appendChild(createAngleDistanceWidget({
      angle: params.angle ?? 135,
      distance: params.distance ?? 12,
      maxDistance: 500,
      visualMax: 200,
      size: 108,
      defaultAngle: 135,
      defaultDistance: 12,
      onChange: ({ angle, distance }) => onChange({ angle, distance }),
    }));
    dirSection.appendChild(polarWrap);

    const cartWrap = document.createElement('div');
    cartWrap.className = 'drop-shadow-mode-group';
    cartWrap.appendChild(sliderRow({
      label: 'Offset X', min: -500, max: 500, step: 1,
      value: params.offsetX ?? 0, defaultValue: 0, suffix: 'px',
      onChange: (v) => onChange({ offsetX: v }),
    }));
    cartWrap.appendChild(sliderRow({
      label: 'Offset Y', min: -500, max: 500, step: 1,
      value: params.offsetY ?? 0, defaultValue: 0, suffix: 'px',
      onChange: (v) => onChange({ offsetY: v }),
    }));
    dirSection.appendChild(cartWrap);

    function updateModeVisibility(mode) {
      polarWrap.style.display = mode === 'polar'     ? '' : 'none';
      cartWrap.style.display  = mode === 'cartesian' ? '' : 'none';
    }
    updateModeVisibility(params.mode || 'polar');

    const modeGroup = dirSection.querySelector('.effect-pill-group');
    if (modeGroup) {
      modeGroup.addEventListener('click', (e) => {
        const pill = e.target.closest('.effect-pill');
        if (pill) updateModeVisibility(pill.dataset.value);
      });
    }

    root.appendChild(dirSection);

    // ── APPEARANCE ───────────────────────────────────────────────────────
    const apprSection = section('Appearance');

    apprSection.appendChild(colorRow({
      label: 'Color',
      value: params.color || '#000000',
      onChange: (v) => onChange({ color: v }),
    }));

    apprSection.appendChild(sliderRow({
      label: 'Opacity', min: 0, max: 100, step: 1,
      value: params.opacity ?? 60, defaultValue: 60, suffix: '%',
      onChange: (v) => onChange({ opacity: v }),
    }));

    apprSection.appendChild(selectRow({
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

    root.appendChild(apprSection);

    // ── EDGE ─────────────────────────────────────────────────────────────
    const edgeSection = section('Edge');

    edgeSection.appendChild(sliderRow({
      label: 'Blur', min: 0, max: 200, step: 1,
      value: params.blur ?? 8, defaultValue: 8, suffix: 'px',
      onChange: (v) => onChange({ blur: v }),
    }));

    edgeSection.appendChild(sliderRow({
      label: 'Spread', min: 0, max: 100, step: 1,
      value: params.spread ?? 0, defaultValue: 0, suffix: 'px',
      onChange: (v) => onChange({ spread: v }),
    }));

    root.appendChild(edgeSection);

    // ── OPTIONS ──────────────────────────────────────────────────────────
    const optsSection = section('Options');

    optsSection.appendChild(toggleRow({
      label: 'Inner Shadow',
      value: !!params.inner,
      onChange: (v) => onChange({ inner: v }),
      align: 'lead',
    }));

    optsSection.appendChild(toggleRow({
      label: 'Knockout',
      value: !!params.knockout,
      onChange: (v) => onChange({ knockout: v }),
      align: 'lead',
    }));

    root.appendChild(optsSection);

    return root;
  },
};

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function section(title) {
  const wrap = document.createElement('div');
  wrap.className = 'effect-section';
  const head = document.createElement('div');
  head.className = 'effect-section-head';
  head.textContent = title;
  wrap.appendChild(head);
  return wrap;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/** Shift an alpha Float32Array by (dx, dy), filling empty area with 0. */
function shiftAlpha(src, W, H, dx, dy) {
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= H) continue;
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= W) continue;
      out[y * W + x] = src[sy * W + sx];
    }
  }
  return out;
}

/**
 * Separable max-filter dilation (approximates morphological dilation).
 * Two passes: horizontal then vertical, each using a sliding window of size r.
 */
function dilateAlpha(src, W, H, r) {
  const tmp = new Float32Array(W * H);
  // Horizontal pass
  for (let y = 0; y < H; y++) {
    let windowMax = 0;
    // Prime a deque-less sliding max with a simple O(W*r) approach for small r.
    // For r up to 100 and typical image sizes this is acceptable.
    for (let x = 0; x < W; x++) {
      let m = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(W - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        const v = src[y * W + xx];
        if (v > m) m = v;
      }
      tmp[y * W + x] = m;
    }
  }
  // Vertical pass
  const out = new Float32Array(W * H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let m = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(H - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * W + x];
        if (v > m) m = v;
      }
      out[y * W + x] = m;
    }
  }
  return out;
}

/**
 * 3-pass separable box blur on an alpha Float32Array.
 * Matches the blur/index.js pattern for consistency.
 */
function boxBlurAlpha(src, W, H, r) {
  let a = new Float32Array(src);
  let b = new Float32Array(W * H);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurAlphaH(a, b, W, H, r);
    boxBlurAlphaV(b, a, W, H, r);
  }
  return a;
}

function boxBlurAlphaH(src, dst, W, H, r) {
  const div = r * 2 + 1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let s = 0;
    for (let i = -r; i <= r; i++) {
      s += src[row + Math.max(0, Math.min(W - 1, i))];
    }
    for (let x = 0; x < W; x++) {
      dst[row + x] = s / div;
      const xAdd = Math.min(W - 1, x + r + 1);
      const xRem = Math.max(0, x - r);
      s += src[row + xAdd] - src[row + xRem];
    }
  }
}

function boxBlurAlphaV(src, dst, W, H, r) {
  const div = r * 2 + 1;
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) {
      s += src[Math.max(0, Math.min(H - 1, i)) * W + x];
    }
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = s / div;
      const yAdd = Math.min(H - 1, y + r + 1);
      const yRem = Math.max(0, y - r);
      s += src[yAdd * W + x] - src[yRem * W + x];
    }
  }
}

/** Map our blend mode names to CSS composite operation strings. */
function blendModeToComposite(mode) {
  switch (mode) {
    case 'multiply': return 'multiply';
    case 'screen':   return 'screen';
    case 'overlay':  return 'overlay';
    default:         return 'source-over';
  }
}
