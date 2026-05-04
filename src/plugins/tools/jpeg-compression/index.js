// JPEG Compression — uses the BROWSER'S REAL JPEG encoder via
// canvas.convertToBlob({ type: 'image/jpeg', quality }).
//
// Two controls:
//   Quality     1–100 % — passed straight to the encoder. Lower = harsher artefacts.
//   Resolution  5–100 % — image is resampled down to this percentage BEFORE encoding,
//                          then nearest-neighbour upscaled back to original size.
//                          Lower values give larger, blockier JPEG artefacts.

import { sliderRow, makeToolRoot } from '../../shared/ui-helpers.js';

export default {
  id: 'jpeg-compression',
  name: 'JPEG Compression',
  version: '3.1.0',
  type: 'tool',
  icon: 'compress',
  category: 'glitch',

  defaultParams() {
    return {
      quality: 5,        // %, very low → strong artefacts at first add
      resolution: 100,   // % of original, 100 = no resample
      glitch: 0,         // %, datamosh-style entropy-segment bit-flips, 0 = clean
    };
  },

  async process(imageData, params) {
    const W = imageData.width, H = imageData.height;
    const quality = clamp(params.quality ?? 5, 1, 100) / 100;
    const resolution = clamp(params.resolution ?? 100, 5, 100) / 100;
    const glitch = clamp(params.glitch ?? 0, 0, 100) / 100;

    // ImageData → source canvas.
    const srcCanvas = makeOffscreen(W, H);
    srcCanvas.getContext('2d').putImageData(imageData, 0, 0);

    // Optional pre-pass: resample down (creates larger JPEG blocks after upsample).
    let workCanvas = srcCanvas;
    if (resolution < 1) {
      const sw = Math.max(2, Math.floor(W * resolution));
      const sh = Math.max(2, Math.floor(H * resolution));
      const small = makeOffscreen(sw, sh);
      const sctx = small.getContext('2d');
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'low';
      sctx.drawImage(workCanvas, 0, 0, sw, sh);
      workCanvas = small;
    }

    // Encode → (optional bit-flip) → decode through the browser's real JPEG codec.
    let blob = await canvasToJpegBlob(workCanvas, quality);
    if (glitch > 0) blob = await datamoshBlob(blob, glitch, params._seed);
    const bitmap = await createImageBitmap(blob);
    const decoded = makeOffscreen(bitmap.width, bitmap.height);
    decoded.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close?.();

    // Upsample back to W×H if we downscaled (nearest-neighbour for crisp blocks).
    let finalCanvas = decoded;
    if (decoded.width !== W || decoded.height !== H) {
      const out = makeOffscreen(W, H);
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(decoded, 0, 0, decoded.width, decoded.height, 0, 0, W, H);
      finalCanvas = out;
    }

    return finalCanvas.getContext('2d').getImageData(0, 0, W, H);
  },

  renderUI(params, onChange) {
    const root = makeToolRoot();
    root.appendChild(sliderRow({
      label: 'Quality', min: 1, max: 100, step: 1,
      value: params.quality ?? 5, defaultValue: 5, suffix: '%',
      onChange: (v) => onChange({ quality: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Resolution', min: 5, max: 100, step: 1,
      value: params.resolution ?? 100, defaultValue: 100, suffix: '%',
      onChange: (v) => onChange({ resolution: v }),
    }));
    root.appendChild(sliderRow({
      label: 'Glitch', min: 0, max: 100, step: 1,
      value: params.glitch ?? 0, defaultValue: 0, suffix: '%',
      onChange: (v) => onChange({ glitch: v }),
    }));
    return root;
  },
};

// ---------- Helpers ----------
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

// ---------- Datamosh: bit-flip the entropy-coded segment ----------
// Real-deal JPEG glitch. We locate the Start-Of-Scan marker (0xFFDA), then
// XOR random bytes between (SOS-payload-end) and (EOI). Bytes that are 0xFF
// or that follow a 0xFF are skipped — those are markers / stuffed escapes,
// touching them tends to break the decoder rather than glitch it.
//
// `intensity` is 0–1 — controls what fraction of the entropy segment to mutate.
async function datamoshBlob(blob, intensity, seed) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const sos = findSOS(buf);
  const eoi = findEOI(buf);
  if (sos < 0 || eoi < 0 || eoi - sos < 64) return blob;

  // SOS payload starts after the 12-byte SOS header (typical for baseline JPEG).
  const start = sos + 12;
  const end = eoi - 4;
  if (end <= start + 16) return blob;

  // Cap mutation count: never more than 1 % of the entropy region. Small numbers
  // give crisp block-streams; high numbers turn into noise. The slider scales
  // exponentially so the low end stays usable.
  const region = end - start;
  const maxMutations = Math.max(1, Math.floor(region * 0.01));
  const count = Math.max(1, Math.floor(intensity ** 1.5 * maxMutations));

  const rand = mulberry32(((seed | 0) || 0x9E3779B1) ^ (count * 131));
  const out = buf.slice();
  let mutated = 0;
  let attempts = 0;
  while (mutated < count && attempts < count * 8) {
    attempts++;
    const i = start + Math.floor(rand() * region);
    if (out[i] === 0xFF) continue;       // marker byte
    if (i > 0 && out[i - 1] === 0xFF) continue; // stuffed-byte slot after a marker
    // XOR a non-zero random byte so each flip is meaningful.
    const flip = 1 + Math.floor(rand() * 255);
    out[i] ^= flip;
    mutated++;
  }
  return new Blob([out], { type: 'image/jpeg' });
}

function findSOS(buf) {
  for (let i = 2; i < buf.length - 1; i++) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xDA) return i;
  }
  return -1;
}
function findEOI(buf) {
  for (let i = buf.length - 2; i >= 0; i--) {
    if (buf[i] === 0xFF && buf[i + 1] === 0xD9) return i;
  }
  return -1;
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
