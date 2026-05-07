// Bulge / Pinch — radial distortion filter.
// For each output pixel, compute its displacement from (cx, cy).
// Pixels inside `radius` are warped inward (pinch) or outward (bulge)
// by remapping the radial coordinate based on a falloff curve.
// Pixels outside radius are left unchanged (or blended via Mix).

import { sliderRow, pillGroup, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'bulge',
  name: 'Bulge',
  version: '1.0.0',
  type: 'filter',
  icon: 'up-right-and-down-left-from-center',
  category: 'distort',
  pro: true,
  pack: 'liquid-pack',

  defaultParams() {
    return {
      scope:     'image',      // 'image' | 'layer' — anchor + alpha mask
      centerX:   50,           // 0..100%
      centerY:   50,           // 0..100%
      radius:    50,           // 0..100% of min(w,h)
      strength:  50,           // -100..100; positive = bulge out, negative = pinch in
      falloff:   'spherical',  // 'spherical' | 'smooth' | 'cone' | 'pinch-bell'
      aspect:    'preserve',   // 'preserve' | 'free'
      strengthX: 50,           // -100..100 (only used when aspect = 'free')
      strengthY: 50,           // -100..100 (only used when aspect = 'free')
      sampling:  'bilinear',   // 'bilinear' | 'nearest'
      mix:       100,          // 0..100%
    };
  },

  process(imageData, params, ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const scope = params.scope === 'layer' ? 'layer' : 'image';
    const rect = (scope === 'image' && ctx?.contentRect)
      ? ctx.contentRect
      : { x: 0, y: 0, w: W, h: H };

    const centerX   = rect.x + clamp(params.centerX  ?? 50, 0, 100) / 100 * rect.w;
    const centerY   = rect.y + clamp(params.centerY  ?? 50, 0, 100) / 100 * rect.h;
    const radius    = clamp(params.radius   ?? 50, 0, 100) / 100 * Math.min(rect.w, rect.h);
    const strength  = clamp(params.strength ?? 50, -100, 100) / 100;
    const falloff   = params.falloff  ?? 'spherical';
    const aspect    = params.aspect   ?? 'preserve';
    const strengthX = clamp(params.strengthX ?? 50, -100, 100) / 100;
    const strengthY = clamp(params.strengthY ?? 50, -100, 100) / 100;
    const sampling  = params.sampling ?? 'bilinear';
    const mix       = clamp(params.mix ?? 100, 0, 100) / 100;

    // Short-circuit: zero radius or zero strength → pass-through.
    if (radius < 0.5) return imageData;
    if (aspect === 'preserve' && Math.abs(strength) < 1e-6 && mix >= 1) return imageData;
    if (aspect === 'free' && Math.abs(strengthX) < 1e-6 && Math.abs(strengthY) < 1e-6 && mix >= 1) return imageData;

    const out = new ImageData(W, H);
    const dst = out.data;
    const PI  = Math.PI;
    const sampleFn = sampling === 'nearest' ? sampleNearest : sampleBilinear;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const di = (y * W + x) * 4;

        if (dist > radius || radius < 0.5) {
          // Outside radius — copy source (respect mix).
          if (mix >= 1) {
            dst[di]     = src[di];
            dst[di + 1] = src[di + 1];
            dst[di + 2] = src[di + 2];
            dst[di + 3] = src[di + 3];
          } else {
            const [r, g, b, a] = sampleFn(src, W, H, x, y);
            blendPixel(dst, di, src, di, r, g, b, a, mix);
          }
          continue;
        }

        // Normalised distance: 0 at center, 1 at edge of radius.
        const t = dist / radius;

        // Falloff factor f ∈ [0, 1].
        let f;
        switch (falloff) {
          case 'spherical':
            // True hemisphere projection: f peaks at edge (like a fish-eye).
            // For bulge: inner pixels are pushed out toward the edge of the lens.
            // Inverse-warp: to find source for output pixel at distance d,
            // map d → d * (1 - f * strength) where f = 1 - sqrt(1 - t²).
            f = 1 - Math.sqrt(1 - t * t);
            break;
          case 'smooth':
            // Cosine bell: smooth falloff from center to edge.
            f = 0.5 * (1 + Math.cos(PI * t));
            break;
          case 'cone':
            // Linear ramp: maximum at center, zero at edge.
            f = 1 - t;
            break;
          case 'pinch-bell':
            // Sine bell: zero at center and edge, maximum in the middle.
            f = Math.sin(PI * t);
            break;
          default:
            f = 1 - Math.sqrt(1 - t * t);
            break;
        }

        let sx, sy;

        if (aspect === 'free') {
          // Separate X and Y strengths — oval distortion.
          // For each axis, scale the displacement component independently.
          // Inverse warp: find source by moving TOWARD center by factor.
          const sdx = dist > 1e-6 ? dx / dist : 0;
          const sdy = dist > 1e-6 ? dy / dist : 0;

          // Source radial distance for this pixel (inverse warp).
          // Positive strengthX/Y → bulge out → source closer to center → subtract.
          sx = centerX + dx - sdx * dist * f * strengthX;
          sy = centerY + dy - sdy * dist * f * strengthY;
        } else {
          // Uniform radial distortion.
          // Positive strength → bulge out → output pixels pull toward center → source
          // coordinate is at a shorter radial distance.
          const srcDist = dist * (1 - f * strength);
          const dir = dist > 1e-6 ? 1 / dist : 0;
          sx = centerX + dx * dir * srcDist;
          sy = centerY + dy * dir * srcDist;
        }

        const [r, g, b, a] = sampleFn(src, W, H, sx, sy);

        if (mix >= 1) {
          dst[di]     = r;
          dst[di + 1] = g;
          dst[di + 2] = b;
          dst[di + 3] = a;
        } else {
          blendPixel(dst, di, src, di, r, g, b, a, mix);
        }
      }
    }

    if (scope === 'image') {
      const rectXmax = Math.min(W, rect.x + rect.w);
      const rectYmax = Math.min(H, rect.y + rect.h);
      const rectXmin = Math.max(0, rect.x);
      const rectYmin = Math.max(0, rect.y);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const di = (y * W + x) * 4;
          if (x < rectXmin || x >= rectXmax || y < rectYmin || y >= rectYmax) {
            dst[di]     = src[di];
            dst[di + 1] = src[di + 1];
            dst[di + 2] = src[di + 2];
            dst[di + 3] = src[di + 3];
          } else {
            dst[di + 3] = src[di + 3];
          }
        }
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
        label: 'Scope',
        options: [
          { value: 'image', label: 'Image' },
          { value: 'layer', label: 'Layer' },
        ],
        value: local.scope === 'layer' ? 'layer' : 'image',
        onChange: (v) => { local.scope = v; onChange({ scope: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Center X', min: 0, max: 100, step: 1,
        value: local.centerX, defaultValue: 50, suffix: '%',
        onChange: (v) => { local.centerX = v; onChange({ centerX: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Center Y', min: 0, max: 100, step: 1,
        value: local.centerY, defaultValue: 50, suffix: '%',
        onChange: (v) => { local.centerY = v; onChange({ centerY: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Radius', min: 0, max: 100, step: 1,
        value: local.radius, defaultValue: 50, suffix: '%',
        onChange: (v) => { local.radius = v; onChange({ radius: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Aspect',
        options: [
          { value: 'preserve', label: 'Preserve' },
          { value: 'free',     label: 'Free' },
        ],
        value: local.aspect,
        onChange: (v) => { local.aspect = v; onChange({ aspect: v }); rebuild(); },
      }));

      if (local.aspect === 'free') {
        root.appendChild(sliderRow({
          label: 'Strength X', min: -100, max: 100, step: 1,
          value: local.strengthX, defaultValue: 50,
          onChange: (v) => { local.strengthX = v; onChange({ strengthX: v }); },
        }));

        root.appendChild(sliderRow({
          label: 'Strength Y', min: -100, max: 100, step: 1,
          value: local.strengthY, defaultValue: 50,
          onChange: (v) => { local.strengthY = v; onChange({ strengthY: v }); },
        }));
      } else {
        root.appendChild(sliderRow({
          label: 'Strength', min: -100, max: 100, step: 1,
          value: local.strength, defaultValue: 50,
          onChange: (v) => { local.strength = v; onChange({ strength: v }); },
        }));
      }

      root.appendChild(pillGroup({
        label: 'Falloff',
        options: [
          { value: 'spherical',  label: 'Spherical' },
          { value: 'smooth',     label: 'Smooth' },
          { value: 'cone',       label: 'Cone' },
          { value: 'pinch-bell', label: 'Pinch-Bell' },
        ],
        value: local.falloff,
        onChange: (v) => { local.falloff = v; onChange({ falloff: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Sampling',
        options: [
          { value: 'bilinear', label: 'Bilinear' },
          { value: 'nearest',  label: 'Nearest' },
        ],
        value: local.sampling,
        onChange: (v) => { local.sampling = v; onChange({ sampling: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Mix', min: 0, max: 100, step: 1,
        value: local.mix, defaultValue: 100, suffix: '%',
        onChange: (v) => { local.mix = v; onChange({ mix: v }); },
      }));
    }

    rebuild();
    return root;
  },
};

// ---------- samplers ----------

/** Bilinear 4-tap weighted average; clamps at edges. */
function sampleBilinear(src, W, H, x, y) {
  const x0 = clampI(Math.floor(x), 0, W - 1);
  const x1 = clampI(x0 + 1,       0, W - 1);
  const y0 = clampI(Math.floor(y), 0, H - 1);
  const y1 = clampI(y0 + 1,       0, H - 1);
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);

  const i00 = (y0 * W + x0) * 4;
  const i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4;
  const i11 = (y1 * W + x1) * 4;

  const r = blerp(src[i00],     src[i10],     src[i01],     src[i11],     tx, ty);
  const g = blerp(src[i00 + 1], src[i10 + 1], src[i01 + 1], src[i11 + 1], tx, ty);
  const b = blerp(src[i00 + 2], src[i10 + 2], src[i01 + 2], src[i11 + 2], tx, ty);
  const a = blerp(src[i00 + 3], src[i10 + 3], src[i01 + 3], src[i11 + 3], tx, ty);

  return [r | 0, g | 0, b | 0, a | 0];
}

/** Nearest-neighbour; clamps at edges. */
function sampleNearest(src, W, H, x, y) {
  const xi = clampI(Math.round(x), 0, W - 1);
  const yi = clampI(Math.round(y), 0, H - 1);
  const i  = (yi * W + xi) * 4;
  return [src[i], src[i + 1], src[i + 2], src[i + 3]];
}

// ---------- helpers ----------

function blerp(v00, v10, v01, v11, tx, ty) {
  return v00 * (1 - tx) * (1 - ty) +
         v10 * tx       * (1 - ty) +
         v01 * (1 - tx) * ty       +
         v11 * tx       * ty;
}

/** Write warped pixel blended with the original (at `si` in src). */
function blendPixel(dst, di, src, si, r, g, b, a, mix) {
  const inv = 1 - mix;
  dst[di]     = (r * mix + src[si]     * inv) | 0;
  dst[di + 1] = (g * mix + src[si + 1] * inv) | 0;
  dst[di + 2] = (b * mix + src[si + 2] * inv) | 0;
  dst[di + 3] = (a * mix + src[si + 3] * inv) | 0;
}

function clamp(v, lo, hi)  { return v < lo ? lo : v > hi ? hi : v; }
function clampI(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
