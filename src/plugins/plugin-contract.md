# slammer.app Plugin Contract (v1)

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
  category: 'slam' | 'adjust' | 'distort' | ...,

  defaultParams() { return { /* ... */ }; },

  // Pure pixel transform. May mutate or replace the input ImageData.
  // The renderer feeds it the previous step's ImageData and stores the
  // returned value as this step's cache. Identical for tool + filter.
  //
  // The optional third argument `ctx` carries pipeline-level extras a plugin
  // may need beyond its immediate input:
  //   ctx.sourceImageData — the layer's pre-effect-stack source pixels
  //                         (same dims as `imageData`). Used by Pixel Sort to
  //                         score against the original tones even when
  //                         upstream effects have quantised the buffer.
  // Two-arg plugins keep working — JS ignores the extra argument.
  process(imageData, params, ctx) {
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

### Do NOT add a per-effect Mix / Opacity knob

The effect-stack provides a **slot-level dry/wet slider** on every effect
card automatically. The renderer's `applyEffectsPipeline()` lerps between
the plugin's pure output and the previous step's input via `eff.mix`
(see `src/core/renderer.js`, the `mix < 1` branch around line ~963). Adding
a separate `mix` / `opacity` param inside `defaultParams()` and a Mix slider
inside `renderUI()` is **redundant and inconsistent** — it gives the user
two competing controls that do the same thing.

Effects must produce their **fully-wet output** in `process()`. The slot
mix handles dry/wet for you. If you find yourself adding a `mix` param,
stop and remove it.

## Registering a plugin

Plugins are imported and registered in `src/main.js`:

```js
import myPlugin from './plugins/tools/my-thing/index.js';
import { registerPlugin } from './plugins/registry.js';
registerPlugin(myPlugin);
```

Once registered, the plugin appears in the matching "Add Tool" / "Add Filter"
menu in the side panel.

## Async work — generations that survive window close

Panel plugins that kick off long-running async work (today: fal.ai;
future: inpainting, background-removal, any queued-API plugin) MUST
route the job through `window.__slammer.activeGenerations` instead of
holding the in-flight Promise / AbortController on a `renderUI` closure.
Closing the plugin window is NOT a cancel signal — only an explicit
Cancel click is. The result lands as a layer regardless of whether the
originating window is still open.

### The contract

```js
// 1. CAPTURE input values BEFORE detaching. Forms live inside renderUI's
//    DOM; once the user closes the window, the form is gone. Read the
//    values upfront in the click handler, then start the detached run.
const input = await form.getValues();

// 2. Register the job. The aborter lives here, not on a closure.
const aborter = new AbortController();
const jobId = ctx.activeGenerations.start({
  pluginId: 'my-plugin',
  modelId:  'some-model-id',     // optional; lets renderUI hydrate the
  modelName: 'Some Model',       // matching detail pane on re-open
  label:    'Some Model',
  abort:    () => aborter.abort(),
});

// 3. Detached IIFE — survives window close. Closes use NEVER cancel.
(async () => {
  try {
    const result = await someApi.run({
      input, signal: aborter.signal,
      onProgress: (u) => ctx.activeGenerations.update(jobId, {
        status: u.queued ? 'queued' : 'running',
        queuePos: u.queuePosition ?? null,
        message:  u.message,
      }),
    });
    // Write the result via the GLOBAL facade — not via renderUI closures.
    await window.__slammer.importImage(result.imageUrl, 'My output');
    ctx.notify('Done.');
  } catch (err) {
    if (err.name === 'AbortError') ctx.notify('Cancelled.');
    else ctx.notify(`Failed: ${err.message}`);
  } finally {
    ctx.activeGenerations.end(jobId);
  }
})();
```

### Hydration on re-open

When the user re-opens the plugin mid-generation, `renderUI` runs against
a fresh container. To resume showing the spinner and let the user cancel,
subscribe to the registry inside `renderUI` (or its detail-pane builder)
and look up jobs by `pluginId` (and `modelId` if applicable):

```js
const unsub = ctx.activeGenerations.subscribe((all) => {
  const job = all.find((j) => j.pluginId === MY_PLUGIN_ID && j.modelId === currentModel);
  if (job) {
    setRunning(true);
    setStatus(job.message || 'Working…');
  } else {
    setRunning(false);
  }
});
// Tear the subscriber down when the detail pane is replaced. Stash it
// somewhere your re-render path can find — typical pattern is to store
// it on a DOM node (`detailEl._unsubGen = unsub`) and re-call it before
// rebuilding.
```

### Cancel button

The cancel button does NOT remember its own aborter — it asks the
registry for the current live job and calls its `abort()`. That way the
button works whether the job started in this DOM mount or an earlier one
that's since been torn down.

```js
cancelBtn.addEventListener('click', () => {
  const live = ctx.activeGenerations.list(MY_PLUGIN_ID)[0];
  live?.abort?.();
});
```

### Footer chip

The footer renders a single chip that summarises every active job across
plugins. It auto-shows when the registry is non-empty and clicks-through
to re-open the originating plugin window. No per-plugin work needed —
just `start` / `update` / `end` correctly and the chip handles itself.

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
