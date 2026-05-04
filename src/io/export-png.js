// Export the visible composition as a PNG download.

import { showNotification } from '../ui/notifications.js';

export function exportVisibleAsPng({ renderer, document: doc, transparent = true }) {
  const canvas = renderer.flattenVisible({ background: transparent ? null : '#1e1e1e' });
  if (!canvas) {
    showNotification('Nothing visible to export', 2200);
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.state.name || 'crush'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotification('PNG exported');
  }, 'image/png');
}
