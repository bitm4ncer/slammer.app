// Datamosh — composable real glitch effects (no random pixel displacement).
//
// Four independent intensity sliders, applied in order:
//   1. JPEG Glitch  — encode at high quality, bit-flip the entropy segment
//                     between SOS (FFDA) and EOI (FFD9), decode.
//                     Skips marker bytes (0xFF) + stuffed-escape slots so the
//                     decoder doesn't reject the stream. Real "datamosh" look:
//                     coloured block-streams cascading downward.
//   2. Channel Shift — offset R/G/B channels by independent amounts (RGB ghosting).
//   3. Bit Plane    — XOR raw RGBA bytes with a swept stripe pattern. Low slider
//                     = noise on the LSBs; high slider = wild colour banding.
//   4. Byte Skew    — shift the read offset into the pixel buffer by N bytes,
//                     so R reads where G was, G reads where B was, etc.
//                     Produces a cascading colour wave.
//
// All operations are real data-domain glitches, not displacement-of-pixels.

import { sliderRow, makeToolRoot } from '../../shared/ui-helpers.js';
import { cacheGet, cacheSet, buildCacheKey } from './cache.js';

export default {
  id: 'datamosh',
  name: 'Datamosh',
  version: '1.0.0',
  type: 'tool',
  icon: 'bug',
  category: 'glitch',

  defaultParams() {
    return {
      jpegGlitch: 30,    // 0-100 — entropy-segment bit-flips
      channelShift: 0,   // 0-100 — R/G/B per-channel offset
      bitPlane: 0,       // 0-100 — XOR raw bytes with sweep
      byteSkew: 0,       // 0-100 — shift pixel-byte read offset
      seed: 1,           // 1-99 — re-roll which bytes get flipped (stable across reloads)
    };
  },

  async process(imageData, params) {
    const W = imageData.width, H = imageData.height;
    const seed = Math.max(1, Math.floor(params.seed ?? 1));
    let work = imageData;

    // 1. JPEG bit-flip glitch (only path that needs an encode/decode round-trip).
    //    Cached by (input content hash + glitch params) so the SAME glitch is
    //    reproduced across page reloads. Cache lives in IndexedDB under
    //    'slammer.datamosh-cache'.
    const jpegGlitch = clamp(params.jpegGlitch ?? 0, 0, 100) / 100;
    if (jpegGlitch > 0) work = await applyJpegGlitch(work, jpegGlitch, seed);

    // 2. RGB channel shift.
    const channelShift = clamp(params.channelShift ?? 0, 0, 100) / 100;
    if (channelShift > 0) work = applyChannelShift(work, channelShift, W, H);

    // 3. Bit plane XOR.
    const bitPlane = clamp(params.bitPlane ?? 0, 0, 100) / 100;
    if (bitPlane > 0) work = applyBitPlane(work, bitPlane);

    // 4. Byte skew.
    const byteSkew = clamp(params.byteSkew ?? 0, 0, 100) / 100;
    if (byteSkew > 0) work = applyByteSkew(work, byteSkew);

    return work;
  },

  renderUI(params, onChange) {
    const root = makeToolRoot();
    root.appendChild(sliderRow({
      label: 'JPEG Glitch', min: 0, max: 100, step: 1,
      value: params.jpegGlitch ?? 30, defaultValue: 30, suffix: '%',
      onChange: (v) => onChange({ jpegGlitch: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Channel Shift', min: 0, max: 100, step: 1,
      value: params.channelShift ?? 0, defaultValue: 0, suffix: '%',
      onChange: (v) => onChange({ channelShift: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Bit Plane', min: 0, max: 100, step: 1,
      value: params.bitPlane ?? 0, defaultValue: 0, suffix: '%',
      onChange: (v) => onChange({ bitPlane: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Byte Skew', min: 0, max: 100, step: 1,
      value: params.byteSkew ?? 0, defaultValue: 0, suffix: '%',
      onChange: (v) => onChange({ byteSkew: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Seed', min: 1, max: 99, step: 1,
      value: params.seed ?? 1, defaultValue: 1,
      onChange: (v) => onChange({ seed: v }),
    }));
    return root;
  },
};

// ===================== Helpers =====================
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function makeOffscreen(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasToJpegBlob(canvas, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// --------- 1. JPEG entropy-segment bit-flip ---------
async function applyJpegGlitch(imageData, intensity, seed) {
  const W = imageData.width, H = imageData.height;

  // Cache lookup — keyed by input content + glitch params. If the glitched JPEG
  // bytes are already in IndexedDB, decode and return — same glitch every time.
  const paramsSig = `j${Math.round(intensity * 1000)}-s${seed}`;
  const cacheKey = buildCacheKey(imageData, paramsSig);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const bitmap = await createImageBitmap(cached);
      const dst = makeOffscreen(W, H);
      dst.getContext('2d').drawImage(bitmap, 0, 0, W, H);
      bitmap.close?.();
      return dst.getContext('2d').getImageData(0, 0, W, H);
    } catch { /* fall through to recompute */ }
  }

  const src = makeOffscreen(W, H);
  src.getContext('2d').putImageData(imageData, 0, 0);

  // High encode quality so the underlying image stays intact — the slider only
  // controls how much of the entropy segment we corrupt.
  const blob = await canvasToJpegBlob(src, 0.92);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const sos = findMarker(buf, 0xDA);
  const eoi = findMarkerFromEnd(buf, 0xD9);
  if (sos < 0 || eoi < 0 || eoi - sos < 64) return imageData;

  const start = sos + 12;          // skip past SOS header
  const end = eoi - 4;
  if (end <= start + 16) return imageData;

  // Fixed mutation count + fixed seed — fully deterministic from (intensity, seed).
  // No dependency on `region`, so encoder byte-drift can't shuffle the result.
  const region = end - start;
  const count = Math.max(1, Math.floor(intensity ** 1.5 * 64));
  const rand = mulberry32(0xA1B2C3D4 ^ Math.floor(intensity * 1000) ^ (seed * 31));

  // Pre-roll fractional positions so the rand sequence doesn't depend on retries.
  const fractions = [];
  for (let i = 0; i < count; i++) fractions.push(rand());
  const flips = [];
  for (let i = 0; i < count; i++) flips.push(1 + Math.floor(rand() * 255));

  const out = buf.slice();
  for (let k = 0; k < count; k++) {
    let i = start + Math.floor(fractions[k] * region);
    // Walk forward until we hit a flippable byte (skip markers + stuffed escapes).
    let guard = 0;
    while (guard < 16 && (out[i] === 0xFF || (i > 0 && out[i - 1] === 0xFF))) {
      i++;
      if (i >= end) i = start;
      guard++;
    }
    out[i] ^= flips[k];
  }

  let resultBlob = null;
  let resultBytes = null;
  try {
    resultBlob = new Blob([out], { type: 'image/jpeg' });
    const bitmap = await createImageBitmap(resultBlob);
    const dst = makeOffscreen(W, H);
    dst.getContext('2d').drawImage(bitmap, 0, 0, W, H);
    bitmap.close?.();
    resultBytes = dst.getContext('2d').getImageData(0, 0, W, H);
  } catch {
    // Decoder rejected the corrupted stream — return the un-corrupted JPEG round-trip.
    resultBlob = blob;
    const cleanBitmap = await createImageBitmap(blob);
    const dst = makeOffscreen(W, H);
    dst.getContext('2d').drawImage(cleanBitmap, 0, 0);
    cleanBitmap.close?.();
    resultBytes = dst.getContext('2d').getImageData(0, 0, W, H);
  }

  // Cache the JPEG bytes (small) — survives page reload.
  cacheSet(cacheKey, resultBlob).catch(() => {});
  return resultBytes;
}

function findMarker(buf, code) {
  for (let i = 2; i < buf.length - 1; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === code) return i;
  }
  return -1;
}
function findMarkerFromEnd(buf, code) {
  for (let i = buf.length - 2; i >= 0; i--) {
    if (buf[i] === 0xFF && buf[i + 1] === code) return i;
  }
  return -1;
}

// --------- 2. RGB channel shift ---------
function applyChannelShift(imageData, amount, W, H) {
  // Offsets scale with slider — max ±8 % of width / height per channel.
  const maxOff = Math.max(1, Math.round(Math.min(W, H) * 0.08));
  const dx = Math.round(amount * maxOff);
  const dy = Math.round(amount * maxOff * 0.4);
  const src = imageData.data;
  const out = new ImageData(W, H);
  const od = out.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Red shifted +dx; Green unchanged; Blue shifted -dx (and a vertical nudge for variety).
      const ri = (clampIdx(y, H) * W + clampIdx(x - dx, W)) * 4;
      const bi = (clampIdx(y - dy, H) * W + clampIdx(x + dx, W)) * 4;
      od[i]     = src[ri];
      od[i + 1] = src[i + 1];
      od[i + 2] = src[bi + 2];
      od[i + 3] = src[i + 3];
    }
  }
  return out;
}
function clampIdx(v, max) { return v < 0 ? 0 : v >= max ? max - 1 : v; }

// --------- 3. Bit plane XOR ---------
function applyBitPlane(imageData, intensity) {
  // Map intensity to a bit-mask depth: 0.0 → 0x01 (LSB only), 1.0 → 0xFF (all bits).
  const mask = Math.max(1, Math.round(intensity * 255));
  const W = imageData.width;
  const data = imageData.data;
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Sweep pattern across X — diagonal stripes that XOR the chosen bit-plane.
      const sweep = ((x + y * 3) & mask);
      data[i]     ^= sweep;
      data[i + 1] ^= sweep;
      data[i + 2] ^= sweep;
    }
  }
  return imageData;
}

// --------- 4. Byte skew ---------
function applyByteSkew(imageData, intensity) {
  // Shift the read offset by N bytes (1..3 within the RGBA quartet, scaled to
  // intensity). Reading R from where G was etc. produces a cascading colour wave.
  const skew = Math.max(1, Math.round(intensity * 3));
  const data = imageData.data;
  const len = data.length;
  const out = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i += 4) {
    out[i]     = data[(i + skew)     % len];
    out[i + 1] = data[(i + skew + 1) % len];
    out[i + 2] = data[(i + skew + 2) % len];
    out[i + 3] = data[i + 3];
  }
  data.set(out);
  return imageData;
}
