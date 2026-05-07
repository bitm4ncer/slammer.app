// Twirl — inverse-warp distortion.
// For each output pixel, compute its distance + angle from the center.
// Pixels inside `radius` are rotated by `angle * falloff(distance)`.
// Pixels outside radius are left unchanged.
//
// Centre + radius are anchored to ctx.contentRect (the original unpadded
// content) so adding other expanding effects to the same layer doesn't
// shift this effect's focal point. Original alpha is restored after the
// warp so the silhouette stays put.

import { sliderRow, pillGroup, toggleRow, makeRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'twirl',
  name: 'Twirl',
  version: '1.0.0',
  type: 'filter',
  icon: 'arrows-spin',
  category: 'distort',
  pro: true,
  pack: 'liquid-pack',

  defaultParams() {
    return {
      scope:    'image',  // 'image' (default) | 'layer'
      angle:    180,      // -1080..1080°
      centerX:  50,       // 0..100%
      centerY:  50,       // 0..100%
      radius:   50,       // 0..100% of min(w,h)
      falloff:  'smooth', // 'smooth' | 'linear' | 'hard' | 'bell'
      sampling: 'bilinear',  // 'bilinear' | 'nearest'
      inverse:  false,    // twist starts at edge, calm in center
    };
  },

  process(imageData, params, ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;

    const scope = params.scope === 'layer' ? 'layer' : 'image';
    const rect  = (scope === 'image' && ctx?.contentRect)
      ? ctx.contentRect
      : { x: 0, y: 0, w: W, h: H };

    const angle    = (params.angle    ?? 180)  * (Math.PI / 180);
    const centerX  = rect.x + clamp(params.centerX ?? 50, 0, 100) / 100 * rect.w;
    const centerY  = rect.y + clamp(params.centerY ?? 50, 0, 100) / 100 * rect.h;
    const radius   = clamp(params.radius  ?? 50, 0, 100) / 100 * Math.min(rect.w, rect.h);
    const falloff  = params.falloff  ?? 'smooth';
    const sampling = params.sampling ?? 'bilinear';
    const inverse  = params.inverse  ?? false;

    // Short-circuit: zero angle or zero radius → pass-through.
    if (Math.abs(angle) < 1e-6 || radius < 0.5) return imageData;

    // Phase 1: copy source straight through. Phase 2 only touches pixels
    // inside the warp bbox AND inside the radius circle.
    const out = new ImageData(W, H);
    const dst = out.data;
    dst.set(src);

    const xMin = Math.max(0, Math.max(rect.x,                Math.floor(centerX - radius)));
    const yMin = Math.max(0, Math.max(rect.y,                Math.floor(centerY - radius)));
    const xMax = Math.min(W, Math.min(rect.x + rect.w,       Math.ceil (centerX + radius)));
    const yMax = Math.min(H, Math.min(rect.y + rect.h,       Math.ceil (centerY + radius)));

    if (xMax <= xMin || yMax <= yMin) return out;

    const radiusSq = radius * radius;
    const Wm = W - 1, Hm = H - 1;
    const useNearest = sampling === 'nearest';

    // === Cos/Sin LUT ===
    // The slow part used to be `atan2 + cos + sin` per pixel. We can replace
    // those with a 2D rotation matrix: rotating (dx, dy) by `-angle * f(t)`
    // around the origin gives sx/sy directly.
    //   sx = cx + dx * cosR - dy * sinR
    //   sy = cy + dx * sinR + dy * cosR
    // f(t) only depends on the integer pixel distance from the centre, so we
    // can precompute (cosR, sinR) once per integer distance bucket. Per-pixel
    // cost drops to one sqrt + two array reads.
    const lutSize = (radius | 0) + 2;
    const lutCos  = new Float32Array(lutSize);
    const lutSin  = new Float32Array(lutSize);
    const falloffFn = makeFalloffFn(falloff);
    const invRadius = 1 / radius;
    for (let d = 0; d < lutSize; d++) {
      const t = Math.min(1, d * invRadius);
      let f = falloffFn(t);
      if (inverse) f = 1 - f;
      const rot = -angle * f;
      lutCos[d] = Math.cos(rot);
      lutSin[d] = Math.sin(rot);
    }

    for (let y = yMin; y < yMax; y++) {
      for (let x = xMin; x < xMax; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) continue;

        // Integer-bucket lookup (good enough — 1-pixel quantisation is below
        // perceptual threshold for falloff).
        const d = Math.sqrt(distSq) | 0;
        const cosR = lutCos[d];
        const sinR = lutSin[d];
        const sx = centerX + dx * cosR - dy * sinR;
        const sy = centerY + dx * sinR + dy * cosR;

        const di = (y * W + x) << 2;

        if (useNearest) {
          let nx = sx + 0.5; let ny = sy + 0.5;
          if (nx < 0) nx = 0; else if (nx > Wm) nx = Wm;
          if (ny < 0) ny = 0; else if (ny > Hm) ny = Hm;
          const si = ((ny | 0) * W + (nx | 0)) << 2;
          dst[di]     = src[si];
          dst[di + 1] = src[si + 1];
          dst[di + 2] = src[si + 2];
        } else {
          let cx = sx; let cy = sy;
          if (cx < 0) cx = 0; else if (cx > Wm) cx = Wm;
          if (cy < 0) cy = 0; else if (cy > Hm) cy = Hm;
          const x0 = cx | 0, y0 = cy | 0;
          const x1 = x0 < Wm ? x0 + 1 : Wm;
          const y1 = y0 < Hm ? y0 + 1 : Hm;
          const fx = cx - x0, fy = cy - y0;
          const w00 = (1 - fx) * (1 - fy);
          const w10 = fx * (1 - fy);
          const w01 = (1 - fx) * fy;
          const w11 = fx * fy;
          const i00 = (y0 * W + x0) << 2;
          const i10 = (y0 * W + x1) << 2;
          const i01 = (y1 * W + x0) << 2;
          const i11 = (y1 * W + x1) << 2;
          dst[di]     = src[i00]     * w00 + src[i10]     * w10 + src[i01]     * w01 + src[i11]     * w11;
          dst[di + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
          dst[di + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
        }

        // For 'image' scope, dst[di+3] is already src[di+3] (silhouette
        // preserved). For 'layer' scope, overwrite alpha with sampled alpha
        // so the warp can pull alpha out of the silhouette into the pad.
        if (scope === 'layer') {
          if (useNearest) {
            let nx = sx + 0.5; let ny = sy + 0.5;
            if (nx < 0) nx = 0; else if (nx > Wm) nx = Wm;
            if (ny < 0) ny = 0; else if (ny > Hm) ny = Hm;
            const si = ((ny | 0) * W + (nx | 0)) << 2;
            dst[di + 3] = src[si + 3];
          } else {
            let cx = sx; let cy = sy;
            if (cx < 0) cx = 0; else if (cx > Wm) cx = Wm;
            if (cy < 0) cy = 0; else if (cy > Hm) cy = Hm;
            const x0 = cx | 0, y0 = cy | 0;
            const x1 = x0 < Wm ? x0 + 1 : Wm;
            const y1 = y0 < Hm ? y0 + 1 : Hm;
            const fx = cx - x0, fy = cy - y0;
            const w00 = (1 - fx) * (1 - fy);
            const w10 = fx * (1 - fy);
            const w01 = (1 - fx) * fy;
            const w11 = fx * fy;
            const i00 = (y0 * W + x0) << 2;
            const i10 = (y0 * W + x1) << 2;
            const i01 = (y1 * W + x0) << 2;
            const i11 = (y1 * W + x1) << 2;
            dst[di + 3] = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
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
        label: 'Angle', min: -1080, max: 1080, step: 1,
        value: local.angle, defaultValue: 180, suffix: '°',
        onChange: (v) => { local.angle = v; onChange({ angle: v }); },
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
        label: 'Falloff',
        options: [
          { value: 'smooth', label: 'Smooth' },
          { value: 'linear', label: 'Linear' },
          { value: 'hard',   label: 'Hard' },
          { value: 'bell',   label: 'Bell' },
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

      root.appendChild(toggleRow({
        label: 'Inverse',
        value: local.inverse,
        onChange: (v) => { local.inverse = v; onChange({ inverse: v }); },
      }));
    }

    rebuild();
    return root;
  },
};

// Falloff factor f ∈ [0, 1] from t (normalised distance 0..1).
// Returned as a closure so the inner loop has zero branching.
function makeFalloffFn(name) {
  const PI = Math.PI;
  switch (name) {
    case 'linear': return (t) => 1 - t;
    case 'hard':   return ()  => 1;
    case 'bell':   return (t) => Math.sin(PI * t);
    case 'smooth':
    default:       return (t) => 0.5 * (1 + Math.cos(PI * t));
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
