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

    const rect = ctx?.contentRect || { x: 0, y: 0, w: W, h: H };

    const angle    = (params.angle    ?? 180)  * (Math.PI / 180);
    const centerX  = rect.x + clamp(params.centerX ?? 50, 0, 100) / 100 * rect.w;
    const centerY  = rect.y + clamp(params.centerY ?? 50, 0, 100) / 100 * rect.h;
    const radius   = clamp(params.radius  ?? 50, 0, 100) / 100 * Math.min(rect.w, rect.h);
    const falloff  = params.falloff  ?? 'smooth';
    const sampling = params.sampling ?? 'bilinear';
    const inverse  = params.inverse  ?? false;

    // Short-circuit: zero angle or zero radius → pass-through.
    if (Math.abs(angle) < 1e-6 || radius < 0.5) return imageData;

    // Phase 1: copy source straight through (single typed-array set call,
    // ~1 ms even on big canvases). Phase 2 then only touches pixels inside
    // the warp bbox AND inside the radius circle — usually 25-50% of the
    // canvas for typical settings.
    const out = new ImageData(W, H);
    const dst = out.data;
    dst.set(src);

    // Warp bbox = intersection of (radius circle bbox) and content rect.
    const xMin = Math.max(0, Math.max(rect.x,                Math.floor(centerX - radius)));
    const yMin = Math.max(0, Math.max(rect.y,                Math.floor(centerY - radius)));
    const xMax = Math.min(W, Math.min(rect.x + rect.w,       Math.ceil (centerX + radius)));
    const yMax = Math.min(H, Math.min(rect.y + rect.h,       Math.ceil (centerY + radius)));

    if (xMax <= xMin || yMax <= yMin) {
      return out;
    }

    const PI = Math.PI;
    const radiusSq = radius * radius;
    const invRadius = 1 / radius;
    const Wm = W - 1, Hm = H - 1;
    const useNearest = sampling === 'nearest';

    // Falloff branch hoisted outside the inner loop via small lookup. Computed
    // once per pixel from t in [0, 1]; the per-pixel work is then just a
    // multiply against `angle` plus the inverse-warp trig.
    const falloffFn = makeFalloffFn(falloff);

    for (let y = yMin; y < yMax; y++) {
      for (let x = xMin; x < xMax; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) continue;

        const dist = Math.sqrt(distSq);
        const t = dist * invRadius;
        let f = falloffFn(t);
        if (inverse) f = 1 - f;

        const srcAngle = Math.atan2(dy, dx) - angle * f;
        const sx = centerX + dist * Math.cos(srcAngle);
        const sy = centerY + dist * Math.sin(srcAngle);

        const di = (y * W + x) << 2;

        if (useNearest) {
          // Nearest-neighbour with edge clamp.
          let nx = sx + 0.5; let ny = sy + 0.5;
          if (nx < 0) nx = 0; else if (nx > Wm) nx = Wm;
          if (ny < 0) ny = 0; else if (ny > Hm) ny = Hm;
          const si = ((ny | 0) * W + (nx | 0)) << 2;
          dst[di]     = src[si];
          dst[di + 1] = src[si + 1];
          dst[di + 2] = src[si + 2];
          // Restore source alpha at this pixel (silhouette preservation).
          // dst[di + 3] is already src[di+3] from the initial dst.set(src).
        } else {
          // Inlined bilinear sample with edge clamp — no function-call
          // overhead, no array allocation, no destructuring.
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
          // Alpha left as the original src[di+3] (already copied).
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
