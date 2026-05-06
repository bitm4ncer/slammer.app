# slammer.app — Roadmap

> Living document. Tasks get checked off as they ship.
> Small/quick fixes first. Major features last.
> Cohesive visual line maintained across every phase.

---

## Confirmed decisions

1. **Affinity reference**: SSE + JSON-RPC 2.0 on `http://localhost:6767/sse`, talks to Affinity Photo 2's bundled MCP server, no helper needed (Phase 3 shipped — see [src/integrations/affinity/index.js](src/integrations/affinity/index.js)).
2. **Tools+Filters merged panel**: named **Effects**.
3. **Masks**: Affinity-style nested (drag layer → child mask).
4. **Rename**: full (display, code identifiers, file extension `.slammerproj`, package.json) + new GitHub repo `slammer.app`.

---

## PHASE 0 — Rebrand to slammer.app

- [x] Rename display strings (title bar, splash, footer, `document.title`, exported file prefix) — `crush` → `slammer.app`
- [x] Rename code identifiers (Konva node `crush-layer` → `slammer-layer`, `_crushLayerId` → `_slammerLayerId`, CSS classes, console labels)
- [x] Migrate localStorage keys (`crush:*` → `slammer:*`) with one-shot migration on first launch — also migrates IndexedDB `crush` → `slammer`
- [x] Rename project file extension `.crushproj` → `.slammerproj` (drop handler still accepts legacy `.crushproj`)
- [x] Update `package.json` name + README
- [x] Set default accent color from `#9392D9` → `#8aff8c` in `src/style/variables.css` (also Konva transformer strokes + dithering palette swatch)
- [x] Change UI font from Chicago → Inter (Chicago kept available as a text-layer typeface)
- [x] Prepare `slammer.app` GitHub repo — created at [github.com/bitm4ncer/slammer.app](https://github.com/bitm4ncer/slammer.app) (private). Old CRUSH remote preserved as `crush-legacy`. Branch `v.1.0.0` tracks new origin.

## PHASE 1 — Design system foundation & quick UX wins

- [x] Settings button (gears icon) in bottom-left footer → opens settings popup
- [x] Settings popup contents: autosave duration, version info, theme accent color, (API keys tab deferred to Phase 16)
- [x] Rename "Layers" panel label → **"Layer Stack"**
- [x] Each new layer gets a unique random pastel accent color used in its panels + selection handles (HSL-randomised, sat 55–75 / lig 72–82)
- [x] Manual per-layer accent color change (color swatch on layer card, live re-tints transformer handles)
- [x] Small layer-type icon on each layer card (image / vector / text / pencil / FX) — bottom-right corner of thumb
- [x] Double-click layer title to rename inline (Enter commits, Esc cancels)
- [x] Project popup: icon-based actions (Open / Rename / Duplicate / Delete) + click-title-to-rename
- [x] Selection handles appear *immediately* when a layer is clicked+dragged (mousedown selection added)
- [x] Remove Clear button (New Blank covers it)
- [x] Place Export button next to Save in toolbar
- [x] Keyboard shortcuts: `Ctrl+S` save · `Ctrl+E` export · `Ctrl+N` new blank · `Ctrl+O` open project popup
- [x] Shortcut hints surfaced in tooltips

## PHASE 2 — Effects panel consolidation + dynamic visibility

- [x] Merge "Tools" and "Filters" into a single **Effects** panel (one merged add menu in registration order: filters first, then tools)
- [x] Replace the two add buttons with one round `+` icon button on the Effects header row (tinted by active layer's `--ctx-accent`, hover glow)
- [x] Hide the Effects section entirely when no layer is selected (`display: none` on `#effectsGroup`)
- [x] Re-style for cohesion with new design system

## PHASE 3 — Affinity bridge (port working SSE/JSON-RPC implementation)

- [x] Drop the broken WebSocket `:39871` bridge in `src/integrations/affinity/index.js`
- [x] Port `affinity.js` (SSE + JSON-RPC 2.0 on `http://localhost:6767/sse`) into `src/integrations/affinity/`
- [x] Connect / Send / Pull buttons with status text + LED, exponential auto-reconnect, document-presence probe
- [x] Shift+click on Connect to override MCP URL (persist to `slammer:affinityMcpUrl`)
- [x] Layer name template `slammer · {layerName} · HH:MM`
- [x] Verify against running Affinity Photo 2 with MCP enabled — connected live, Send/Pull enabled when doc is open

## PHASE 4 — Dithering rework (premium-feel core feature)

- [x] Add Size slider (resolution scale 1–100 %, default 100 %) — downscale → dither → upscale (nearest-neighbour)
- [x] Rename "Custom" → **"Halftone"**, make it the default mode (with Dark + Light colour rows)
- [x] Remove "B&W" mode (legacy `bw` / `custom` saved values are auto-mapped to `halftone`)
- [x] Add "Transparent Light" option (light areas become transparent in Halftone)
- [x] Fix **Multi** mode — palette error-diffusion (Floyd-Steinberg-style, per-pixel nearest-palette + error spread); ordered fallback for non-error-diffusion algorithms
- [x] Fix **RGB** mode — per-channel parallel dithering (R/G/B extracted into separate ImageData, dithered independently, recombined)
- [x] Fix **CMYK** mode — RGB→CMYK conversion + per-channel dithering, then recomposite to RGB output
- [x] Restructure algorithm picker — custom dropdown (grouped: Error Diffusion / Ordered / Patterns), portaled to `<body>` with fixed positioning so the menu escapes the effect-card overflow:hidden
- [x] Added `effect-toggle-row` switch component + `sliderRow` `suffix` support (e.g. `%`)
- [x] Global custom scrollbars (slim, dark, ctx-accent on hover) on every scrollable element — the native OS scrollbar is no longer used anywhere in the app

## PHASE 5 — Right sidebar split

- [x] Split right sidebar into two sections: top **Layer Stack**, bottom contextual panels (Effects, Typography, Plugins) for active layer
- [x] Draggable handle between sections (mouse + touch + keyboard arrows + double-click reset), persisted as percentage in `slammer:ui:sidebarSplit` (clamped 18–82 %, default 38 %)
- [x] Each section scrolls independently with the global custom scrollbar

## PHASE 6 — Typography polish

- [x] Selection handles aligned to actual text bounding box (rasterizer now derives canvas from `text.size * 1.2` line-box + accurate per-line widths, so the Konva transformer naturally fits)
- [x] Single Text tool (no mode flyout). **Ctrl+Shift+drag a transformer handle** on a text layer → expands `boxWidth` and auto-promotes to text-box mode, so text wraps live during the drag (state machine lives inside Konva's `boundBoxFunc` for predictable absolute-delta math; `forceUpdate` suppressed during the gesture so the transformer doesn't fight the resize).
- [x] Extended negative tracking range to `-200…+200` (was `-10…+60`)
- [x] Line-height min lowered to `0.2` (was `0.6`); rasterizer now uses a `1.2× size` visual line-box so descenders aren't clipped when lines overlap
- [x] Filter-safe padding (16…96 px each side, scales with font size) baked into the text canvas so Blur etc. has room to expand without being cut off
- [x] **Justified** alignment added — words stretch to fill `boxWidth` (or longest natural line in plain text mode); last line of a paragraph stays left-aligned per typographic convention.

## PHASE 7 — Knobs & GUI control system

- [x] Build reusable `Knob` component (rotary, drag + scroll-wheel + double-click-to-reset, with tiny editable input)
- [x] Build `NumericInput` primitive
- [x] Replace every slider across the app with the Knob + input pattern
- [ ] Add visual GUI controls where they make sense (gradient stops, curve editor, etc.) — deferred to Phase 10
- [x] Pro "piece of gear" finish: subtle bevels, micro-shadows, tick marks

## PHASE 8 — JPEG compression fix + Blend Modes

- [x] Investigate and fix JPEG Compression effect — replaced the pseudo-DCT/posterise approach with the **browser's real JPEG encoder** (`canvas.convertToBlob({ type: 'image/jpeg', quality })`). Modes: **Classic** (single encode), **Downsample** (resample to scale% before encoding — the "rescaled-in-bad-quality" look), **Gen Loss** (re-encode N passes for "shared 50 times on Facebook" look), **Mono** (desaturate first). Required making the renderer's effect pipeline async-aware so plugins can return Promises (sync plugins still work via `await` no-op).
- [x] Add Blend Modes UI on the layer card (small prev/next icons or hover+scroll to browse — fast preview)
- [x] Bonus fix: Konva transformer now `forceUpdate()`s on image-dimension changes so the selection frame follows live edits to text size / tracking / line-height / box-width / textarea content (was only refreshing on de- and re-select).

## PHASE 9 — FX / Adjustment Layers (non-destructive stack-level filters)

- [x] New layer type: **`fx`** — Affinity Live-filter style. Has its own effect stack but no own pixels; its "source" is the live composite of every visible layer below it.
- [x] Renderer: when paint runs, FX layer's source is recomputed via `compositeLayersBelow()` (reuses the same world-space compositing as `flattenVisible`). Every event on a non-FX layer (transform, prop, source, text, effect-add/remove/reorder) triggers `repaintFxAbove()` so FX layers refresh.
- [x] **Click-through**: FX `Konva.Image` is `listening: false` — the modified composite renders on top, but pointer events fall through to the underlying layer's group so it stays selectable / draggable on canvas (no more "all layers locked together").
- [x] Round **+** button next to the **Layer Stack** panel header opens a portaled flyout with two sections: **Layers** (Image / Text / Text Box) and **Effects** (every registered filter, grouped by category). Picking an effect creates an FX layer pre-loaded with that single effect, named after the effect. Tools (Datamosh, JPEG, Pixel Sort, Dithering) stay per-layer-only via the Effects panel `+`.
- [x] All filters usable as either direct effect on the layer OR as the effect stack of an FX layer (no plugin changes needed — same `process(imageData, params)` contract works for both).

## PHASE 10 — New filters

- [x] **Hue** — RGB ↔ HSL with hue / sat / lit sliders.
- [x] **Color Overlay** — Tint (luminance-preserving multiply) or Solid (RGB replace, alpha preserved — recolours free-form PNGs).
- [x] **Grain** — four types: Film (perlin + warm tint, multi-octave), Perlin (smooth value-noise), Random (uniform white), Digital (harsh contrast). Monochrome toggle, seeded mulberry32 PRNG so output is identical across reloads.
- [x] **Gradient Map** — luminance → N-stop gradient via 256-LUT. Visual gradient bar + add/remove stops, defaults to 2 stops (black → white). Amount slider blends with original.
- [x] **Curves** — per-channel tone curves (Master / R / G / B). 220×140 interactive editor with click-to-add / drag / double-click-remove, Catmull-Rom interpolation between points, dark grid background. Master curve composes after the per-channel curves. Reset-active-channel button.
- [x] **Displacement** — for each pixel, sample source at (x+dx, y+dy) where (dx, dy) come from a 2-channel value-noise map. Edge mode: clamp. Custom-texture upload deferred to a later phase.
- [x] All available as both per-layer effects (Effects panel `+`) and as FX adjustment layers (Layer Stack `+`).

## PHASE 11 — Document sizes & alignment

- [x] Document Size footer button (`fa-vector-square`) → modal popup with **Screens** (HD / FHD / QHD / 4K), **Social** (IG Square / IG Portrait / IG Story / Twitter Post / Twitter Header / FB Cover / YT Thumb / LinkedIn Banner), **Print @ 300 dpi** (A0–A6) presets + custom W × H inputs + Clear-frame button.
- [x] Frame visualised on canvas as a dashed `--primary` outline + dimmed (35 % black) backdrop covering everything outside it. `listening: false` on the overlay so layers stay clickable through it. Acts as an **export region**, not a strict page boundary — layers extend freely.
- [x] **Alignment controls** in the footer: 6 icon buttons (left / centre H / right / top / centre V / bottom) — visible only when a frame is set AND a non-FX layer is active. Aligns the active layer relative to the frame.
- [x] **Export popup** replaces direct PNG export: region (frame | visible) + format (PNG | JPEG) + quality slider (JPEG only) + scale (1× / 2× / 4×) + background (transparent / white / black / custom) + filename. Last-used settings persist to `slammer:lastExportSettings`. Shift+Click on Export still bypasses the popup and exports `.slammerproj`.
- [x] `renderer.flattenVisible()` extended with `region` + `scale` so frame export crops to exact frame coords at the chosen pixel scale.
- [x] `doc.setExportFrame(partial)` + `doc:exportFrame` event; history treats it as a prop event so undo/redo works.

## PHASE 12 — Fonts (Fontshare + variable + upload)

- [x] Fontshare integration ([fontshare.com](https://www.fontshare.com))
- [x] Variable font controls (weight / width / slant / optical size — auto-detected axes)
- [x] Font upload functionality (TTF/OTF/WOFF/WOFF2 → IndexedDB)
- [x] Local Font Access API (system fonts, Chromium only)

## PHASE 13 — Vector tools

### 13a — Vector foundation
- [x] Vector layer type, shape primitives (circle, rect, star, torus, polygon)
- [x] Fill / stroke / gradient / gradient-along-stroke
- [x] SVG drag-drop import with multi-path layers
- [x] Anchor overlay + bezier handles

### 13b — Pen / Pencil / Anchor edits / Text→Path
- [x] Pen tool (P) with click-to-add + drag-for-curves
- [x] Pencil tool (B) with smoothness slider in footer
- [x] Direct selection (A): alt-click smooth/corner, double-click insert anchor
- [x] Text → Path conversion via opentype.js (Google + Fontshare CDN)

### 13c — Boolean ops, path actions, Outline Stroke
- [x] Booleans: unite / subtract / intersect / exclude / divide (Paper.js)
- [x] Single-path actions: Simplify, Smooth, Reverse, Open/Close, Join
- [x] Outline Stroke (paperjs-offset)

### 13d — Multi-layer select + simplify slider ⏳
- [ ] Marquee select (drag-rectangle on canvas to select multiple layers)
- [ ] Shift-click multi-select in Layer Stack panel + on canvas
- [ ] Multi-layer transform: scaling / moving N layers together; group scaling cascades to children, preserves relative position + order
- [ ] Fix: cannot delete multiple selected layers
- [ ] Fix: grouping must preserve layer order + position
- [ ] Slider-driven path Simplify with live preview

## PHASE 14 — Brush tool ⏳

- [ ] Brush tool in left sidebar; drawing creates a brush layer
- [ ] Generative brush filters: rainbow, gradient stroke, displaced stroke, noise width, speed-to-width
- [ ] Non-destructive controls on brush layer
- [ ] **Eraser brush** — non-destructive: paints onto a per-layer mask buffer (preview of Phase 15 mask infra)

## PHASE 15 — Masks (Affinity-style nested) ⏳

- [ ] Drag any layer onto another → becomes a nested mask
- [ ] Black hides / white shows
- [ ] Works for raster, vector, text masks
- [ ] Mask thumbnail in layer card with toggle visibility

## PHASE 16 — Plugins system

- [x] Plugin layer architecture (panel plugin type, registry, host, draggable VST-style windows)
- [x] **Unsplash** plugin (search + favorites + folders → image layer)
- [x] **Pexels** plugin (search + favorites + folders → image layer)
- [x] **fal.ai** plugin — curated 15-model browser with schema-driven forms (nano-banana, flux-pro/kontext, seedream, qwen-edit, recraft, photomaker, clarity-upscaler, birefnet, etc.). Direct browser auth, no proxy needed.
- [x] PLUGINS sidebar category with `+` Plugin Manager popup
- [x] API keys live in Settings popup → API Keys tab
- [ ] **Callshop Frame Generator** integration ([repo](https://github.com/bitm4ncer/Callshop_FrameGenerator)) — deferred to Phase 16b
- [ ] 90sbadtrip equivalent on fal.ai (find Flux VHS/trip LoRA or upload custom) — deferred to Phase 16b
- [ ] Live fal.ai catalog (replace curated JSON with on-demand fetch) — deferred to Phase 16b

## PHASE 17 — Graphics Library

- [ ] Library popup with drag-drop save zone (images, SVG icons)
- [ ] Folder organization
- [ ] Search + quality-of-life features
- [ ] Library icon button in footer
- [ ] Hover Add Image button → slide-out (upload / from library)

## PHASE 18 — Artboards / Pages

- [ ] Collapsable pages sidebar
- [ ] Duplicate, reorder pages
- [ ] Per-page settings icon (change document)
- [ ]  change version number to v1.0.1

---

## PHASE 19 — Bug Bash & Polish 🆕

> Parallel swarm — each cluster ≤ 3 files where possible, dispatched to a Sonnet 4.6 subagent in its own worktree. Main agent reviews diffs.

### Cluster A — Layer panel & multi-select shortcuts
- [ ] Ctrl+C / Ctrl+V / Ctrl+D / Ctrl+X on active layer (copy / paste / duplicate / delete)
- [ ] Visible **Duplicate** button on layer card (next to trash)
- [ ] Arrow keys nudge selected layer 1 px; Shift+Arrow = 10 px
- [ ] Auto-scroll layer panel to selected layer
- [ ] Selection-on-click (not on mousedown) — fixes "drag accidentally re-selects overlapping layer"

### Cluster B — Effect panel & existing-effect tweaks
- [x] Bug: **Pixelsort above Dither** — root cause was uniform-score input after dither (binary B/W) made every qualifying span have identical scores → sort no-op. Fix: renderer now threads `ctx.sourceImageData` (pre-effect-stack pixels) into `process()`; pixelsort scores from the original tones but writes permutations into the current pipeline buffer.
- [x] Pixelsort: Direction control is an arrow-icon toggle (`pillGroup` gained `variant: 'icon'` + `iconClass`)
- [x] Rename "Dithering" → **"Dither"** (id stays `'dithering'` for save-file back-compat)
- [x] Halftone Dither: two-gradient mode (`halftoneMode: 'colors' | 'gradients'`; per-pixel dark LUT + light LUT sampled by source luminance)
- [x] Realtime preview when browsing dither algorithms; scroll-wheel cycles algorithm (full-res; wheel cycles the flat list across groups, wraps at ends)
- [x] "image" category renamed to **"Adjustments"**; "Distort" + "Stylize" buckets added (empty until Phase 20 effects land — better-icons pass deferred to that phase too)
- [x] Loading spinner on effect cards while heavy effects compute (`effect:processing` events from renderer; `.is-processing` class)
- [x] Effect-panel `+` dropdown opens above when near viewport bottom; new shared `clampToViewport` helper for future dropdowns
- [x] **Grain**: Contrast slider added (−100..+100); Monochrome toggle left-aligned (`toggleRow` gained `align: 'left'`); min size → 0.1 (step 0.1)
- [x] **Grain**: Blend Modes — uses canonical `BLEND_MODES` + new `BLEND_LABELS` from `core/layer.js`; composite via OffscreenCanvas + `globalCompositeOperation`
- [x] **Levels**: rebuilt as a single 3-handle slider (`tripleSlider` helper) — blacks / gamma / whites on one track; numeric LUT identical to old behaviour
- [x] **Blur**: max radius 100 (process clamp + UI slider both bumped)

### Cluster C — Footer & canvas chrome
- [ ] Frame button: subtle highlight when frame active + tiny `×` close affordance
- [ ] Rotation: live degree readout next to handle; Shift+rotate-drag snaps to 5°
- [ ] Different cursor on hover/drag of rotate handle
- [ ] Project loads in **Fit view**
- [ ] Auto-load fonts on opening another user's project (font manifest in `.slammerproj`)

### Cluster D — Settings tabs
- [ ] **Info** tab: supported file types, version, "Buy a coffee" button
- [ ] **Shortcuts** tab: complete keymap reference

### Cluster E — Export popup
- [ ] **WebP** format option
- [ ] Pill-shaped Cancel / Export buttons placed side by side
- [ ] **RGBA / CMYK** toggle
- [ ] **Layer Export** toggle in region settings (only when a layer is selected)
- [ ] JPEG with transparency: auto-mask to original layer alpha shape

### Cluster F — Persistence & undo
- [ ] Undo flicker fix: don't tear down all Konva nodes on history step; diff and patch
- [ ] Audit: scaling effects don't survive reload — find non-persisted plugin params
- [ ] Audit: anything not in undo/redo history that should be (effect-stack reorders, frame edits)

### Cluster G — Typography polish
- [ ] Text layer auto-renames to its text content (live, debounced)
- [ ] Font preview: tiny "import selected layer's text" icon next to Lorem Ipsum input
- [ ] **Live font preview**: while browsing fonts with a text layer selected, canvas updates realtime. Settings toggle.

### Cluster H — Vector
- [ ] **Split** button on multi-path vector layer → splits into N independent vector layers, preserves fills/strokes

### Cluster I — Plugin polish
- [ ] Image plugins (Unsplash / Pexels / Openverse): sticky search/header bar
- [ ] fal.ai: visible progress indicator while a job runs
- [ ] fal.ai: accept group-layer drops (renders the group → image, then uploads)

## PHASE 20 — New Effects Library 🆕

> Each effect = own file under `src/plugins/filters/`. Parallel swarm: 1 worker per effect.

- [ ] **Posterize**
- [ ] **Twirl** — radial-distort with falloff
- [ ] **Ripple** — concentric-wave displacement
- [ ] **RGB Shift** — per-channel offset
- [ ] **Bulge** — concave/convex pinch
- [ ] **Halftone Raster** — real screenprint dot pattern, **DPI** + angle + dot-shape settings (distinct from Halftone Dither)
- [ ] **Drop Shadow** — alpha-shape-aware: dilates the layer's alpha into a blurred offset shape, not a rect bbox
- [ ] **Organic Gradient** — `noisesc(v + udirsc(v)*t)` flowing gradient overlay; seedable; speed param
- [ ] Re-categorise the Effects add menu after these land (Distort / Stylize / Adjustments / Render)

## PHASE 21 — Canvas Tools & Inspectors 🆕

- [ ] **Snap toggle** in right footer: layer-to-layer edge + center alignment, dashed accent indicator lines
- [ ] **Ruler toggle** in center footer: rulers on top + left edges; drag from ruler creates a guideline; snap also engages on guidelines
- [ ] **Frame Tool** in left sidebar: drag on canvas to create a new export frame (foundation for Phase 24 multi-frame)
- [ ] **Crop tool** for layers (non-destructive — stored as crop rect in layer metadata, applied at render time)
- [ ] **Transform inspector** in footer: X% / Y% scale numerics, lock-aspect button (inverts Shift+drag = no-constrain), reset button; same for rotation
- [ ] **Quick adjustments bar** below selected image: every effect/typo knob currently on the layer in one bar. Settings toggle.
- [ ] **Ctrl+Space** opens center-screen radial effect picker

## PHASE 22 — Selection Tools 🆕

- [ ] **Magic Wand** tool: pick pixel, select connected pixels within colour-threshold (tolerance / contiguous / anti-alias). Outputs a mask layer (Phase 15 infra) or transient selection. Object-detection variant deferred.
- [ ] Eraser brush integration with Phase 15 mask infra (replaces per-layer mask buffer from Phase 14)

## PHASE 23 — Color System (full pro) 🆕

- [ ] **Center-footer color circle** — current active colour, click to expand
- [ ] **Popover**: HSL triangle + hue ring, hex / RGB / HSL inputs, eyedropper
- [ ] **Swatches palette** — favourites grid
- [ ] **Named color variables**: user creates `--accent`, `--bg`, etc. Assignable to text colour, vector fill / stroke, gradient stops, Color Overlay tint. Editing the variable propagates to every consumer **live**.
- [ ] Storage: `slammer:colors:variables` + `slammer:colors:swatches` (localStorage) + project-scoped overrides serialised into `.slammerproj`
- [ ] API on `window.__slammer.colors` so plugins can read/subscribe

## PHASE 24 — Multi-Frame Export & Versioning 🆕

- [ ] **N frames per project** (free-layer model). Frames live in `doc.frames[]`.
- [ ] Frame management UI: list of frames, rename, duplicate, delete; click to centre-view
- [ ] Export popup: **frame picker** — multi-select for batch export → ZIP via fflate
- [ ] Affinity bridge: same frame picker for Send / Pull
- [ ] **Save as new version** option in Save flyout — manual versioned snapshot
- [ ] Autosave continues but writes "Autosave version" snapshots **chained behind** the last manual save. Project popup grows a versions list per project.

## PHASE 25 — Unified Media Library 🆕 (replaces Phase 17)

- [ ] Central IndexedDB store: `slammer:library` with folders + items
- [ ] Item types: image, SVG, saved frame (rasterized PNG **+** linked editable `.slammerproj` snapshot)
- [ ] Folders sidebar in a Library popup; drag into canvas = add as image layer (or open project for saved-frame items)
- [ ] Migrate `plugin-favorites` + `plugin-folders` into the central store; plugins write with a `pluginId` tag
- [ ] Save current frame to library (rasterize PNG + project snapshot sidecar)
- [ ] Hover Add Image button → slide-out (Upload / From Library / From Plugin)
- [ ] Footer Library icon button

## PHASE 26 — Plugin Polish 🆕

- [ ] **Openverse** rate-limit fix: client-side per-source quota (wiki > flickr > others), exponential backoff with cached results LRU; user can paste own Openverse API key in Settings → API Keys

## PHASE 27 — Advanced Effects 🆕

- [ ] **Blur** rebuild with mode picker: Normal · Directional (angle + length) · Depth of Field (radius map + focal point) · Radial · Noise (custom mask defines blur strength)
- [ ] **Deform** (single effect, three sub-modes via tab):
  - [ ] **Perspective** — 4 corner handles
  - [ ] **Mesh Warp** — N×M grid handles
  - [ ] **Pin Points** — drop pins onto triangulated mesh, drag pins to deform

---

### Deferred / parked
- Midjourney Discord Bot plugin — needs server-side relay, conflicts with no-backend v1. Revisit after F1 SDK / browser-extension MCP.
- Magic Wand object-detection variant — research-grade ML; revisit when SAM-style web models stabilise.
- Callshop Frame Generator (Phase 16b)
- 90sbadtrip equivalent on fal.ai (Phase 16b)
- Live fal.ai catalog (Phase 16b)

---

## Verification approach

After every phase: launch dev server, exercise the phase's features in browser, regression-check previous phases. Each task above gets ticked only after manual verification in the running app.

## Open questions deferred to specific phases

- **Phase 11**: full preset list of document sizes — confirm at phase start
- **Phase 13**: vector library choice (paper.js vs raw Konva.Path vs custom) — discuss before starting
- **Phase 16**: confirm exact Replicate model slugs at phase start

---

## Features

Features are larger initiatives not bound to a phase number. Started when it makes sense — usually after current QoL/bug work clears the deck. Each Feature can grow over multiple weeks; sub-deliverables ship independently.

### F1 — Open Slammer (SDK + Plugins + MCP + Docs)

**Intent**: open slammer.app to outside developers and LLMs.
**Status**: planned — start when QoL/bug queue clears.

Sub-deliverables (each shippable on its own):
- [ ] **Operations API** (`window.__slammer.ops`) — ~30 typed ops, foundation for everything below
- [ ] **Markdown docs route** at `/docs` (Vite route, `src/docs/*.md`)
- [ ] **3rd-party plugin loader** — `loadPluginFromUrl(url)`, plugin scaffold (`npm create slammer-plugin`), trust-on-install (no sandbox v1)
- [ ] **MCP browser-extension companion** — Chrome/Firefox extension brokers between slammer ↔ MCP server process; Connect panel inside slammer; supports Claude Code, Kimi, any MCP-aware LLM
- [ ] **In-app coding agent** — panel plugin, chat UI, tool-loop against the same Operations API; uses Anthropic / OpenAI key from Settings
- [ ] **Plugin sandbox + featured registry** (later) — iframe / Worker isolation, permissions model

**Architecture notes** (locked-in; don't re-debate):
- Plugin distribution: **self-hosted URLs** — user pastes plugin `index.js` URL, no curated registry v1
- MCP transport: **browser extension** for v1. Electron / Tauri shell is the *end goal* but explicitly later
- Docs: markdown files in `src/docs/`, Vite route, same repo
- Versioning: `window.__slammer.ops` is the only public consumer-facing API; needs an explicit semver story before external developers ship plugins

**Prerequisite**: Operations API. Don't start any of the others (plugin loader, MCP, agent) before that's stable, otherwise three slightly-different APIs grow in parallel. The "snapshot-verify" loop (`ops.getCanvasSnapshot({ region, scale })`) is the killer feature for the MCP and the in-app agent — make sure that op is fast, deterministic, and low-token-cost.

**Open decisions** (defer until start-of-work):
- ESM module package format for plugins (single `index.js` or zipped bundle?)
- MCP authentication (token-on-localhost vs. extension-managed handshake)
- Snapshot resolution defaults for LLM verification (token cost vs. accuracy)

### F2 — Noun Project Plugin (SVG Icon Search)

**Intent**: search and import SVG icons from The Noun Project's 5M+ icon library directly inside slammer.
**Status**: idea — revisit when plugin ecosystem matures.

- [ ] Panel plugin using Noun Project API v2 (`GET /v2/icon?query=…`)
- [ ] Auth: OAuth 1.0a (key + secret from user's NounProject developer account, stored in Settings → API Keys)
- [ ] Import as vector layer (SVG → path data) or as rasterised image layer
- [ ] Style/line-weight filters, similar-icon suggestions

**Notes**: OAuth 1.0a is heavier than the simple Bearer/API-key auth used by other plugins — each request needs a signed header (nonce, timestamp, HMAC-SHA1). Browser-side signing is doable with a small lib. Most useful once SVG import → vector layer is solid.
