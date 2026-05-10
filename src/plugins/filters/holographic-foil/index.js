// Holographic Foil — 3D Pack premium effect.
//
// v2 algorithm — drives colour from SPATIAL position + SOURCE LUMA, with
// surface bumps as a subtle secondary modulator. v1 used N · L alone, which
// only varied colour where the heightfield gradient varied — so flat photos
// got a single hue with rainbow only at the contour rim. The references
// (Pokémon holo, Y2K vinyl, hyperpop foil-prints) instead show flowing
// rainbow bands across the ENTIRE surface — that's what this rewrite hits.
//
// Algorithm:
//   1. extractHeightmap → blur → normals (shared via _shared/heightfield.js).
//      Used for the small bump-shift on the LUT index AND for the Phong
//      sparkle term — not for the dominant colour.
//   2. Spatial term: a rotated linear gradient + an organic-swirl sin field
//      gives the dominant flowing colour bands.
//   3. Luma term: source brightness shifts the hue, so highlights and shadows
//      land on different parts of the spectrum.
//   4. Bump term: a small fraction of N · L breaks up perfectly-flat regions
//      so shaped layers (text, vector) read with surface relief.
//   5. Combined hue index → wrap → sample the spectral LUT.
//   6. Grain: deterministic per-pixel hash adds the fine foil texture across
//      ALL pixels (independent of light direction — unlike v1 sparkle).
//   7. Sparkle: tight Phong specular (N · H ^ shininess) modulated by hash
//      noise so glints catch the light unevenly.
//
// Output is the FULLY-WET foil colour. Slot-level dry/wet handles blending
// against the original source — process() must NOT internally mix.

import { sliderRow, pillGroup, colorRow, makeRoot } from '../../shared/ui-helpers.js';
import { extractHeightmap, gaussianBlurSeparable, computeNormals, sampleNormal } from '../../shared/heightfield.js';

// ---------- Built-in palettes ----------
// Three-stop spectral LUTs (RGB triples). Interpolated linearly across the
// [0, 1] hue parameter, wrapped — so a continuous t cycles repeatedly at
// higher frequencies. The classic spectrum stop set passes pink → cyan →
// yellow on the way out, then yellow → pink on the wrap (red/magenta band)
// for a complete rainbow cycle.

const PALETTES = {
  spectrum: [[255, 80, 200],  [80, 220, 255],  [255, 240, 90]],   // pink / cyan / yellow — classic holo
  pastel:   [[230, 210, 255], [200, 245, 240], [255, 230, 210]],  // soft duotone-ish
  neon:     [[255, 30, 230],  [60, 255, 200],  [255, 200, 30]],   // saturated Y2K
  y2k:      [[170, 130, 255], [100, 255, 220], [255, 180, 80]],   // chrome-purple / mint / amber
};

export default {
  id: 'holographic-foil',
  name: 'Holographic Foil',
  version: '2.0.0',
  type: 'filter',
  icon: 'wand-sparkles',
  category: 'stylize',
  description: 'Iridescent foil — Pokémon holo / Y2K hyperpop',

  defaultParams() {
    return {
      channel:    'luma',
      smoothness:  20,
      bumpHeight:  40,
      lightAz:    135,
      lightEl:     45,
      direction:   45,        // gradient angle in degrees (dominant colour-band axis)
      scale:      300,        // wavelength of the spatial gradient in pixels
      swirl:       50,        // 0..100 — organic distortion of the spatial field
      lumaShift:   80,        // 0..200 — how much source luma shifts the hue
      bumpShift:   20,        // 0..100 — how much surface normals shift the hue
      frequency:    2,        // 0.5..10 colour cycles across the spatial gradient
      palette:    'spectrum',
      stop1:      '#ff50c8',
      stop2:      '#50dcff',
      stop3:      '#fff05a',
      grain:       12,        // 0..100 — fine foil texture (always-on noise)
      sparkle:     30,        // 0..100 — Phong-modulated specular glints
      roughness:   25,        // 0..100; 0 = pin-sharp glints, 100 = soft
    };
  },

  process(imageData, params, _ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const channel    = params.channel ?? 'luma';
    const smoothness = clamp01(params.smoothness ?? 20, 0, 100);
    const bumpHt     = clamp01(params.bumpHeight ?? 40, 0, 200) / 100;
    const lightAz    = ((params.lightAz ?? 135) * Math.PI) / 180;
    const lightEl    = ((params.lightEl ?? 45)  * Math.PI) / 180;
    const dirRad     = ((params.direction ?? 45) * Math.PI) / 180;
    const scalePx    = Math.max(20, params.scale ?? 300);
    const swirlAmt   = clamp01(params.swirl ?? 50, 0, 100) / 100;
    const lumaShift  = clamp01(params.lumaShift ?? 80, 0, 200) / 100;
    const bumpShift  = clamp01(params.bumpShift ?? 20, 0, 100) / 100;
    const frequency  = Math.max(0.1, params.frequency ?? 2);
    const paletteId  = params.palette ?? 'spectrum';
    const grainAmt   = clamp01(params.grain ?? 12, 0, 100) / 100;
    const sparkleA   = clamp01(params.sparkle ?? 30, 0, 100) / 100;
    const rough      = clamp01(params.roughness ?? 25, 0, 100) / 100;

    const palette = paletteId === 'custom'
      ? [parseHex(params.stop1 || '#ff50c8'), parseHex(params.stop2 || '#50dcff'), parseHex(params.stop3 || '#fff05a')]
      : (PALETTES[paletteId] || PALETTES.spectrum);

    // Heightfield pipeline drives BOTH the small bump-shift on the LUT index
    // AND the Phong sparkle. Smoothness controls bump pre-blur radius.
    const heightSrc = extractHeightmap(src, W, H, channel, 1024);
    const blurRadius = (smoothness / 100) * Math.max(heightSrc.w, heightSrc.h) * 0.10;
    const blurred = gaussianBlurSeparable(heightSrc.map, heightSrc.w, heightSrc.h, blurRadius);
    const { nx, ny, nz } = computeNormals(blurred, heightSrc.w, heightSrc.h, bumpHt * 50);

    // Light + half vector for the sparkle Phong term.
    const cosEl = Math.cos(lightEl);
    const lx = Math.cos(lightAz) * cosEl;
    const ly = Math.sin(lightAz) * cosEl;
    const lz = Math.sin(lightEl);
    let hx = lx, hy = ly, hz = lz + 1;
    const hlen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    hx /= hlen; hy /= hlen; hz /= hlen;
    const shininess = Math.max(2, Math.pow(2, 8 - rough * 6));

    // Spatial-gradient direction unit vector. Bands are oriented perpendicular
    // to this; (x · dirX + y · dirY) gives the position along the gradient.
    const dirX = Math.cos(dirRad);
    const dirY = Math.sin(dirRad);
    // Two perpendicular swirl frequencies — sin(x/sx) * cos(y/sy) gives a
    // checker-marble pattern; offset phase so they cross at angles.
    const swirlS1 = scalePx * 0.4;
    const swirlS2 = scalePx * 0.55;
    const invScale = 1 / scalePx;

    const out = new ImageData(W, H);
    const dst = out.data;
    const sx = heightSrc.scale;
    const sy = heightSrc.scale;

    for (let y = 0; y < H; y++) {
      const srcY = y * sy;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = src[i + 3];
        if (a === 0) { dst[i + 3] = 0; continue; }

        // ---- Spatial term: rotated linear gradient + organic swirl ----
        const linear = (x * dirX + y * dirY) * invScale;
        const swirl = (Math.sin(x / swirlS1) + Math.cos(y / swirlS2)) * 0.5 * swirlAmt;
        const spatialT = linear + swirl;

        // ---- Source luma term ----
        const luma = (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255;

        // ---- Bump term (small) ----
        const N = sampleNormal(nx, ny, nz, heightSrc.w, heightSrc.h, x * sx, srcY);
        const NdotL = N[0] * lx + N[1] * ly + N[2] * lz;

        // ---- Combined hue parameter ----
        let t = (spatialT + luma * lumaShift + NdotL * bumpShift) * frequency;
        t = t - Math.floor(t);
        if (t < 0) t += 1;
        const lut = sampleLut(palette, t);

        // ---- Grain: deterministic per-pixel noise ----
        // Centred at zero so it lifts and lowers each pixel evenly. The
        // intensity is moderate (~grainAmt × 64) so it adds physical foil
        // texture without washing out the colour cycles.
        const grain = (hashNoise(x, y) - 0.5) * grainAmt * 64;

        // ---- Sparkle: tight Phong specular × hash noise ----
        const NdotH = N[0] * hx + N[1] * hy + N[2] * hz;
        const specRaw = NdotH > 0 ? Math.pow(NdotH, shininess) : 0;
        const sparkleNoise = sparkleA > 0 ? hashNoise(x + 7, y + 13) : 0;
        const sparkle = specRaw * (0.4 + sparkleNoise * 0.8) * sparkleA;

        const r = lut[0] + grain + 255 * sparkle;
        const g = lut[1] + grain + 255 * sparkle;
        const b = lut[2] + grain + 255 * sparkle;
        dst[i]     = r > 255 ? 255 : r < 0 ? 0 : r | 0;
        dst[i + 1] = g > 255 ? 255 : g < 0 ? 0 : g | 0;
        dst[i + 2] = b > 255 ? 255 : b < 0 ? 0 : b | 0;
        dst[i + 3] = a;
      }
    }
    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { ...this.defaultParams(), ...params };

    function rebuild() {
      root.innerHTML = '';

      root.appendChild(pillGroup({
        label: 'Source',
        options: [
          { value: 'luma',  label: 'Luma'  },
          { value: 'alpha', label: 'Alpha' },
          { value: 'red',   label: 'Red'   },
        ],
        value: local.channel,
        onChange: (v) => { local.channel = v; onChange({ channel: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Direction', min: 0, max: 360, step: 1,
        value: local.direction, defaultValue: 45, suffix: '°',
        onChange: (v) => { local.direction = v; onChange({ direction: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Scale', min: 50, max: 1200, step: 10,
        value: local.scale, defaultValue: 300, suffix: 'px',
        onChange: (v) => { local.scale = v; onChange({ scale: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Swirl', min: 0, max: 100, step: 1,
        value: local.swirl, defaultValue: 50, suffix: '%',
        onChange: (v) => { local.swirl = v; onChange({ swirl: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Frequency', min: 0.5, max: 10, step: 0.1,
        value: local.frequency, defaultValue: 2,
        onChange: (v) => { local.frequency = v; onChange({ frequency: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Luma Shift', min: 0, max: 200, step: 1,
        value: local.lumaShift, defaultValue: 80, suffix: '%',
        onChange: (v) => { local.lumaShift = v; onChange({ lumaShift: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Bump Shift', min: 0, max: 100, step: 1,
        value: local.bumpShift, defaultValue: 20, suffix: '%',
        onChange: (v) => { local.bumpShift = v; onChange({ bumpShift: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Smoothness', min: 0, max: 100, step: 1,
        value: local.smoothness, defaultValue: 20, suffix: '%',
        onChange: (v) => { local.smoothness = v; onChange({ smoothness: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Bump Height', min: 0, max: 200, step: 1,
        value: local.bumpHeight, defaultValue: 40, suffix: '%',
        onChange: (v) => { local.bumpHeight = v; onChange({ bumpHeight: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Light Azimuth', min: 0, max: 360, step: 1,
        value: local.lightAz, defaultValue: 135, suffix: '°',
        onChange: (v) => { local.lightAz = v; onChange({ lightAz: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Light Elevation', min: 0, max: 90, step: 1,
        value: local.lightEl, defaultValue: 45, suffix: '°',
        onChange: (v) => { local.lightEl = v; onChange({ lightEl: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Palette',
        options: [
          { value: 'spectrum', label: 'Spectrum' },
          { value: 'pastel',   label: 'Pastel'   },
          { value: 'neon',     label: 'Neon'     },
          { value: 'y2k',      label: 'Y2K'      },
          { value: 'custom',   label: 'Custom'   },
        ],
        value: local.palette,
        onChange: (v) => { local.palette = v; onChange({ palette: v }); rebuild(); },
      }));

      if (local.palette === 'custom') {
        root.appendChild(colorRow({
          label: 'Stop 1', value: local.stop1,
          onChange: (v) => { local.stop1 = v; onChange({ stop1: v }); },
        }));
        root.appendChild(colorRow({
          label: 'Stop 2', value: local.stop2,
          onChange: (v) => { local.stop2 = v; onChange({ stop2: v }); },
        }));
        root.appendChild(colorRow({
          label: 'Stop 3', value: local.stop3,
          onChange: (v) => { local.stop3 = v; onChange({ stop3: v }); },
        }));
      }

      root.appendChild(sliderRow({
        label: 'Grain', min: 0, max: 100, step: 1,
        value: local.grain, defaultValue: 12, suffix: '%',
        onChange: (v) => { local.grain = v; onChange({ grain: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Sparkle', min: 0, max: 100, step: 1,
        value: local.sparkle, defaultValue: 30, suffix: '%',
        onChange: (v) => { local.sparkle = v; onChange({ sparkle: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Roughness', min: 0, max: 100, step: 1,
        value: local.roughness, defaultValue: 25, suffix: '%',
        onChange: (v) => { local.roughness = v; onChange({ roughness: v }); },
      }));
    }

    rebuild();
    return root;
  },
};

// ---------- Spectral LUT lookup ----------

function sampleLut(palette, t) {
  if (t <= 0.5) {
    const u = t / 0.5;
    return [
      palette[0][0] + (palette[1][0] - palette[0][0]) * u,
      palette[0][1] + (palette[1][1] - palette[0][1]) * u,
      palette[0][2] + (palette[1][2] - palette[0][2]) * u,
    ];
  }
  const u = (t - 0.5) / 0.5;
  return [
    palette[1][0] + (palette[2][0] - palette[1][0]) * u,
    palette[1][1] + (palette[2][1] - palette[1][1]) * u,
    palette[1][2] + (palette[2][2] - palette[1][2]) * u,
  ];
}

// ---------- Pseudo-random hash ----------

function hashNoise(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = (h * 1274126177) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return ((h >>> 0) % 10000) / 10000;
}

// ---------- helpers ----------

function clamp01(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function parseHex(hex) {
  let h = String(hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
