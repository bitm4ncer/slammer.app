# slammer.app

```
+---------------------------------------------------------------+
|  s l a m m e r . a p p                                v.1.0.1 |
|  multi-layer image editor for slamming, glitching, dithering  |
+---------------------------------------------------------------+
```

A browser-native graphics editor built around layers, non-destructive
effects and a VST-like plugin system. Vector tools, pro typography,
generative AI plugins. No backend.

**Live: https://bitm4ncer.github.io/slammer.app/**


## Features

```
+-- Layers ----------------------------------------------------+
|  Image   - drop / paste / drag-from-disk                     |
|  Text    - 2000+ Google + Fontshare fonts, variable axes     |
|  Vector  - shapes, pen, pencil, SVG import, boolean ops      |
|  FX      - destructive composite layer for stacked effects   |
+--------------------------------------------------------------+

+-- Effect engine ---------------------------------------------+
|  Per-layer non-destructive effect stack                      |
|  Step-level cache - tweak a late filter, earlier ones reuse  |
|  Drag to reorder, click to disable, expand for params        |
+--------------------------------------------------------------+

+-- Vector tools ----------------------------------------------+
|  Pen + Pencil with bezier handles                            |
|  Anchor edits: alt-click smooth/corner, double-click insert  |
|  Boolean ops: unite / subtract / intersect / exclude / divide|
|  Outline Stroke, Simplify, Smooth, Reverse, Open/Close, Join |
|  Solid + gradient + gradient-along-stroke fills              |
|  Drag-drop SVG import with multi-path layers                 |
|  Text -> Path conversion via opentype.js                     |
+--------------------------------------------------------------+

+-- Typography -----------------------------------------------+
|  Provider filter: System / Google / Fontshare / Uploaded     |
|  Variable-font axes (wght, wdth, opsz, slnt, ...)            |
|  OpenType features: ligatures, kerning, stylistic sets       |
|  Upload your own .ttf/.otf/.woff2 (stored in IndexedDB)      |
|  Free-flow text + word-wrap text-box mode + justified align  |
+--------------------------------------------------------------+

+-- Plugins (Phase 16) ----------------------------------------+
|  Unsplash    - search + favorites + folders                  |
|  Pexels      - search + favorites + folders                  |
|  fal.ai      - 15-model curated browser, schema-driven forms |
|  Floating VST-style windows, drag from layer to AI input     |
|  Pin to sidebar, multiple windows open at once               |
+--------------------------------------------------------------+

+-- Workspace ------------------------------------------------+
|  Infinite canvas with pan / zoom / Konva transform           |
|  Frame-export model - work freely, choose format on export   |
|  Project autosave to IndexedDB (debounced)                   |
|  .slmr / .slammerproj export and drag-drop import            |
|  Affinity Photo 2 bridge over MCP (SSE + JSON-RPC)           |
+--------------------------------------------------------------+
```


## Tech stack

```
+--- Runtime ---------------------------- Version --+
|  Vanilla JS (ES modules, no transpiler)           |
|  Vite                                  ^5.4.10    |
|  Target                                ES2020     |
+--- Rendering -------------------------------------+
|  Konva                                 ^9.3.16    |
|  Paper.js                              ^0.12.18   |
|  paperjs-offset                        ^1.0.8     |
+--- Typography ------------------------------------+
|  opentype.js                           ^1.3.5     |
|  Local Font Access API                 (Chromium) |
+--- Storage ---------------------------------------+
|  IndexedDB (projects, fonts, plugin favorites)    |
|  localStorage (settings, indexes, API keys)       |
|  fflate                                ^0.8.2     |
+--- AI / Plugins ----------------------------------+
|  @fal-ai/client                        ^1.10.1    |
|  Unsplash + Pexels REST                           |
+--- Misc ------------------------------------------+
|  SortableJS                            ^1.15.2    |
+---------------------------------------------------+
```


## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static build to dist/
npm run preview      # serve the built dist/
```


## Workflow at a glance

```
+-----------------------+----------------------------------------+
|  Action               |  How                                   |
+-----------------------+----------------------------------------+
|  Add image            |  Toolbar 'Image', or drop on canvas    |
|  Add text             |  Toolbar 'Text', edit in Typo panel    |
|  Vector shape         |  Toolbar 'Shape' flyout                |
|  Pen tool             |  P  - click to add, drag for curves    |
|  Pencil tool          |  B  - freehand, slider for smoothness  |
|  Direct selection     |  A  - click anchor, drag handles       |
|  Move tool            |  V                                     |
|  Pan                  |  Space + drag, or middle-mouse drag    |
|  Zoom                 |  Mouse wheel (zoom-to-pointer)         |
|  Reorder layers       |  Drag rows in the Layer Stack          |
|  Add effect           |  '+' on the Effects panel header       |
|  Reorder effects      |  Drag the grip handle on a row         |
|  Delete layer         |  Trash icon, or Delete key             |
|  Save project         |  Toolbar 'Save' (autosaves on change)  |
|  Open project         |  Toolbar 'Open' -> modal grid          |
|  Export PNG           |  Toolbar 'Export'                      |
|  Export project file  |  Shift + 'Export'                      |
|  Import project file  |  Drag .slmr / .slammerproj on canvas   |
|  Plugin window        |  Sidebar 'Plugins' -> click to open    |
|  Connect Affinity     |  Footer 'Connect' (Affinity must run)  |
+-----------------------+----------------------------------------+
```


## Architecture

```
src/
  core/           document, layer, renderer, history (model)
  ui/             canvas-view, panels, toolbar, modals
    vector-tools/   pen, pencil, anchor-overlay, path-actions, ...
    typography/     font-sources, uploaded-fonts, system-fonts
  plugins/
    registry.js     manifest validator + lookup
    plugin-contract.md
    filters/        invert, brightness, contrast, levels, blur, ...
    tools/          dithering, jpeg-compression, pixelsort, ...
    panels/         unsplash, pexels, falai (Phase 16)
    shared/         UI helpers (sliders, pills, dropzones, ...)
  io/             project-store (IndexedDB), project-file, export-png
  integrations/
    affinity/       SSE + JSON-RPC bridge to Affinity Photo 2 MCP
  style/          variables, layout, components, vector, plugin
  main.js         bootstrap: register plugins, init doc/renderer/UI
```

The renderer keeps a per-layer effect cache (one ImageData per slot)
so tweaking a late-stage filter doesn't re-run earlier ones - see
`src/plugins/plugin-contract.md` for the caching contract.


## Plugins

Default-export an ES module manifest with `id`, `name`, `type`
(`filter` | `tool` | `generator` | `panel`), `process` and
`renderUI`. Import + register in `src/main.js`. The plugin appears
automatically in the Effects add menu (or the Plugins sidebar for
panel plugins). See `src/plugins/plugin-contract.md` for the spec.


## Deployment

`main` is auto-deployed to GitHub Pages by `.github/workflows/deploy.yml`
on every push. The Vite base path is `/slammer.app/` for production
builds and `./` for dev so the dev server still works from any subpath.


## Roadmap

See `roadmap.md` for the phased rebuild plan. Phases 1-13c shipped;
Phase 13d (multi-layer marquee select + slider-driven simplify) and
Phase 14 (brush engine) are next.


## History

Forked from the v0.5 single-image tool that lived at `CRUSH_app`.
v1 is the layered Konva rewrite. Legacy `crush:*` localStorage keys
and the old IndexedDB store are migrated automatically on first launch;
`.crushproj` files still import transparently.
