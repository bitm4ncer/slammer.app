# CRUSH Plugin Contract (v1)

A plugin is an ES module that default-exports a single object describing one
non-destructive effect node that can sit on a layer's effect stack.

The same contract covers Tools, Filters, and Generators — the only functional
difference is how `effect-panel.js` mounts the UI and (for generators) how the
result feeds back into the document.

## Manifest

```js
export default {
  id: 'dithering',                // string, stable, globally unique
  name: 'Dithering',              // string, display name
  version: '1.0.0',               // semver
  type: 'tool' | 'filter' | 'generator',
  icon: 'chess-board',            // FontAwesome name (no `fa-` prefix)
  category: 'crush' | 'adjust' | 'distort' | ...,

  defaultParams() { return { /* ... */ }; },

  // Pure pixel transform. May mutate or replace the input ImageData.
  // The renderer feeds it the previous step's ImageData and stores the
  // returned value as this step's cache. Identical for tool + filter.
  process(imageData, params) {
    return imageData;
  },

  // Build the per-instance UI. Must be a DOM Element.
  // For tools: the element is mounted inside the expanded "tool host" section.
  // For filters: the element is mounted inside a compact "filter host" row.
  // The plugin must call `onChange(patch)` with a partial param patch on every
  // user interaction. The renderer takes care of cache invalidation + redraw.
  renderUI(params, onChange) {
    const root = document.createElement('div');
    /* ... */
    return root;
  },
};
```

## Types

| `type`        | UI                                                | Output                                           |
|---------------|---------------------------------------------------|--------------------------------------------------|
| `'tool'`      | Big "VST" panel; only one expanded at a time      | New ImageData (effect stack step)                |
| `'filter'`    | Compact slider row, always visible in stack       | New ImageData (effect stack step)                |
| `'generator'` | (Phase 11+) Floating modal or toolbar action      | Produces a NEW image layer; not added to a stack |

## Caching contract

The renderer maintains, per layer, an array of cached `ImageData` results — one
slot per effect in `layer.effects`. Mutating any of:

- effect params
- effect `enabled`
- effect order

…sets `dirtyFromIndex` to the lowest changed index. The renderer then walks the
stack from that point forward, feeding each plugin's `process()` the previous
step's cached output. Steps before `dirtyFromIndex` are reused untouched.

Plugins **must not** rely on global state (DOM, window globals, side files).
`process()` is a pure function of `(imageData, params)`.

## UI helpers

The shared module `src/plugins/shared/ui-helpers.js` provides `sliderRow`,
`pillGroup`, `selectRow`, `colorRow`, and `makeRoot`/`makeToolRoot` — use them
to keep visual consistency across plugins. Each helper takes an `onChange`
callback and wires range/number/select inputs together.

## Registering a plugin

Plugins are imported and registered in `src/main.js`:

```js
import myPlugin from './plugins/tools/my-thing/index.js';
import { registerPlugin } from './plugins/registry.js';
registerPlugin(myPlugin);
```

Once registered, the plugin appears in the matching "Add Tool" / "Add Filter"
menu in the side panel.

## Future: Generator type (REAKTOR2 / Vector)

`type: 'generator'` is reserved for plugins that don't transform an existing
layer's pixels but instead produce a new image layer (e.g. a pattern generator
or a vector renderer). A generator's manifest will gain:

```js
{
  type: 'generator',
  // process is replaced by:
  generate(params) { return ImageData; },
  // renderUI is opened in a floating modal instead of inside an effect stack.
}
```

The contract for `generate` is the same as `process` minus the input. Adding
the generator's output as a new image layer is the host's responsibility.

## Future: External (iframe-hosted) plugins

The intent is that an external plugin (e.g. REAKTOR2 served from a different
origin) can satisfy the same contract via `postMessage`. A small shim will wrap
the iframe and translate `process()` / `renderUI()` calls into messages. The
shim is not yet implemented in v0.1 — but because the core contract is pixel-in
/ pixel-out, the shim only needs to handle marshalling and DOM mounting.
