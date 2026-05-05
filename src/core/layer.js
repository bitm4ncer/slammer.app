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
      font: 'Inter',
      provider: 'google',    // 'system' | 'google' | 'fontshare' | 'uploaded'
      size: 96,
      weight: 400,
      color: '#FFFFFF',
      align: 'left',
      letterSpacing: 0,
      lineHeight: 1.2,
      mode: 'text',          // 'text' (free-flow) | 'textBox' (word-wrap to boxWidth)
      boxWidth: 600,         // pixels — only used when mode === 'textBox'
      bold: false,           // forces weight → 700 (or variable wght 700) when true
      italic: false,         // applies font-style: italic in the font shorthand
      underline: false,      // draws an underline beneath the text
      strike: false,         // draws a strike-through line through the text
      transform: 'none',     // 'none' | 'uppercase' | 'lowercase' | 'capitalize' (CSS text-transform)
      variation: {},         // OpenType axes for variable fonts: { wght, wdth, slnt, opsz, ... }
      features: {            // OpenType feature toggles (kern + liga ON by default)
        kern: true,
        liga: true,
      },
      ...(text || {}),
    },
  };
}

// FX (Adjustment) layer — has no own pixels. Its "source" is the composite of
// all layers BELOW it. Its effect stack is then applied to that composite.
// Affinity Live-filter style: non-destructive, affects everything beneath.
export function createFxLayer({ id, name, transform, accentColor } = {}) {
  return {
    id,
    type: 'fx',
    name: name || 'FX Layer',
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    accentColor: accentColor || randomPastelHex(),
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
  };
}

export const BLEND_MODES = [
  'source-over', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
];
