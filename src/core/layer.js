// Layer factories. Pure data shapes — no DOM/Konva references here.

const DEFAULT_TRANSFORM = () => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });

// Random pastel — saturated enough to read on dark UI, light enough to feel "tagged".
export function randomPastelHex() {
  const h = Math.floor(Math.random() * 360);
  const s = 55 + Math.floor(Math.random() * 20); // 55–75 %
  const l = 72 + Math.floor(Math.random() * 10); // 72–82 %
  return hslToHex(h, s, l);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const v = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function createImageLayer({ id, name, source, naturalSize, transform, accentColor } = {}) {
  return {
    id,
    type: 'image',
    name: name || 'Image Layer',
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    accentColor: accentColor || randomPastelHex(),
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
    source: source || null,           // Blob | DataURL | string URL
    naturalSize: naturalSize || null, // { w, h } once decoded
  };
}

export function createTextLayer({ id, name, text, transform, accentColor } = {}) {
  return {
    id,
    type: 'text',
    name: name || 'Text Layer',
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    accentColor: accentColor || randomPastelHex(),
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
    text: {
      value: 'Type here',
      font: 'Chicago',
      size: 96,
      weight: 400,
      color: '#FFFFFF',
      align: 'left',
      letterSpacing: 0,
      lineHeight: 1.2,
      ...(text || {}),
    },
  };
}

export const BLEND_MODES = [
  'source-over', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
];
