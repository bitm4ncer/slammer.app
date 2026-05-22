// Halftone Raster — Phase 20, Raster Pack.
//
// True offset-press halftone separation with:
//   - Three colour modes: monochrome / RGB-separated / CMYK-separated
//   - Industry-standard screen angles: C=15°, M=75°, Y=0°, K=45°
//   - Six dot shapes: round / square / diamond / line / cross / euclidean
//   - Dot gain simulation, sub-pixel AA, K-plate generation (UCR)
//   - Per-channel pitch multipliers and ink-colour overrides
//   - Vignette final pass
//
// Architecture: pure CPU ImageData transforms, no off-screen canvas tricks.
// Each screen is rendered into a Float32 accumulator to allow subtractive
// (CMYK) compositing before the final quantise-to-Uint8 step.
//
// KEY ALGORITHM: ONE coverage sample per CELL (sampled at the cell centre),
// broadcast to every pixel in the cell.  This produces the regular dot-grid
// characteristic of real halftone.  Per-pixel sampling (the previous
// approach) creates noise instead of dots.

import {
  sliderRow, pillGroup, colorRow, toggleRow, selectRow, makeRoot,
} from '../../shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export default {
  id: 'halftone-raster',
  name: 'Halftone Raster',
  version: '1.1.0',
  type: 'filter',
  icon: 'bullseye',                // concentric rings — visually evokes the printed dot
  category: 'stylize',
  description: 'Stylised halftone over the layer',
  pro: true,
  pack: 'raster-pack',

  defaultParams,
  process,
  renderUI,
};

// ---------------------------------------------------------------------------
// Default parameters
// ---------------------------------------------------------------------------

function defaultParams() {
  return {
    // Global
    pitch: 8,                      // 1..80 px — base dot-grid spacing
    mode: 'cmyk-separated',        // 'monochrome' | 'rgb-separated' | 'cmyk-separated'
    bgMode: 'paper-white',         // 'paper-white' | 'transparent' | 'custom'
    bgColor: '#fefcf6',            // used when bgMode === 'custom'

    // CMYK angles (degrees)
    angleC: 15,
    angleM: 75,
    angleY: 0,
    angleK: 45,

    // Per-channel pitch multipliers
    pitchC: 1,
    pitchM: 1,
    pitchY: 1.1,   // Yellow benefits from slightly tighter screen
    pitchK: 1,

    // Per-channel ink override colours (empty string = use pure CMY/K)
    inkC: '',
    inkM: '',
    inkY: '',
    inkK: '',

    // K plate generation (UCR under-colour removal)
    kPlate: false,

    // Dot
    dotShape: 'euclidean',         // 'round' | 'square' | 'diamond' | 'line' | 'cross' | 'euclidean'
    dotGain: 0,                    // 0..30 — % of pitch added to dot radius
    antiAlias: 'soft',             // 'hard' | 'soft' | 'sub-pixel'

    // Paper
    vignette: 0,                   // 0..50
  };
}

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------

function process(imageData, params) {
  const p = { ...defaultParams(), ...params };
  const { width: W, height: H } = imageData;
  const src = imageData.data;

  // Output accumulator — RGBA floats, representing final composited colour.
  // Start with the paper colour everywhere.
  const paper = parsePaperColor(p);
  const out = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4]     = paper.r;
    out[i * 4 + 1] = paper.g;
    out[i * 4 + 2] = paper.b;
    out[i * 4 + 3] = paper.a;
  }

  if (p.mode === 'monochrome') {
    renderScreenMono(src, W, H, p, out);
  } else if (p.mode === 'rgb-separated') {
    renderScreensRGB(src, W, H, p, out);
  } else {
    // cmyk-separated (default)
    renderScreensCMYK(src, W, H, p, out);
  }

  // Vignette pass
  if (p.vignette > 0) {
    applyVignette(out, W, H, p.vignette);
  }

  // Write back to imageData
  const d = imageData.data;
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    d[o]     = clamp255(out[o]     + 0.5);
    d[o + 1] = clamp255(out[o + 1] + 0.5);
    d[o + 2] = clamp255(out[o + 2] + 0.5);
    d[o + 3] = clamp255(out[o + 3] + 0.5);
  }

  return imageData;
}

// ---------------------------------------------------------------------------
// Screen renderers
// ---------------------------------------------------------------------------

/**
 * Monochrome: convert to luminance, single screen over paper background.
 */
function renderScreenMono(src, W, H, p, out) {
  const paper = parsePaperColor(p);
  const ink = { r: 0, g: 0, b: 0, a: 255 };
  const pitch = p.pitch;
  const angle = 45; // classic mono angle

  // Build a luminance Float32Array for this screen. Halftone convention:
  // DARK source = MORE ink (large dots), BRIGHT source = LESS ink (small
  // dots, paper shows through). So the coverage map is the INVERSE of
  // luminance — `1 - luma`.
  const lumBuf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const luma = (0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2]) / 255;
    lumBuf[i] = 1 - luma;
  }

  const dotBuf = renderScreenBuffer(lumBuf, W, H, pitch, angle, p);

  for (let i = 0; i < W * H; i++) {
    const cov = dotBuf[i];
    const inv = 1 - cov;
    const o = i * 4;
    out[o]     = ink.r * cov + paper.r * inv;
    out[o + 1] = ink.g * cov + paper.g * inv;
    out[o + 2] = ink.b * cov + paper.b * inv;
    // Modulate output alpha by source alpha so pad-area pixels (source
    // alpha 0) stay transparent. Without this the pad rendered as a solid
    // paper-coloured rectangle of dots — the visible "border" the user
    // reported.
    out[o + 3] = src[o + 3];
  }
}

/**
 * RGB-separated: three independent screens at 0°, 45°, 90°.
 */
function renderScreensRGB(src, W, H, p, out) {
  const pitch = p.pitch;

  // Build per-channel buffers
  const rBuf = new Float32Array(W * H);
  const gBuf = new Float32Array(W * H);
  const bBuf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    rBuf[i] = src[o]     / 255;
    gBuf[i] = src[o + 1] / 255;
    bBuf[i] = src[o + 2] / 255;
  }

  const rDot = renderScreenBuffer(rBuf, W, H, pitch, 0,  p);
  const gDot = renderScreenBuffer(gBuf, W, H, pitch, 45, p);
  const bDot = renderScreenBuffer(bBuf, W, H, pitch, 90, p);

  // Additive blending: start from black. Output alpha tracks source alpha
  // so pad-area pixels (source alpha 0) stay transparent — pre-fix this
  // pad rendered as a solid black rectangle (zero ink × any colour = 0,
  // visible against the canvas).
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    out[o]     = rDot[i] * 255;
    out[o + 1] = gDot[i] * 255;
    out[o + 2] = bDot[i] * 255;
    out[o + 3] = src[o + 3];
  }
}

/**
 * CMYK-separated: up to four screens, subtractive compositing.
 */
function renderScreensCMYK(src, W, H, p, out) {
  const paper = parsePaperColor(p);
  const pitch = p.pitch;

  const C_acc = new Float32Array(W * H);
  const M_acc = new Float32Array(W * H);
  const Y_acc = new Float32Array(W * H);
  const K_acc = new Float32Array(W * H);

  // Convert source to CMYK
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    let r = src[o] / 255;
    let g = src[o + 1] / 255;
    let b = src[o + 2] / 255;

    let c = 1 - r;
    let m = 1 - g;
    let y = 1 - b;
    let k = 0;

    if (p.kPlate) {
      k = Math.min(c, m, y);
      if (k < 1) {
        c = (c - k) / (1 - k);
        m = (m - k) / (1 - k);
        y = (y - k) / (1 - k);
      } else {
        c = m = y = 0;
      }
    }

    C_acc[i] = c;
    M_acc[i] = m;
    Y_acc[i] = y;
    K_acc[i] = k;
  }

  const cxBuf = renderScreenBuffer(C_acc, W, H, pitch * p.pitchC, p.angleC, p);
  const mxBuf = renderScreenBuffer(M_acc, W, H, pitch * p.pitchM, p.angleM, p);
  const yxBuf = renderScreenBuffer(Y_acc, W, H, pitch * p.pitchY, p.angleY, p);
  const kxBuf = p.kPlate ? renderScreenBuffer(K_acc, W, H, pitch * p.pitchK, p.angleK, p) : null;

  const inkC = parseInkColor(p.inkC, { r: 0,   g: 255, b: 255 });
  const inkM = parseInkColor(p.inkM, { r: 255, g: 0,   b: 255 });
  const inkY = parseInkColor(p.inkY, { r: 255, g: 255, b: 0   });
  const inkK = parseInkColor(p.inkK, { r: 0,   g: 0,   b: 0   });

  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const dc = cxBuf[i];
    const dm = mxBuf[i];
    const dy = yxBuf[i];
    const dk = kxBuf ? kxBuf[i] : 0;

    let rR = paper.r / 255;
    let rG = paper.g / 255;
    let rB = paper.b / 255;

    rR = rR * (1 - dc * (1 - inkC.r / 255));
    rG = rG * (1 - dc * (1 - inkC.g / 255));
    rB = rB * (1 - dc * (1 - inkC.b / 255));

    rR = rR * (1 - dm * (1 - inkM.r / 255));
    rG = rG * (1 - dm * (1 - inkM.g / 255));
    rB = rB * (1 - dm * (1 - inkM.b / 255));

    rR = rR * (1 - dy * (1 - inkY.r / 255));
    rG = rG * (1 - dy * (1 - inkY.g / 255));
    rB = rB * (1 - dy * (1 - inkY.b / 255));

    rR = rR * (1 - dk * (1 - inkK.r / 255));
    rG = rG * (1 - dk * (1 - inkK.g / 255));
    rB = rB * (1 - dk * (1 - inkK.b / 255));

    out[o]     = rR * 255;
    out[o + 1] = rG * 255;
    out[o + 2] = rB * 255;
    // Modulate output alpha by source alpha so pad-area pixels (source
    // alpha 0) stay transparent — pre-fix the pad rendered as a solid
    // paper-coloured rectangle, reading as an unwanted border.
    out[o + 3] = (paper.a / 255) * src[o + 3];
  }
}

// ---------------------------------------------------------------------------
// Screen buffer renderer — the core halftone algorithm
// ---------------------------------------------------------------------------

/**
 * renderScreenBuffer — produces a Float32Array of dot-coverage values (0..1)
 * for every output pixel, following the CORRECT halftone algorithm:
 *
 *   For each output pixel:
 *     1. Rotate it into the screen's coordinate space.
 *     2. Identify which grid CELL it belongs to (floor-based, not round).
 *     3. Look up that cell's coverage — sampled ONCE at the cell's centre
 *        (cached in a Map so every pixel in the same cell sees the same value).
 *     4. Test whether the pixel's distance to the cell centre is inside the
 *        dot shape for that coverage level.
 *
 * This is the key fix over the previous implementation: the previous code
 * called sampleCoverage(srcX, srcY) per pixel using Math.round(), which
 * caused adjacent pixels near a cell boundary to snap to different cells and
 * sample different coverage values — producing noise instead of regular dots.
 *
 * @param {Float32Array} coverageMap  - Pre-built per-pixel ink coverage (0..1)
 * @param {number} W / H             - Canvas dimensions
 * @param {number} pitch             - Grid cell spacing in pixels
 * @param {number} angleDeg          - Screen rotation angle in degrees
 * @param {object} p                 - Full params (dotShape, dotGain, antiAlias)
 * @returns {Float32Array}           - Per-pixel dot coverage 0..1
 */
function renderScreenBuffer(coverageMap, W, H, pitch, angleDeg, p) {
  const buf = new Float32Array(W * H);

  const cx = W / 2;
  const cy = H / 2;
  const rad = (angleDeg * Math.PI) / 180;

  // We rotate output pixels INTO the screen's space.
  // Screen angle θ means dots are laid at angle θ from horizontal.
  // To transform (x,y) into screen space, rotate by -θ.
  const cosA = Math.cos(-rad);
  const sinA = Math.sin(-rad);

  // Reverse rotation matrix (used to un-rotate cell centres back to src space)
  const cosAr = Math.cos(rad);
  const sinAr = Math.sin(rad);

  const dotGainPx = (p.dotGain / 100) * pitch * 0.3;
  const aa = p.antiAlias;
  const feather = aa === 'hard' ? 0 : 1;
  const sub = aa === 'sub-pixel';

  // Per-cell coverage cache. Pack (cellI + bias, cellJ + bias) into a single
  // 32-bit integer key — collision-free for any cell range up to ±32k, which
  // covers any sane pitch on a 64k-px canvas. The previous XOR hash
  // (cellI*131071) ^ (cellJ*524287) had real collisions and a single
  // `has + get` double lookup. One `Map.get` per cell, with `undefined`
  // sentinel for "not seen yet", drops that to a single hash probe.
  const cellCache = new Map();
  const KEY_BIAS = 0x8000;
  const Wm = W - 1;
  const Hm = H - 1;

  function getCellCoverage(cellI, cellJ) {
    const key = (((cellI + KEY_BIAS) << 16) | (cellJ + KEY_BIAS)) >>> 0;
    const seen = cellCache.get(key);
    if (seen !== undefined) return seen;

    // Cell centre in ROTATED screen space — cell (i,j) occupies
    // [i*pitch .. (i+1)*pitch); centre is at (i + 0.5) * pitch.
    const rcx = (cellI + 0.5) * pitch;
    const rcy = (cellJ + 0.5) * pitch;

    // Un-rotate the cell centre back to canvas (source) space (transpose
    // of the forward rotation matrix).
    const drcx = rcx - cx;
    const drcy = rcy - cy;
    const srcX = cosAr * drcx - sinAr * drcy + cx;
    const srcY = sinAr * drcx + cosAr * drcy + cy;

    let cov;
    if (srcX < 0 || srcX >= W || srcY < 0 || srcY >= H) {
      cov = 0; // outside image → paper
    } else {
      const ixR = (srcX + 0.5) | 0;
      const iyR = (srcY + 0.5) | 0;
      const ix = ixR < 0 ? 0 : ixR > Wm ? Wm : ixR;
      const iy = iyR < 0 ? 0 : iyR > Hm ? Hm : iyR;
      cov = coverageMap[iy * W + ix];
    }

    cellCache.set(key, cov);
    return cov;
  }

  /**
   * computePixelCoverage — evaluate one (possibly fractional) pixel position.
   */
  function computePixelCoverage(px, py) {
    // 1. Rotate into screen space
    const dx = px - cx;
    const dy = py - cy;
    const rx = cosA * dx - sinA * dy + cx;
    const ry = sinA * dx + cosA * dy + cy;

    // 2. Identify cell using floor (consistent: a pixel always belongs to exactly one cell)
    const cellI = Math.floor(rx / pitch);
    const cellJ = Math.floor(ry / pitch);

    // 3. Get this cell's coverage (one sample, cached)
    const coverage = getCellCoverage(cellI, cellJ);

    // 4. Cell centre in rotated space
    const cellCx = (cellI + 0.5) * pitch;
    const cellCy = (cellJ + 0.5) * pitch;

    // 5. Offset from cell centre in rotated space
    const distX = rx - cellCx;
    const distY = ry - cellCy;

    // 6. Dot shape test → 0..1 coverage
    return dotShapeCoverage(p.dotShape, distX, distY, pitch * 0.5, coverage, dotGainPx, feather);
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let dotCov;
      if (sub) {
        // 4× sub-pixel: sample at four quarter-pixel offsets and average
        dotCov = (
          computePixelCoverage(x - 0.25, y - 0.25) +
          computePixelCoverage(x + 0.25, y - 0.25) +
          computePixelCoverage(x - 0.25, y + 0.25) +
          computePixelCoverage(x + 0.25, y + 0.25)
        ) * 0.25;
      } else {
        dotCov = computePixelCoverage(x, y);
      }
      buf[y * W + x] = dotCov;
    }
  }

  return buf;
}

// ---------------------------------------------------------------------------
// Dot shape functions
// ---------------------------------------------------------------------------

/**
 * dotShapeCoverage — returns 0..1 ink coverage for a pixel at (distX, distY)
 * relative to its cell centre, given the cell's source coverage value.
 *
 * @param {string} shape       - Dot shape
 * @param {number} distX, distY - Offset from cell centre in rotated space
 * @param {number} halfP       - Half of pitch (= cell half-width)
 * @param {number} coverage    - Source ink coverage for this cell [0..1]
 * @param {number} dotGainPx   - Extra radius from dot gain
 * @param {number} feather     - Anti-alias feather width in pixels
 * @returns {number} 0..1
 */
function dotShapeCoverage(shape, distX, distY, halfP, coverage, dotGainPx, feather) {
  const c = clamp01(coverage);
  const gainAdj = dotGainPx;

  switch (shape) {
    case 'round': {
      // Dot radius scales as sqrt(coverage) so dot AREA is proportional to coverage.
      // At coverage=1 the radius equals halfP (dot fills the cell).
      const r = Math.sqrt(c) * halfP + gainAdj;
      const dist = Math.sqrt(distX * distX + distY * distY);
      return edgeBlend(dist, r, feather);
    }

    case 'square': {
      const hs = c * halfP + gainAdj;
      const dist = Math.max(Math.abs(distX), Math.abs(distY));
      return edgeBlend(dist, hs, feather);
    }

    case 'diamond': {
      const hs = c * halfP + gainAdj;
      const dist = (Math.abs(distX) + Math.abs(distY)) / Math.SQRT2;
      return edgeBlend(dist, hs, feather);
    }

    case 'line': {
      // Horizontal line of height `coverage * pitch`, full width
      const hs = c * halfP + gainAdj;
      return edgeBlend(Math.abs(distY), hs, feather);
    }

    case 'cross': {
      const hs = c * halfP * 0.5 + gainAdj;
      const inH = edgeBlend(Math.abs(distY), hs, feather);
      const inV = edgeBlend(Math.abs(distX), hs, feather);
      return clamp01(inH + inV - inH * inV);
    }

    case 'euclidean':
    default: {
      // Smooth Euclidean: circle grows → square → inverse-circle (highlight).
      // c < 0.5: round dot growing from nothing.
      // c > 0.5: paper hole (inverse circle) shrinking to nothing.
      // Crossover blended near 0.5.
      const dist = Math.sqrt(distX * distX + distY * distY);

      if (c <= 0.45) {
        // Growing round dot; r = sqrt(2c)*halfP so area covers exactly c of cell area.
        const r = Math.sqrt(c * 2) * halfP + gainAdj;
        return edgeBlend(dist, r, feather);
      } else if (c >= 0.55) {
        // Ink everywhere except a shrinking round paper hole.
        const rInv = Math.sqrt((1 - c) * 2) * halfP;
        const paperCov = edgeBlend(dist, Math.max(0, rInv - gainAdj), feather);
        return clamp01(1 - paperCov);
      } else {
        // Crossover blend 0.45..0.55
        const t = (c - 0.45) / 0.1;
        const smooth = t * t * (3 - 2 * t);

        const r1 = Math.sqrt(c * 2) * halfP + gainAdj;
        const cov1 = edgeBlend(dist, r1, feather);

        const rInv = Math.sqrt((1 - c) * 2) * halfP;
        const paperCov = edgeBlend(dist, Math.max(0, rInv - gainAdj), feather);
        const cov2 = clamp01(1 - paperCov);

        return lerp(cov1, cov2, smooth);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Vignette
// ---------------------------------------------------------------------------

/**
 * applyVignette — radial darkening centred on the canvas, simulating the
 * photographed-print look. strength 0..50 mapped to 0..0.9 max darkening.
 */
function applyVignette(out, W, H, strength) {
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const s = clamp01(strength / 50) * 0.9;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) / maxR;
      const dark = s * smoothstep(r * r);
      const scale = 1 - dark;
      out[o]     = out[o]     * scale;
      out[o + 1] = out[o + 1] * scale;
      out[o + 2] = out[o + 2] * scale;
    }
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function renderUI(params, onChange) {
  const p = { ...defaultParams(), ...params };
  const root = makeRoot();

  // ---- Global section ----
  const globalSec = sectionHeader('Global');
  root.appendChild(globalSec);

  root.appendChild(sliderRow({
    label: 'Dot Pitch',
    min: 1, max: 80, step: 1,
    value: p.pitch,
    defaultValue: 8,
    suffix: 'px',
    onChange: (v) => onChange({ pitch: v }),
  }));

  root.appendChild(pillGroup({
    label: 'Mode',
    options: [
      { value: 'monochrome',       label: 'Mono' },
      { value: 'rgb-separated',    label: 'RGB' },
      { value: 'cmyk-separated',   label: 'CMYK' },
    ],
    value: p.mode,
    onChange: (v) => {
      onChange({ mode: v });
      rebuildUI();
    },
  }));

  root.appendChild(pillGroup({
    label: 'Background',
    options: [
      { value: 'paper-white',  label: 'Paper' },
      { value: 'transparent',  label: 'Alpha' },
      { value: 'custom',       label: 'Custom' },
    ],
    value: p.bgMode,
    onChange: (v) => {
      onChange({ bgMode: v });
      rebuildUI();
    },
  }));

  if (p.bgMode === 'custom') {
    root.appendChild(colorRow({
      label: 'BG Colour',
      value: p.bgColor || '#fefcf6',
      onChange: (v) => onChange({ bgColor: v }),
    }));
  }

  // ---- CMYK section (only when mode === 'cmyk-separated') ----
  if (p.mode === 'cmyk-separated') {
    const cmykSec = sectionHeader('CMYK Screens');
    root.appendChild(cmykSec);

    const presetRow = document.createElement('div');
    presetRow.className = 'effect-tool-row';
    presetRow.style.cssText = 'justify-content: flex-end; padding: 0 2px 2px;';
    const presetBtn = document.createElement('button');
    presetBtn.type = 'button';
    presetBtn.className = 'effect-pill';
    presetBtn.textContent = 'Industry preset';
    presetBtn.title = 'Restore C=15° M=75° Y=0° K=45°';
    presetBtn.addEventListener('click', () => {
      onChange({ angleC: 15, angleM: 75, angleY: 0, angleK: 45 });
      rebuildUI();
    });
    presetRow.appendChild(presetBtn);
    root.appendChild(presetRow);

    for (const ch of ['C', 'M', 'Y', 'K']) {
      const angleKey = `angle${ch}`;
      const defaults = { C: 15, M: 75, Y: 0, K: 45 };
      root.appendChild(sliderRow({
        label: `${ch} Angle`,
        min: 0, max: 180, step: 1,
        value: p[angleKey],
        defaultValue: defaults[ch],
        suffix: '°',
        onChange: (v) => onChange({ [angleKey]: v }),
      }));
    }

    const pitchSec = sectionHeader('Pitch Multipliers');
    root.appendChild(pitchSec);

    for (const ch of ['C', 'M', 'Y', 'K']) {
      const pitchKey = `pitch${ch}`;
      const defaults = { C: 1, M: 1, Y: 1.1, K: 1 };
      root.appendChild(sliderRow({
        label: `${ch} Pitch`,
        min: 0.5, max: 2, step: 0.05,
        value: p[pitchKey],
        defaultValue: defaults[ch],
        onChange: (v) => onChange({ [pitchKey]: v }),
      }));
    }

    const inkSec = sectionHeader('Ink Overrides');
    root.appendChild(inkSec);

    const inkDefaults = { C: '#00ffff', M: '#ff00ff', Y: '#ffff00', K: '#000000' };
    for (const ch of ['C', 'M', 'Y', 'K']) {
      const inkKey = `ink${ch}`;
      const currentVal = p[inkKey] || inkDefaults[ch];
      root.appendChild(colorRow({
        label: `${ch} Ink`,
        value: currentVal,
        onChange: (v) => onChange({ [inkKey]: v }),
      }));
    }

    root.appendChild(toggleRow({
      label: 'K Plate (UCR)',
      value: p.kPlate,
      onChange: (v) => onChange({ kPlate: v }),
      align: 'left',
    }));
  }

  // ---- Dot section ----
  const dotSec = sectionHeader('Dot');
  root.appendChild(dotSec);

  root.appendChild(selectRow({
    label: 'Shape',
    options: [
      { value: 'round',      label: 'Round' },
      { value: 'square',     label: 'Square' },
      { value: 'diamond',    label: 'Diamond' },
      { value: 'line',       label: 'Line' },
      { value: 'cross',      label: 'Cross' },
      { value: 'euclidean',  label: 'Euclidean' },
    ],
    value: p.dotShape,
    onChange: (v) => onChange({ dotShape: v }),
  }));

  root.appendChild(sliderRow({
    label: 'Dot Gain',
    min: 0, max: 30, step: 1,
    value: p.dotGain,
    defaultValue: 0,
    suffix: '%',
    onChange: (v) => onChange({ dotGain: v }),
  }));

  root.appendChild(pillGroup({
    label: 'Anti-aliasing',
    options: [
      { value: 'hard',       label: 'Hard' },
      { value: 'soft',       label: 'Soft' },
      { value: 'sub-pixel',  label: '4×' },
    ],
    value: p.antiAlias,
    onChange: (v) => onChange({ antiAlias: v }),
  }));

  // ---- Paper section ----
  const paperSec = sectionHeader('Paper');
  root.appendChild(paperSec);

  root.appendChild(sliderRow({
    label: 'Vignette',
    min: 0, max: 50, step: 1,
    value: p.vignette,
    defaultValue: 0,
    onChange: (v) => onChange({ vignette: v }),
  }));

  function rebuildUI() {
    root.innerHTML = '';
    Promise.resolve().then(() => {
      const freshUI = renderUI({ ...p, ...params }, onChange);
      while (root.firstChild) root.removeChild(root.firstChild);
      while (freshUI.firstChild) root.appendChild(freshUI.firstChild);
    });
  }

  return root;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function sectionHeader(label) {
  const h = document.createElement('div');
  h.className = 'effect-section-header';
  h.style.cssText = `
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted, #888);
    padding: 8px 2px 2px;
    margin-top: 4px;
  `;
  h.textContent = label;
  return h;
}

// ---------------------------------------------------------------------------
// Math / colour helpers
// ---------------------------------------------------------------------------

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { const c = clamp01(t); return c * c * (3 - 2 * c); }

/**
 * edgeBlend — returns 0..1 coverage based on distance and radius,
 * with an optional feather zone for soft anti-aliasing.
 */
function edgeBlend(dist, r, feather) {
  if (feather <= 0) return dist <= r ? 1 : 0;
  const lo = r - feather * 0.5;
  const hi = r + feather * 0.5;
  if (dist <= lo) return 1;
  if (dist >= hi) return 0;
  const t = (dist - lo) / (hi - lo);
  return 1 - smoothstep(t);
}

/**
 * parsePaperColor — returns { r, g, b, a } from bgMode + bgColor params.
 */
function parsePaperColor(p) {
  if (p.bgMode === 'transparent') return { r: 255, g: 255, b: 255, a: 0 };
  const hex = p.bgMode === 'custom' ? (p.bgColor || '#fefcf6') : '#fefcf6';
  return hexToRgba(hex, 255);
}

/**
 * parseInkColor — returns { r, g, b } from an override string (hex) or
 * falls back to the provided default.
 */
function parseInkColor(override, def) {
  if (!override || override.length < 4) return def;
  return hexToRgba(override, 255);
}

/**
 * hexToRgba — parse a CSS hex colour (#rgb, #rrggbb) into { r, g, b, a }.
 */
function hexToRgba(hex, a) {
  const h = String(hex).replace('#', '');
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
      a,
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a,
  };
}
