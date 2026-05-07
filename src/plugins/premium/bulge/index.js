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
      centerX:   50,           // 0..100%
      centerY:   50,           // 0..100%
      radius:    50,           // 0..100% of min(w,h)
      strength:  50,           // -100..100; positive = bulge out, negative = pinch in
      falloff:   'spherical',  // 'spherical' | 'smooth' | 'cone' | 'pinch-bell'
      aspect:    'preserve',   // 'preserve' | 'free'
      strengthX: 50,           // -100..100 (only used when aspect = 'free')
      strengthY: 50,           // -100..100 (only used when aspect = 'free')
      sampling:  'bilinear',   // 'bilinear' | 'nearest'
    };
  },

  process(imageData, params, ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const rect = ctx?.contentRect || { x: 0, y: 0, w: W, h: H };

    const centerX   = rect.x + clamp(params.centerX  ?? 50, 0, 100) / 100 * rect.w;
    const centerY   = rect.y + clamp(params.centerY  ?? 50, 0, 100) / 100 * rect.h;
    const radius    = clamp(params.radius   ?? 50, 0, 100) / 100 * Math.min(rect.w, rect.h);
    const strength  = clamp(params.strength ?? 50, -100, 100) / 100;
    const falloff   = params.falloff  ?? 'spherical';
    const aspect    = params.aspect   ?? 'preserve';
    const strengthX = clamp(params.strengthX ?? 50, -100, 100) / 100;
    const strengthY = clamp(params.strengthY ?? 50, -100, 100) / 100;
    const sampling  = params.sampling ?? 'bilinear';

    // Short-circuit: zero radius or zero strength → pass-through.
    if (radius < 0.5) return imageData;
    if (aspect === 'preserve' && Math.abs(strength) < 1e-6) return imageData;
    if (aspect === 'free' && Math.abs(strengthX) < 1e-6 && Math.abs(strengthY) < 1e-6) return imageData;

    const out = new ImageData(W, H);
    const dst = out.data;
    // Pixels outside the affected disc / content rect are unchanged. Mirror
    // twirl's pattern: copy once, then only touch the bbox below.
    dst.set(src);

    // Bbox = canvas ∩ content-rect ∩ (centerX,centerY ± radius).
    const xMin = Math.max(0, Math.max(rect.x,              Math.floor(centerX - radius)));
    const yMin = Math.max(0, Math.max(rect.y,              Math.floor(centerY - radius)));
    const xMax = Math.min(W, Math.min(rect.x + rect.w,     Math.ceil (centerX + radius)));
    const yMax = Math.min(H, Math.min(rect.y + rect.h,     Math.ceil (centerY + radius)));
    if (xMax <= xMin || yMax <= yMin) return out;

    // === Falloff LUT ===
    // f depends only on the normalised distance t = d/radius, so we can
    // precompute it once per integer pixel-distance bucket. Per-pixel cost
    // collapses to one sqrt + one array read.
    const radiusSq = radius * radius;
    const lutSize = (radius | 0) + 2;
    const lutF = new Float32Array(lutSize);
    const PI = Math.PI;
    const invRadius = 1 / radius;
    for (let d = 0; d < lutSize; d++) {
      const t = Math.min(1, d * invRadius);
      let f;
      switch (falloff) {
        case 'smooth':     f = 0.5 * (1 + Math.cos(PI * t)); break;
        case 'cone':       f = 1 - t;                        break;
        case 'pinch-bell': f = Math.sin(PI * t);             break;
        case 'spherical':
        default:           f = 1 - Math.sqrt(1 - t * t);     break;
      }
      lutF[d] = f;
    }

    const sampleFn = sampling === 'nearest' ? sampleNearest : sampleBilinear;
    const useFree = aspect === 'free';

    // Geometry note: the original code computed
    //   preserve: sx = cx + dx * (1/dist) * dist * (1 - f*strength) = cx + dx * (1 - f*strength)
    //   free:     sx = cx + dx - (dx/dist) * dist * f * strengthX = cx + dx * (1 - f*strengthX)
    // — `dist` cancels out, so we don't need it for the source-coord
    // computation, only for the LUT index.
    for (let y = yMin; y < yMax; y++) {
      for (let x = xMin; x < xMax; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) continue;

        const d = Math.sqrt(distSq) | 0;
        const f = lutF[d];

        let sx, sy;
        if (useFree) {
          sx = centerX + dx * (1 - f * strengthX);
          sy = centerY + dy * (1 - f * strengthY);
        } else {
          const k = 1 - f * strength;
          sx = centerX + dx * k;
          sy = centerY + dy * k;
        }

        const [r, g, b] = sampleFn(src, W, H, sx, sy);
        const di = (y * W + x) * 4;
        dst[di]     = r;
        dst[di + 1] = g;
        dst[di + 2] = b;
        // dst[di + 3] stays = src[di + 3] from the initial dst.set(src).
      }
    }

    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { ...this.defaultParams(), ...params };

    function rebuild() {
      root.innerHTML = '';

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
