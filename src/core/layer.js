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

// `parentGroupId` is the inverse of `Group.childIds` — a non-null value
// means this layer is a member of a Group layer with that id. Renderer
// uses it to skip standalone rendering (the group renders the composite)
// and to nest Konva.Groups so parent transforms cascade automatically.
const COMMON_LAYER = (opts = {}) => ({
  visible: true,
  opacity: 1,
  blendMode: 'source-over',
  locked: false,
  parentGroupId: opts.parentGroupId || null,
});

export function createImageLayer({ id, name, source, naturalSize, transform, accentColor, parentGroupId } = {}) {
  return {
    id,
    type: 'image',
    name: name || 'Image Layer',
    ...COMMON_LAYER({ parentGroupId }),
    accentColor: accentColor || randomPastelHex(),
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
    source: source || null,           // Blob | DataURL | string URL
    naturalSize: naturalSize || null, // { w, h } once decoded
  };
}

export function createTextLayer({ id, name, text, transform, accentColor, parentGroupId } = {}) {
  return {
    id,
    type: 'text',
    name: name || 'Text Layer',
    ...COMMON_LAYER({ parentGroupId }),
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

// Vector layer — holds an array of paths, each with its own fill + stroke.
// Paths are stored as SVG path-data strings so the format is portable + tiny;
// Paper.js hydrates them at paint time for boolean ops, hit-testing, etc.
//
// fill / stroke shapes:
//   { type: 'solid',    color: '#fff', opacity: 1 }
//   { type: 'gradient', gradientType: 'linear'|'radial',
//                       stops: [{ at: 0, color: '#fff' }, { at: 1, color: '#000' }],
//                       from: { x, y }, to: { x, y } }   // in path-local coords
//   { type: 'none' }
//
// stroke also carries: width, align ('center'|'inside'|'outside'),
//                      cap ('butt'|'round'|'square'), join ('miter'|'round'|'bevel'),
//                      dash [], alongPath (boolean — gradient follows direction)
export function createVectorLayer({ id, name, transform, accentColor, vector, parentGroupId } = {}) {
  return {
    id,
    type: 'vector',
    name: name || 'Vector Layer',
    ...COMMON_LAYER({ parentGroupId }),
    accentColor: accentColor || randomPastelHex(),
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
    naturalSize: null,        // filled by the renderer after first paint (bbox of paths)
    vector: {
      paths: [],              // array of { d, closed, fill, stroke }
      ...(vector || {}),
    },
    // Vector-only effect stack — run on the path geometry BEFORE rasterise.
    // Distinct from the pixel-level `effects` array (which still runs on
    // the rasterised ImageData). Plugins of type 'vector-filter' land
    // here. Each entry: { id, pluginId, enabled, expanded, params }.
    vectorEffects: [],
  };
}

export const DEFAULT_VECTOR_FILL = () => ({ type: 'solid', color: '#FFFFFF', opacity: 1 });
export const DEFAULT_VECTOR_STROKE = () => ({
  type: 'none',
  color: '#000000', width: 2,
  align: 'center', cap: 'butt', join: 'miter',
  dash: [], alongPath: false, opacity: 1,
});

// FX (Adjustment) layer — has no own pixels. Its "source" is the composite of
// all layers BELOW it. Its effect stack is then applied to that composite.
// Affinity Live-filter style: non-destructive, affects everything beneath.
export function createFxLayer({ id, name, transform, accentColor, parentGroupId } = {}) {
  return {
    id,
    type: 'fx',
    name: name || 'FX Layer',
    ...COMMON_LAYER({ parentGroupId }),
    accentColor: accentColor || randomPastelHex(),
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
  };
}

// Group — wraps N children of any type. Has its own transform (cascades
// to children via Konva nesting), pixel `effects[]` (applied to the
// composite), and `vectorEffects[]` (only meaningful when every
// descendant is a vector layer; the panel hides the section otherwise).
export function createGroupLayer({ id, name, accentColor, transform, childIds, expanded, parentGroupId } = {}) {
  return {
    id,
    type: 'group',
    name: name || 'Group',
    ...COMMON_LAYER({ parentGroupId }),
    accentColor: accentColor || randomPastelHex(),
    transform: { ...DEFAULT_TRANSFORM(), ...(transform || {}) },
    effects: [],
    vectorEffects: [],
    childIds: Array.isArray(childIds) ? childIds.slice() : [],
    expanded: expanded !== false,
  };
}

// Returns true when `group` is a Group layer AND every recursive
// descendant resolves to a vector layer. Lookups go through `findLayer`
// (passed in) so this stays usable from both the doc + renderer.
export function isVectorOnlyGroup(group, findLayer) {
  if (!group || group.type !== 'group') return false;
  const ids = group.childIds || [];
  if (!ids.length) return false;
  for (const id of ids) {
    const child = findLayer(id);
    if (!child) continue;
    if (child.type === 'vector') continue;
    if (child.type === 'group' && isVectorOnlyGroup(child, findLayer)) continue;
    return false;
  }
  return true;
}

export const BLEND_MODES = [
  'source-over', 'multiply', 'screen', 'overlay',
  'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion',
];
