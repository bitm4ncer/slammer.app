// Layer factories. Pure data shapes — no DOM/Konva references here.

const DEFAULT_TRANSFORM = () => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });

export function createImageLayer({ id, name, source, naturalSize, transform } = {}) {
  return {
    id,
    type: 'image',
    name: name || 'Image Layer',
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
    source: source || null,           // Blob | DataURL | string URL
    naturalSize: naturalSize || null, // { w, h } once decoded
  };
}

export function createTextLayer({ id, name, text, transform } = {}) {
  return {
    id,
    type: 'text',
    name: name || 'Text Layer',
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
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
