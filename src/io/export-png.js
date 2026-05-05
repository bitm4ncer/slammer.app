// Image export — supports PNG / JPEG, transparent / solid background,
// scale multiplier, and either the visible-bbox region or the doc's
// configured export frame.

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

export function exportImage({
  renderer,
  document: doc,
  region = 'visible',           // 'visible' | 'frame'
  format = 'png',               // 'png' | 'jpeg'
  quality = 0.92,               // jpeg only, 0-1
  scale = 1,
  background = null,            // null | 'transparent' | hex
  filename,
} = {}) {
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

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const baseName = filename || doc.state.name || 'slammer';
  const finalName = baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;

  const onBlob = (blob) => {
    if (!blob) { showNotification('Export failed'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotification(`${ext.toUpperCase()} exported (${canvas.width} × ${canvas.height})`);
  };

  if (format === 'jpeg') canvas.toBlob(onBlob, mime, Math.max(0.01, Math.min(1, quality)));
  else canvas.toBlob(onBlob, mime);
}
