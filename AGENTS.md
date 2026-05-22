# slammer.app — Agent Guide

> This file is for AI coding agents. Expect the reader to know nothing about the project.

## Project Overview

**slammer.app** is a multi-layer image editor for slamming, glitching, and dithering. It runs entirely in the browser as a single-page app with no backend.

Key characteristics:
- **Konva-based** free canvas with pan, zoom, drag-to-transform layers, snap-to-edge, rulers + guidelines, and a togglable two-tier canvas grid.
- **Non-destructive per-layer effect stacks** — each layer can carry an ordered list of effects (filters and tools).
- **VST-like plugin system** — effects (filters / tools) and floating panel plugins (image browsers, AI generators) are registered ES modules with a standard manifest. New plugins appear automatically in the UI once imported and registered in `src/main.js`.
- **Typography layer** — text rendered to an offscreen canvas with full font management (Google Fonts, Fontshare, uploaded TTF/OTF/WOFF2 in IndexedDB, system fonts via Local Font Access). Variable axes + OpenType features. Text→Path conversion for vector workflows.
- **Vector layer** — Paper.js-backed shapes, pen/pencil tools, anchor + handle editing, boolean ops, path simplify/smooth/reverse, multi-path layers with per-path fill/stroke. Top-left origin convention with locked transform (see CLAUDE.md for the coordinate-system gotchas).
- **IndexedDB project storage** with autosave, thumbnail capture, and a project-browser modal. Plugin-favorites and plugin-folders are also stored here.
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
                  # Plus: floating-window.js, plugin-host.js, snap-rulers.js, canvas-grid.js
                  # Plus: vector-tools/ (pen, pencil, anchor overlay, text-to-path, active-tool registry)
  plugins/
    registry.js     # Plugin register / lookup / validator
    plugin-contract.md
    filters/        # Compact effects: invert, brightness, contrast, levels, blur, posterize, etc.
    tools/          # VST-style effects: dithering, jpeg-compression, pixelsort, etc.
    panels/         # Floating panel plugins: unsplash, pexels, met, falai, etc.
    premium/        # Gitignored — paid plugins (datamosh, halftone, dither, stipple, ...). See CLAUDE.md for setup.
    premium-loader.js  # Auto-discovers premium plugins via import.meta.glob at boot
    shared/         # UI helpers for plugin controls (sliders, pills, selects, colours)
    panels/_shared/ # Shared helpers for panel plugins (drop-zone, layer-card-drag)
  io/             # IndexedDB project store, plugin-store (favorites/folders), .slammerproj import/export, PNG export
  integrations/
    affinity/     # SSE + JSON-RPC bridge to Affinity Photo 2
  style/          # CSS variables, layout, components, plastic-texture effects
  main.js         # Bootstrap: register plugins, init document / renderer / UI, wire history + autosave, set window.__slammer façade
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

- Plugins default-export a manifest object with `id`, `name`, `type` (`'filter'`|`'tool'`|`'generator'`|`'panel'`), `icon`, `category`, `defaultParams()`, `process(imageData, params)`, and `renderUI(params, onChange)`.
- **Filters** render as compact rows inside the effect stack. **Tools** render as expanded panels (only one tool expanded at a time per layer). **Panels** are floating VST-style windows opened via `openPluginWindow(id)` — they have `renderUI(container, ctx)` and skip `process()`.
- `process()` must be a pure function of `(imageData, params)`. It may mutate or replace the input `ImageData`.
- UI helpers live in `src/plugins/shared/ui-helpers.js`: `sliderRow`, `pillGroup`, `selectRow`, `colorRow`, `makeRoot`, `makeToolRoot`.
- Premium plugins (`pack: '<name>-pack'`, `pro: true`) live under `src/plugins/premium/` and are auto-loaded by `premium-loader.js`. The folder is gitignored — see CLAUDE.md for the private-repo workflow.
- See `src/plugins/plugin-contract.md` for the full spec and caching contract.

### Plugin Windows + App Context

- **`src/ui/floating-window.js`** — drag, resize, ESC-close-when-topmost, click-to-focus, geometry persistence under `slammer:window:<id>`. Reused by both the export popup and every panel plugin.
- **`src/ui/plugin-host.js`** — `openPluginWindow(id)` is idempotent: re-opening focuses the existing window. Multiple plugin windows can be open simultaneously.
- **App context façade** — `window.__slammer = { doc, renderer, getSettings, setSettings, onSettingsChange, notify, importImage }`, set once in `main.js`. Plugins MUST use this and never reach into module closures directly.

### Vector Layer

- **Paper.js** (`paper@^0.12`) backs the path engine — bezier maths, simplify, SVG import/export, boolean ops.
- **`opentype.js`** (`@^1.3.5`) extracts font glyphs for Text→Path. Cannot decode WOFF2 directly — see CLAUDE.md for the Fontsource jsDelivr workaround.
- **Top-left origin with locked transform** — `layer.transform.x/y` is set ONCE at layer creation and never updated by anchor/path edits. Path coordinates are in WORLD space. Do not reintroduce centre-origin (it broke twice).
- Tools live under `src/ui/vector-tools/`: pen, pencil, anchor-overlay, text-to-path, active-tool registry.
- Boolean ops via Paper's `PathItem.unite/subtract/intersect/exclude/divide`; outline-stroke via `paperjs-offset`.

### Canvas Tools (Snap, Rulers, Grid)

- **`src/ui/snap-rulers.js`** owns layer-to-layer snap math, top + left ruler canvases with zoom-aware ticks, and draggable guidelines (`doc.state.guidelines`, persisted + undoable).
- **`src/ui/canvas-grid.js`** renders a two-tier grid (default 10 px minor / 100 px major) between bgLayer and contentLayer; moves with stage transform; integrates with snap.
- Footer toggles for Snap (`S`), Rulers (`R`), Grid (`Ctrl+;`).

### Storage & I/O

- **IndexedDB** (`slammer` database, version 3) holds:
  - `projects` — full project documents
  - `plugin-favorites` — saved items per panel plugin (keyPath `id`, indexed by `pluginId` + `folderId`)
  - `plugin-folders` — user-defined folders for plugin-favorites
  - `fonts` — uploaded TTF/OTF/WOFF2 binaries with metadata
- **localStorage** holds a lightweight project index (`slammer:projects`), the current project id (`slammer:current`), settings (`slammer:settings`), pinned plugins (`slammer:pinnedPlugins`), per-window geometry (`slammer:window:*`), and various UI prefs.
- **Settings** (`slammer:settings`) persist accent colour, autosave delay, custom-layer-colours toggle, snap/rulers/grid prefs, API keys (`unsplashAccessKey`, `pexelsApiKey`, `falaiApiKey`), and many more.
- **Autosave** — debounced by `autosaveMs` (default 800 ms). A status dot in the footer shows `dirty → saving → saved`.
- **`.slammerproj`** — Self-contained JSON with embedded data URLs + font metadata (so opening another user's project auto-loads their fonts). Drop onto canvas to import. Legacy `.crushproj` is still accepted.
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

> **Agent note**: Do not run `npm run build` after every change unless the user explicitly asks for it. Vite's dev server (`npm run dev`) handles incremental compilation, and the build step is only needed for production deploys or CI. Skip unnecessary build checks to save time.

## Security Considerations

- **All client-side** — there is no server, auth, or secrets file. API keys for browser-direct integrations (Unsplash, Pexels, fal.ai) live in the Settings → API Keys tab and are stored in localStorage. Each user pastes their own keys; the app never sees them centrally.
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
| Premium plugin loader | `src/plugins/premium-loader.js` |
| Floating plugin windows | `src/ui/floating-window.js`, `src/ui/plugin-host.js` |
| Project storage (IndexedDB) | `src/io/project-store.js` |
| Plugin favorites/folders | `src/io/plugin-store.js` |
| Project file import/export | `src/io/project-file.js` |
| PNG export | `src/io/export-png.js` |
| Affinity bridge | `src/integrations/affinity/index.js` |
| Canvas view (pan/zoom/drop) | `src/ui/canvas-view.js` |
| Snap, rulers, guidelines | `src/ui/snap-rulers.js` |
| Canvas grid | `src/ui/canvas-grid.js` |
| Vector tools | `src/ui/vector-tools/` (pen, pencil, anchor-overlay, text-to-path, active-tool) |
| Layer panel | `src/ui/layer-panel.js` |
| Effect panel | `src/ui/effect-panel.js` |
| Toolbar & shortcuts | `src/ui/toolbar.js` |
| Settings popup | `src/ui/settings-popup.js` |
| Hard-won knowledge & quirks | `CLAUDE.md` |
| Roadmap / planned phases | `roadmap.md` |
| Parked bugs | `BUGS.md` |
