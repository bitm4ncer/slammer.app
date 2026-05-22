// Premium plugin catalog — single source of truth for locked previews.
//
// `src/plugins/premium/` is gitignored, so a fresh clone (or a worktree
// without the private premium repo) has zero premium plugins registered.
// The Effect Library still wants to advertise every premium effect with a
// Pro badge so users can discover and purchase what's available — that's
// what this file is for.
//
// At render time the library merges this catalog into the visible list:
// for every entry whose `id` is NOT present in the live registry, the card
// is drawn with a lock badge and a click routes to the Bitmancer Shop
// instead of `onPick`. When a premium plugin IS registered, the live
// manifest wins and these fields are ignored — so this catalog can drift a
// little without breaking real installs.
//
// Keep entries minimal: just enough to render the card. No process(),
// no params — those live in the actual plugin.

export const PREMIUM_CATALOG = [
  {
    id: 'datamosh',
    name: 'Datamosh',
    type: 'tool',
    icon: 'bug',
    category: 'glitch',
    description: 'Datamoshed frame-blend artefacts',
    pack: 'glitch-pack',
  },
  {
    id: 'jpeg-compression',
    name: 'JPEG Compression',
    type: 'tool',
    icon: 'compress',
    category: 'glitch',
    description: 'Crunchy JPEG quantisation artefacts',
    pack: 'glitch-pack',
  },
  {
    id: 'pixelsort',
    name: 'Pixel Sort',
    type: 'tool',
    icon: 'arrow-down-wide-short',
    category: 'glitch',
    description: 'Sort pixel rows by brightness',
    pack: 'glitch-pack',
  },
  {
    id: 'dithering',
    name: 'Dither',
    type: 'tool',
    icon: 'chess-board',
    category: 'glitch',
    description: 'Posterise via ordered or error-diffused dither',
    pack: 'raster-pack',
  },
  {
    id: 'halftone-raster',
    name: 'Halftone Raster',
    type: 'filter',
    icon: 'bullseye',
    category: 'stylize',
    description: 'Stylised halftone over the layer',
    pack: 'raster-pack',
  },
  {
    id: 'bulge',
    name: 'Bulge',
    type: 'filter',
    icon: 'up-right-and-down-left-from-center',
    category: 'distort',
    description: 'Push pixels outward from a centre',
    pack: 'liquid-pack',
  },
  {
    id: 'ripple',
    name: 'Ripple',
    type: 'filter',
    icon: 'bullseye',
    category: 'distort',
    description: 'Concentric wave distortion',
    pack: 'liquid-pack',
  },
  {
    id: 'twirl',
    name: 'Twirl',
    type: 'filter',
    icon: 'arrows-spin',
    category: 'distort',
    description: 'Spiral rotation around a point',
    pack: 'liquid-pack',
  },
  {
    id: 'mesh-gradient',
    name: 'Mesh Gradient',
    type: 'filter',
    icon: 'grip',
    category: 'render',
    description: 'Smooth multi-point colour mesh',
    pack: 'infinity-gradients',
  },
  {
    id: 'organic-gradient',
    name: 'Organic Gradient',
    type: 'filter',
    icon: 'wand-magic-sparkles',
    category: 'render',
    description: 'Painterly noise-shaped gradient',
    pack: 'infinity-gradients',
  },
  {
    id: 'reaktor',
    name: 'Reaktor',
    type: 'filter',
    icon: 'circle-nodes',
    category: 'render',
    description: 'Reaction-diffusion grows from your layer',
    pack: 'generative-pack',
  },
  {
    id: 'slime-mold',
    name: 'Slime Mold',
    type: 'filter',
    icon: 'bacterium',
    category: 'render',
    description: 'Physarum agents feed on your image',
    pack: 'generative-pack',
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope',
    type: 'filter',
    icon: 'snowflake',
    category: 'distort',
    description: 'N-fold mirror with recursive mandala depth',
    pack: 'generative-pack',
  },
  {
    id: 'glyph-destruction',
    name: 'Glyph Destruction',
    type: 'filter',
    icon: 'text-slash',
    category: 'glitch',
    description: 'Melt, fracture and decay text outlines',
    pack: 'glitch-pack',
  },
  {
    id: 'riso-separation',
    name: 'Riso Separation',
    type: 'tool',
    icon: 'layer-group',
    category: 'stylize',
    description: 'Authentic grainy multi-color riso print look',
    pack: 'raster-pack',
  },
];
