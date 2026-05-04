# slammer.app — Agent Guide

> This file is for AI coding agents. Expect the reader to know nothing about the project.

## Project Overview

**slammer.app** is a multi-layer image editor for slamming, glitching, and dithering. It runs entirely in the browser as a single-page app with no backend.

Key characteristics:
- **Konva-based** free canvas with pan, zoom, and drag-to-transform layers.
- **Non-destructive per-layer effect stacks** — each layer can carry an ordered list of effects (filters and tools).
- **VST-like plugin system** — effects are registered ES modules with a standard manifest. New effects appear automatically in the UI once imported and registered in `src/main.js`.
- **Typography layer** — text rendered to an offscreen canvas, rasterized into the same pixel pipeline as images, with per-character tracking and word-wrapping text-box mode.
- **IndexedDB project storage** with autosave, thumbnail capture, and a project-browser modal.
- **Affinity Photo 2 bridge** via SSE + JSON-RPC 2.0 to Affinity's bundled MCP server (default endpoint `http://localhost:6767/sse`).

The project was forked from a v0.5 single-image tool (`CRUSH_app`). Legacy `.crushproj` files and old `crush:*` localStorage / IndexedDB stores are migrated automatically on first launch.

## Technology Stack

- **Language**: Vanilla JavaScript (ES modules, no transpiler needed).
- **Build tool**: [Vite](https://vitejs.dev/) v5.4.10.
- **Runtime target**: `es2020`.
- **Canvas / rendering**: [Konva](https://konvajs.org/) v9.3.16 (2D canvas abstraction).
- **DOM drag-sorting**: [SortableJS](https://sortablejs.github.io/Sortable/) v1.15.2.
- **Styling**: Plain CSS with custom properties (design tokens in `src/style/variables.css`).
- **No UI framework** — DOM is built and updated imperatively. Keep it that way unless a phase explicitly introduces one.

## Build & Dev Commands

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # Static production build → dist/
npm run preview  # Serve the built dist/
```

Vite config (`vite.config.js`) uses `base: './'` so the app can be opened from `file://` or any subpath. `outDir` is `dist`.

## Directory Structure

```
src/
  core/           # Document model, layer factories, renderer, history
  ui/             # Canvas view, panels, toolbar, modals, notifications
  plugins/
    registry.js   # Plugin register / lookup / validator
    plugin-contract.md
    filters/      # Compact effects: invert, brightness, contrast, levels, blur
    tools/        # VST-style effects: dithering, jpeg-compression, pixelsort
    shared/       # UI helpers for plugin controls (sliders, pills, selects, colours)
  io/             # IndexedDB project store, .slammerproj import/export, PNG export
  integrations/
    affinity/     # SSE + JSON-RPC bridge to Affinity Photo 2
  style/          # CSS variables, layout, components, plastic-texture effects
  main.js         # Bootstrap: register plugins, init document / renderer / UI, wire history + autosave
```

## Architecture Patterns

### Document → Renderer → Konva

- **`src/core/document.js`** — The single source of truth. A factory function `createDocument()` returns an observable state container with methods like `addImageLayer`, `setLayerTransform`, `addEffect`, `setEffectParams`, etc.
- **Pub/sub events** — Document emits typed events (`layer:added`, `effect:propChanged`, `doc:loaded`, …). UI and renderer subscribe to react precisely.
- **`src/core/renderer.js`** — Bridges the document to Konva. Maintains per-layer state (`layerState` Map) containing the Konva `Group`, `Image`, offscreen canvases, and an **effect cache** (`steps[]`).
- **Effect caching** — Each effect slot caches its output `ImageData`. Mutating params, enabled state, or order of an effect sets `dirtyFromIndex` to the lowest changed index; the renderer re-runs only from that point forward. Earlier cached steps are reused untouched.
- **Text rasterization** — Text layers have no DOM editable element on the canvas. Instead `renderer.js` rasterizes text to an offscreen canvas (with tracking, alignment, word-wrap, and filter-safe padding) and feeds the resulting `ImageData` into the same effect pipeline as images.

### History (Undo / Redo)

- `src/core/history.js` implements undo/redo via **full document snapshots**.
- Snapshots are JSON-cloned, but Blob refs are preserved by re-attaching them by index (Blobs are immutable).
- **Debounced commits**: property changes (sliders, transforms) are debounced (default 600 ms) so a drag becomes one history entry. Structural changes (add/remove/reorder) flush pending commits and capture immediately.
- Capacity defaults to 80 snapshots.

### Plugin System

- Plugins default-export a manifest object with `id`, `name`, `type` (`'filter'`|`'tool'`|`'generator'`), `icon`, `category`, `defaultParams()`, `process(imageData, params)`, and `renderUI(params, onChange)`.
- **Filters** render as compact rows inside the effect stack. **Tools** render as expanded panels (only one tool expanded at a time per layer).
- `process()` must be a pure function of `(imageData, params)`. It may mutate or replace the input `ImageData`.
- UI helpers live in `src/plugins/shared/ui-helpers.js`: `sliderRow`, `pillGroup`, `selectRow`, `colorRow`, `makeRoot`, `makeToolRoot`.
- See `src/plugins/plugin-contract.md` for the full spec and caching contract.

### Storage & I/O

- **IndexedDB** (`slammer` database, `projects` object store) holds full project documents.
- **localStorage** holds a lightweight project index (`slammer:projects`) and the current project id (`slammer:current`).
- **Settings** (`slammer:settings`) persist accent colour, autosave delay, and custom-layer-colours toggle.
- **Autosave** — debounced by `autosaveMs` (default 800 ms). A status dot in the footer shows `dirty → saving → saved`.
- **`.slammerproj`** — Self-contained JSON with embedded data URLs. Drop onto canvas to import. Legacy `.crushproj` is still accepted.
- **Migration** — On first launch, `crush:*` localStorage keys and the old `crush` IndexedDB are copied into `slammer:*` / `slammer` if the new ones are empty.

### Affinity Bridge

- `src/integrations/affinity/index.js` connects to Affinity Photo 2's MCP SSE endpoint.
- **Send** pushes the active layer (or full visible composition) as a new pixel layer into the active Affinity document.
- **Pull** renders the selected Affinity layer to RGBA8, base64-encodes it, and adds it as a new image layer.
- The MCP URL can be overridden with Shift+click on Connect (stored in `slammer:affinityMcpUrl`).

## Code Style Guidelines

Follow the existing conventions:

- **Filenames**: lowercase, kebab-case (`canvas-view.js`, `ui-helpers.js`).
- **Factories over classes**: use `export function createXyz({ ... })` returning a plain object of methods and getters. No classes for core modules.
- **Semicolons**: present in most files; keep them consistent with the surrounding file.
- **Quotes**: single quotes for JS strings; backticks for template literals.
- **Event types**: kebab-namespaced, e.g. `layer:propChanged`, `effect:added`, `doc:loaded`.
- **DOM IDs**: prefixed with the feature, e.g. `btnSave`, `affLed`, `layerList`.
- **CSS classes**: BEM-ish with double dashes for modifiers (`tb-btn--icon`, `tool-btn`, `effect-item`, `is-tool`, `expanded`).
- **CSS custom properties**: used heavily for theming. `--primary` is the app accent; `--ctx-accent` is dynamically set per active layer (gated by the "Custom layer colours" setting).
- **Konva node naming**: layer groups have `name: 'slammer-layer'` and `_slammerLayerId` for back-reference.
- **Comments**: concise, above the relevant block. Use `// ---------- Section ----------` for major breaks.
- **No external dependencies** beyond Konva, SortableJS, and Vite. Avoid adding new npm packages for small utilities.

## Testing

There is **no automated test suite** currently. Verification is manual: launch the dev server, exercise the feature in browser, and regression-check previous phases (see `roadmap.md`). If you add a test framework, wire it through `package.json` scripts and document it here.

## Security Considerations

- **All client-side** — there is no server, auth, or secrets file. API keys for future integrations (e.g. Replicate) will live in the Settings popup and be stored in localStorage.
- **XSS mitigation**: UI modules escape user content (`escape()` helper in `layer-panel.js` and `project-menu.js`). Maintain this when rendering user-controlled strings (layer names, project names).
- **CORS**: Image sources may be Blobs, data URLs, or remote URLs. `loadImageBitmap` sets `crossOrigin = 'anonymous'` for string URLs.
- **No eval or inline scripts** beyond the Konva/Vite module bundle.

## Adding a New Effect

1. Create a folder under `src/plugins/filters/` (compact) or `src/plugins/tools/` (expanded panel).
2. Write `index.js` that default-exports a valid manifest (see `plugin-contract.md`).
3. Import it in `src/main.js` and pass it to `registerPlugin()`.
4. The effect appears automatically in the **Effects** panel add menu.

## Useful Reference Files

| Topic | File |
|-------|------|
| Bootstrap & wiring | `src/main.js` |
| Document model & events | `src/core/document.js` |
| Layer data shapes | `src/core/layer.js` |
| Renderer + effect cache | `src/core/renderer.js` |
| Undo/redo | `src/core/history.js` |
| Plugin manifest spec | `src/plugins/plugin-contract.md` |
| Plugin registry | `src/plugins/registry.js` |
| Plugin UI primitives | `src/plugins/shared/ui-helpers.js` |
| Project storage (IndexedDB) | `src/io/project-store.js` |
| Project file import/export | `src/io/project-file.js` |
| PNG export | `src/io/export-png.js` |
| Affinity bridge | `src/integrations/affinity/index.js` |
| Canvas view (pan/zoom/drop) | `src/ui/canvas-view.js` |
| Layer panel | `src/ui/layer-panel.js` |
| Effect panel | `src/ui/effect-panel.js` |
| Toolbar & shortcuts | `src/ui/toolbar.js` |
| Settings popup | `src/ui/settings-popup.js` |
| Roadmap / planned phases | `roadmap.md` |
