// Fisheye — full-frame lens projection.
// Distinct from Bulge (which is localised with centre + falloff): Fisheye
// applies a global radial mapping across the entire content rect, picking
// from one of four classic projection curves (Equidistant / Equisolid /
// Stereographic / Orthographic). Each curve maps the normalised output
// radius t ∈ [0, 1] to a source radius t' ∈ [0, 1] with a different shape;
// `strength` interpolates between identity (0) and full projection (±1).
// Negative strength flips the curve, producing pincushion instead of barrel.

import { sliderRow, sliderRowLg, pillGroup, makeRoot } from '../../shared/ui-helpers.js';
import { createXYPadWidget } from '../../shared/xy-pad-widget.js';

export default {
  id: 'fisheye',
  name: 'Fisheye',
  version: '1.0.0',
  type: 'filter',
  icon: 'circle-dot',
  category: 'distort',
  description: 'Full-frame fisheye lens projection',

  defaultParams() {
    return {
      strength:   60,                // -100..100; +barrel, -pincushion, 0 identity
      zoom:        0,                // -100..100; + = zoom in, - = zoom out
      centerX:    50,                // 0..100% of content rect
      centerY:    50,                // 0..100%
      projection: 'orthographic',    // 'equidistant' | 'equisolid' | 'stereographic' | 'orthographic'
      edgeMode:   'transparent',     // 'clamp' | 'wrap' | 'mirror' | 'transparent'
      aspect:     'square',          // 'square' (min(w,h)/2) | 'frame' (diag/2)
      mix:        100,               // 0..100% blend with original
    };
  },

  process(imageData, params, ctx) {
    const W = imageData.width;
    const H = imageData.height;
    const src = imageData.data;
    const rect = ctx?.contentRect || { x: 0, y: 0, w: W, h: H };

    const strength   = clamp(params.strength ?? 60, -100, 100) / 100;
    const zoom       = clamp(params.zoom     ?? 0,  -100, 100) / 100;
    const cxPct      = clamp(params.centerX  ?? 50, 0, 100) / 100;
    const cyPct      = clamp(params.centerY  ?? 50, 0, 100) / 100;
    const projection = params.projection ?? 'orthographic';
    const edgeMode   = params.edgeMode   ?? 'transparent';
    const aspect     = params.aspect     ?? 'square';
    const mix        = clamp(params.mix ?? 100, 0, 100) / 100;

    // Short-circuit: nothing to do.
    if (Math.abs(strength) < 1e-6 && Math.abs(zoom) < 1e-6) return imageData;
    if (mix < 1e-6) return imageData;

    const out = new ImageData(W, H);
    const dst = out.data;
    dst.set(src);

    const cx = rect.x + cxPct * rect.w;
    const cy = rect.y + cyPct * rect.h;

    // Normalisation radius. Square = the symmetric inscribed disc; Frame =
    // half-diagonal so the corners reach t = 1 exactly. Square stretches the
    // projection along the longer axis; Frame gives a uniform circular feel.
    const rMax = aspect === 'frame'
      ? 0.5 * Math.hypot(rect.w, rect.h)
      : 0.5 * Math.min(rect.w, rect.h);

    const invRMax = 1 / Math.max(rMax, 1e-6);
    // zoom > 0 → sample from closer to centre (visual zoom-in); use 2^(-zoom)
    // so the slider feels symmetric around 0.
    const zoomFactor = Math.pow(2, -zoom);
    const warp = warpForProjection(projection);

    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(W, Math.ceil (rect.x + rect.w));
    const y1 = Math.min(H, Math.ceil (rect.y + rect.h));
    if (x1 <= x0 || y1 <= y0) return out;

    const sample = makeSampler(edgeMode);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const di = (y * W + x) * 4;

        let sx, sy;
        if (r < 1e-6) {
          sx = cx;
          sy = cy;
        } else {
          const t = r * invRMax;
          // Beyond the unit disc: only zoom applies; projection stays linear so
          // the warp doesn't fold corners onto themselves.
          const tEff = Math.min(1, t);
          const w = warp(tEff);
          const warpedT = tEff + strength * (w - tEff);
          const radiusFactor = (t > 1 ? 1 : (warpedT / tEff)) * zoomFactor;
          sx = cx + dx * radiusFactor;
          sy = cy + dy * radiusFactor;
        }

        const px = sample(src, W, H, sx, sy);
        if (mix >= 1) {
          dst[di]     = px[0];
          dst[di + 1] = px[1];
          dst[di + 2] = px[2];
          dst[di + 3] = px[3];
        } else {
          const inv = 1 - mix;
          dst[di]     = (px[0] * mix + src[di]     * inv) | 0;
          dst[di + 1] = (px[1] * mix + src[di + 1] * inv) | 0;
          dst[di + 2] = (px[2] * mix + src[di + 2] * inv) | 0;
          dst[di + 3] = (px[3] * mix + src[di + 3] * inv) | 0;
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

      root.appendChild(createXYPadWidget({
        x: local.centerX ?? 50,
        y: local.centerY ?? 50,
        defaultX: 50,
        defaultY: 50,
        onChange: ({ x, y }) => {
          local.centerX = x;
          local.centerY = y;
          onChange({ centerX: x, centerY: y });
        },
      }));

      root.appendChild(sliderRowLg({
        label: 'Strength', min: -100, max: 100, step: 1,
        value: local.strength, defaultValue: 60,
        onChange: (v) => { local.strength = v; onChange({ strength: v }); },
      }));

      root.appendChild(sliderRow({
        label: 'Zoom', min: -100, max: 100, step: 1,
        value: local.zoom, defaultValue: 0, suffix: '%',
        onChange: (v) => { local.zoom = v; onChange({ zoom: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Projection',
        options: [
          { value: 'equidistant',   label: 'Equidist.'    },
          { value: 'equisolid',     label: 'Equisolid'    },
          { value: 'stereographic', label: 'Stereo.'      },
          { value: 'orthographic',  label: 'Ortho.'       },
        ],
        value: local.projection,
        onChange: (v) => { local.projection = v; onChange({ projection: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Aspect',
        options: [
          { value: 'square', label: 'Square' },
          { value: 'frame',  label: 'Frame'  },
        ],
        value: local.aspect,
        onChange: (v) => { local.aspect = v; onChange({ aspect: v }); },
      }));

      root.appendChild(pillGroup({
        label: 'Edge',
        options: [
          { value: 'transparent', label: 'Transparent' },
          { value: 'clamp',       label: 'Clamp'       },
          { value: 'wrap',        label: 'Wrap'        },
          { value: 'mirror',      label: 'Mirror'      },
        ],
        value: local.edgeMode,
        onChange: (v) => { local.edgeMode = v; onChange({ edgeMode: v }); },
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

// ---------- projection curves ----------
// Each maps t ∈ [0, 1] → t' ∈ [0, 1] with f(0)=0, f(1)=1. All sit ABOVE the
// identity line in (0, 1) so positive strength reads as "barrel" and negative
// reads as "pincushion" consistently. The curves differ in WHERE the bulge
// peaks — orthographic is steepest near 0, stereographic is the gentlest of
// the four (closest to identity).

function warpForProjection(p) {
  switch (p) {
    case 'equidistant':   return (t) => Math.pow(t, 0.75);
    case 'equisolid':     return (t) => Math.SQRT2 * Math.sin(t * Math.PI / 4);
    case 'stereographic': return (t) => 2 * t / (1 + t);
    case 'orthographic':
    default:              return (t) => Math.sin(t * Math.PI / 2);
  }
}

// ---------- samplers w/ edge mode ----------

function makeSampler(edgeMode) {
  switch (edgeMode) {
    case 'clamp':       return sampleClamp;
    case 'wrap':        return sampleWrap;
    case 'mirror':      return sampleMirror;
    case 'transparent':
    default:            return sampleTransparent;
  }
}

function sampleClamp(src, W, H, x, y) {
  return bilinear(src, W, H, x, y, clampCoord);
}
function sampleWrap(src, W, H, x, y) {
  return bilinear(src, W, H, x, y, wrapCoord);
}
function sampleMirror(src, W, H, x, y) {
  return bilinear(src, W, H, x, y, mirrorCoord);
}
function sampleTransparent(src, W, H, x, y) {
  if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return [0, 0, 0, 0];
  return bilinear(src, W, H, x, y, clampCoord);
}

function bilinear(src, W, H, x, y, edge) {
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const tx = x - xf;
  const ty = y - yf;
  const x0 = edge(xf,     W);
  const x1 = edge(xf + 1, W);
  const y0 = edge(yf,     H);
  const y1 = edge(yf + 1, H);
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

function blerp(v00, v10, v01, v11, tx, ty) {
  const a = v00 * (1 - tx) + v10 * tx;
  const b = v01 * (1 - tx) + v11 * tx;
  return a * (1 - ty) + b * ty;
}

function clampCoord(v, n) { return v < 0 ? 0 : v >= n ? n - 1 : v; }
function wrapCoord(v, n)  { const m = ((v % n) + n) % n; return m | 0; }
function mirrorCoord(v, n) {
  const period = 2 * n;
  let m = ((v % period) + period) % period;
  if (m >= n) m = period - 1 - m;
  return m | 0;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
