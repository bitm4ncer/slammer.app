// Image export — supports PNG / JPEG / WebP, transparent / solid / CMYK background,
// scale multiplier, and either the visible-bbox region, the doc's configured export
// frame, or a single active layer rasterised via renderer.rasterizeLayerToBlob.

import { showNotification } from '../ui/notifications.js';

export function exportVisibleAsPng({ renderer, document: doc, transparent = true }) {
  exportImage({
    renderer,
    document: doc,
    region: 'visible',
    format: 'png',
    background: transparent ? null : '#1e1e1e',
  });
}

// ── CMYK soft-proof helpers ──────────────────────────────────────────────────
// Naive perceptual conversion (no ICC profile). Good enough for v1 print-proof.

function rgbToCmyk(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return [0, 0, 0, 1];
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return [c, m, y, k];
}

function cmykToRgb(c, m, y, k) {
  return [
    Math.round(255 * (1 - c) * (1 - k)),
    Math.round(255 * (1 - m) * (1 - k)),
    Math.round(255 * (1 - y) * (1 - k)),
  ];
}

function applyCmykSoftProof(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const [c, m, y, k] = rgbToCmyk(d[i], d[i + 1], d[i + 2]);
    const [r2, g2, b2] = cmykToRgb(c, m, y, k);
    d[i] = r2; d[i + 1] = g2; d[i + 2] = b2;
    // alpha unchanged
  }
  ctx.putImageData(imgData, 0, 0);
}

// ── Alpha-bbox crop (E5) ─────────────────────────────────────────────────────
// Scans a canvas for non-transparent pixels, returns a new canvas cropped to
// the bounding box of those pixels (composited onto bg). Returns null if fully
// transparent.

function cropToAlphaBbox(srcCanvas, bgColor) {
  const ctx = srcCanvas.getContext('2d');
  const { width: w, height: h } = srcCanvas;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = d[(y * w + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // fully transparent

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  const octx = out.getContext('2d');
  if (bgColor) {
    octx.fillStyle = bgColor;
    octx.fillRect(0, 0, cw, ch);
  }
  octx.drawImage(srcCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

// ── Main export function ─────────────────────────────────────────────────────

export async function exportImage({
  renderer,
  document: doc,
  region = 'visible',           // 'visible' | 'frame' | 'active-layer'
  format = 'png',               // 'png' | 'jpeg' | 'webp'
  quality = 0.92,               // jpeg/webp only, 0-1
  scale = 1,
  background = null,            // null | hex string
  colorSpace = 'rgba',          // 'rgba' | 'cmyk'
  filename,
  activeLayerId,
  activeLayerName,
} = {}) {
  const mime = format === 'jpeg' ? 'image/jpeg'
             : format === 'webp' ? 'image/webp'
             : 'image/png';
  const ext  = format === 'jpeg' ? 'jpg'
             : format === 'webp' ? 'webp'
             : 'png';

  // ── Resolve filename ───────────────────────────────────────────────────────
  let baseName;
  if (region === 'active-layer' && activeLayerName) {
    // Sanitise to filename-safe chars
    baseName = activeLayerName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'layer';
  } else {
    baseName = filename || doc.state.name || 'slammer';
  }
  const finalName = baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;

  // ── E4: Active-layer path ──────────────────────────────────────────────────
  if (region === 'active-layer') {
    if (!activeLayerId) {
      showNotification('No active layer selected');
      return;
    }

    const blob = await renderer.rasterizeLayerToBlob(activeLayerId, {
      mimeType: mime,
      quality: Math.max(0.01, Math.min(1, quality)),
    });
    if (!blob) {
      showNotification('Could not rasterise active layer');
      return;
    }

    // For E5: JPEG + transparent background → alpha-crop before encoding
    if (format === 'jpeg' && !background) {
      // We need the canvas to apply the crop — re-rasterise as PNG first
      const pngBlob = await renderer.rasterizeLayerToBlob(activeLayerId, {
        mimeType: 'image/png',
        quality: 1,
      });
      if (pngBlob) {
        const img = await createImageBitmap(pngBlob);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = img.width; tmpCanvas.height = img.height;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(img, 0, 0);

        const cropped = cropToAlphaBbox(tmpCanvas, '#ffffff');
        if (cropped) {
          if (colorSpace === 'cmyk') applyCmykSoftProof(cropped);
          cropped.toBlob((croppedBlob) => {
            if (!croppedBlob) { showNotification('Export failed'); return; }
            triggerDownload(croppedBlob, finalName, cropped.width, cropped.height, ext);
          }, mime, Math.max(0.01, Math.min(1, quality)));
          return;
        }
      }
    }

    // Standard active-layer export (no alpha-crop needed)
    if (colorSpace === 'cmyk') {
      // Re-rasterise as PNG, apply CMYK, re-encode
      const pngBlob2 = await renderer.rasterizeLayerToBlob(activeLayerId, {
        mimeType: 'image/png',
        quality: 1,
      });
      if (pngBlob2) {
        const img2 = await createImageBitmap(pngBlob2);
        const tmpCanvas2 = document.createElement('canvas');
        tmpCanvas2.width = img2.width; tmpCanvas2.height = img2.height;
        tmpCanvas2.getContext('2d').drawImage(img2, 0, 0);
        applyCmykSoftProof(tmpCanvas2);
        tmpCanvas2.toBlob((b) => {
          if (!b) { showNotification('Export failed'); return; }
          triggerDownload(b, finalName, tmpCanvas2.width, tmpCanvas2.height, ext);
        }, mime, Math.max(0.01, Math.min(1, quality)));
        return;
      }
    }

    triggerDownload(blob, finalName, null, null, ext);
    return;
  }

  // ── Frame / visible path ───────────────────────────────────────────────────
  let regionRect = null;
  if (region === 'frame') {
    const f = doc.state?.exportFrame;
    if (!f || !(f.w > 0) || !(f.h > 0)) {
      showNotification('No export frame set');
      return;
    }
    regionRect = { x: f.x ?? 0, y: f.y ?? 0, w: f.w, h: f.h };
  }

  const canvas = renderer.flattenVisible({
    background: format === 'jpeg' && (!background || background === 'transparent') ? '#ffffff' : background,
    region: regionRect,
    scale,
  });
  if (!canvas) {
    showNotification('Nothing visible to export');
    return;
  }

  if (colorSpace === 'cmyk') applyCmykSoftProof(canvas);

  const onBlob = (blob) => {
    if (!blob) { showNotification('Export failed'); return; }
    triggerDownload(blob, finalName, canvas.width, canvas.height, ext);
  };

  if (format === 'png') canvas.toBlob(onBlob, mime);
  else canvas.toBlob(onBlob, mime, Math.max(0.01, Math.min(1, quality)));
}

function triggerDownload(blob, name, w, h, ext) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const dims = (w && h) ? ` (${w} × ${h})` : '';
  showNotification(`${ext.toUpperCase()} exported${dims}`);
}
