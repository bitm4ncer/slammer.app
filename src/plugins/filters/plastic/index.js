// Plastic — Surface Pack premium effect.
//
// Recreates After Effects' CC Plastic look: soft, rolled-shoulder, glossy
// surface generated from the layer's luma or alpha as a bump heightfield.
// Algorithm:
//   1. extractHeightmap from a chosen channel (luma / alpha / red),
//      downsampled to ≤ 1024 px on the longer axis.
//   2. heavy separable Gaussian pre-blur — THE expressive knob; small
//      radius reads as crinkled emboss, large reads as smooth plastic.
//   3. Sobel gradient → unit normal per pixel (bumpHeight scales gradient).
//   4. Blinn-Phong shading per output pixel with bilinear-sampled normals:
//      ambient + diffuse * (N·L) + specular * (N·H)^shininess.
//   5. Modulate by source alpha so transparency is preserved.
//
// View vector is fixed at (0, 0, 1); the camera looks straight down. Light
// vector is built from azimuth + elevation. Shading uses the source pixel
// as the "diffuse colour" so a plastic-cast photo keeps recognisable hue
// but gets the bump-shaded surface laid on top.
//
// Performance: full-res shading + downsampled normals → typical 2000 ×
// 2000 input lands in ~150 ms first-run. The renderer's effect cache
// dedupes runs where params don't change.

import { sliderRow, pillGroup, colorRow, makeRoot } from '../../shared/ui-helpers.js';
import { extractHeightmap, gaussianBlurSeparable, computeNormals, sampleNormal } from '../../shared/heightfield.js';

export default {
  id: 'plastic',
  name: 'Plastic',
  version: '1.0.0',
  type: 'filter',
  icon: 'circle',
  category: 'stylize',
  description: 'Glossy plastic / wax surface from a luma or alpha bump map',

  defaultParams() {
    return {
      channel:    'luma',          // 'luma' | 'alpha' | 'red'
      smoothness:  18,             // pre-blur radius — the most expressive knob (0..100)
      bumpHeight:  60,             // gradient scaling (0..200%)
      lightAz:    135,             // light azimuth, degrees (0 = right, 90 = down)
      lightEl:     45,             // light elevation, degrees (0 = horizon, 90 = top-down)
      lightInt:   100,             // 0..200%
      ambient:     20,             // 0..100%
      diffuse:     90,             // 0..150%
      specular:   100,             // 0..200%
      roughness:   28,             // 0..100; mapped to Phong exponent (high → tight highlight)
      highlightColor: '#ffffff',
    };
  },

  process(imageData, params, _ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const channel    = params.channel ?? 'luma';
    const smoothness = clamp01(params.smoothness ?? 18, 0, 100);
    const bumpHt     = clamp01(params.bumpHeight ?? 60, 0, 200) / 100;
    const lightAz    = ((params.lightAz ?? 135) * Math.PI) / 180;
    const lightEl    = ((params.lightEl ?? 45)  * Math.PI) / 180;
    const lightInt   = clamp01(params.lightInt ?? 100, 0, 200) / 100;
    const ambient    = clamp01(params.ambient  ?? 20,  0, 100) / 100;
    const diffuse    = clamp01(params.diffuse  ?? 90,  0, 150) / 100;
    const specular   = clamp01(params.specular ?? 100, 0, 200) / 100;
    const rough      = clamp01(params.roughness ?? 28, 0, 100) / 100;
    const hl         = parseHex(params.highlightColor || '#ffffff');

    // Build the heightmap → blur → normals pipeline. Smoothness slider goes
    // 0..100 but blur radius needs to scale with image size so a "smooth
    // plastic" looks the same regardless of source resolution.
    const heightSrc = extractHeightmap(src, W, H, channel, 1024);
    const blurRadius = (smoothness / 100) * Math.max(heightSrc.w, heightSrc.h) * 0.10;
    const blurred = gaussianBlurSeparable(heightSrc.map, heightSrc.w, heightSrc.h, blurRadius);
    // Sobel on a normalised 0..1 heightmap produces tiny gradients; scale
    // by ~50× so a bumpHeight of 1.0 reads as a strong-but-natural surface.
    const { nx, ny, nz } = computeNormals(blurred, heightSrc.w, heightSrc.h, bumpHt * 50);

    // Light + half-vector for Blinn-Phong. Z points up out of the canvas.
    const cosEl = Math.cos(lightEl);
    const lx = Math.cos(lightAz) * cosEl;
    const ly = Math.sin(lightAz) * cosEl;
    const lz = Math.sin(lightEl);
    // View vector is straight down the +z axis; half = normalize(L + V).
    let hx = lx, hy = ly, hz = lz + 1;
    const hlen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    hx /= hlen; hy /= hlen; hz /= hlen;

    // Phong exponent: roughness 0 → mirror-tight (256), roughness 100 → broad (4).
    const shininess = Math.max(2, Math.pow(2, 8 - rough * 6));

    const out = new ImageData(W, H);
    const dst = out.data;
    const sx = heightSrc.scale;
    const sy = heightSrc.scale;

    for (let y = 0; y < H; y++) {
      const srcY = y * sx;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = src[i + 3];
        if (a === 0) {
          dst[i + 3] = 0;
          continue;
        }
        const N = sampleNormal(nx, ny, nz, heightSrc.w, heightSrc.h, x * sx, srcY);
        const NdotL = N[0] * lx + N[1] * ly + N[2] * lz;
        const NdotH = N[0] * hx + N[1] * hy + N[2] * hz;
        const diff = NdotL > 0 ? NdotL : 0;
        const spec = NdotH > 0 ? Math.pow(NdotH, shininess) : 0;

        const litK = (ambient + diffuse * diff) * lightInt;
        const specK = specular * spec * lightInt;
        const r = src[i]     * litK + hl[0] * specK;
        const g = src[i + 1] * litK + hl[1] * specK;
        const b = src[i + 2] * litK + hl[2] * specK;
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
        label: 'Smoothness', min: 0, max: 100, step: 1,
        value: local.smoothness, defaultValue: 18, suffix: '%',
        onChange: (v) => { local.smoothness = v; onChange({ smoothness: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Bump Height', min: 0, max: 200, step: 1,
        value: local.bumpHeight, defaultValue: 60, suffix: '%',
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

      root.appendChild(sliderRow({
        label: 'Light Intensity', min: 0, max: 200, step: 1,
        value: local.lightInt, defaultValue: 100, suffix: '%',
        onChange: (v) => { local.lightInt = v; onChange({ lightInt: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Ambient', min: 0, max: 100, step: 1,
        value: local.ambient, defaultValue: 20, suffix: '%',
        onChange: (v) => { local.ambient = v; onChange({ ambient: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Diffuse', min: 0, max: 150, step: 1,
        value: local.diffuse, defaultValue: 90, suffix: '%',
        onChange: (v) => { local.diffuse = v; onChange({ diffuse: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Specular', min: 0, max: 200, step: 1,
        value: local.specular, defaultValue: 100, suffix: '%',
        onChange: (v) => { local.specular = v; onChange({ specular: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Roughness', min: 0, max: 100, step: 1,
        value: local.roughness, defaultValue: 28, suffix: '%',
        onChange: (v) => { local.roughness = v; onChange({ roughness: v }); },
      }));

      root.appendChild(colorRow({
        label: 'Highlight',
        value: local.highlightColor,
        onChange: (v) => { local.highlightColor = v; onChange({ highlightColor: v }); },
      }));
    }

    rebuild();
    return root;
  },
};

// ---------- helpers ----------

function clamp01(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function parseHex(hex) {
  let h = String(hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
