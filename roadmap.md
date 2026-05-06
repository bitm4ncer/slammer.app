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
- [x] Frame button: accent-tinted highlight when frame active + inline `×` close affordance (clears `doc.exportFrame`)
- [x] Rotation: live degree readout pill near pointer during drag; **Shift+rotate snaps to nearest 5°**
- [x] Rotater anchor cursor: `grab` on hover, `grabbing` while rotating
- [x] Project loads in **Fit view** (`view.fitTo()` on every `doc:loaded` event, deferred one tick so Konva groups mount first)
- [x] Auto-load fonts on opening another user's project — `preloadFontsForDoc()` now runs on every project-load path (autosave restore, project-menu open, `.slmr` import); `.slmr` manifest enriched with all-provider font metadata (uploaded carries raw bytes; google/fontshare/system carry catalog snapshots so the receiver can `loadFont(meta)` even with a stale catalog)

### Cluster D — Settings tabs
- [x] **Info** tab: app + version, supported file types (project / image / vector / fonts / export), Buy-a-coffee button + GitHub link
- [x] **Shortcuts** tab: 35-row keymap covering File, Edit, Move &amp; Transform, Tools, Canvas. Rendered as a `<table class="settings-shortcuts">` with `<kbd>` styling.

### Cluster E — Export popup
- [x] **WebP** format option (third pill alongside PNG / JPEG; quality slider now also applies)
- [x] Pill-shaped Cancel / Export buttons side by side (`.settings-action-btn` + `--primary` reused from Settings → Info)
- [x] **RGBA / CMYK** toggle — CMYK runs an in-place soft-proof (RGB → CMYK → RGB round-trip) before encoding, since browsers can't write a CMYK container directly. ICC-accurate workflow stays Affinity-via-bridge.
- [x] **Layer Export** region pill — visible only when an active layer is selected; defaults filename to the layer's name; pipes through `renderer.rasterizeLayerToBlob`.
- [x] JPEG-with-transparency auto-mask — for `Layer Export + JPEG + Background: transparent`, the canvas is cropped to the layer's alpha bounding box (no more giant white rectangles).

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
- [ ] **Additional museum plugins** (one panel plugin each, share `_shared/browsable.js` UX + the Met plugin's throttle/proxy/cache scaffold):
  - [ ] **Smithsonian Open Access** (`api.si.edu/openaccess/api/v1.0/search`) — 5M+ items, free key from edan.si.edu
  - [ ] **Rijksmuseum** (`www.rijksmuseum.nl/api/en/collection`) — needs free API key from `data.rijksmuseum.nl`
  - [ ] **MoMA** — no public REST API; ship as a static-JSON browser using their open-data CSV from `github.com/MuseumofModernArt/collection`
  - [ ] **Victoria & Albert** (`api.vam.ac.uk/v2/objects/search`) — no key, CORS-friendly

## PHASE 27 — Advanced Effects 🆕

- [ ] **Blur** rebuild with mode picker: Normal · Directional (angle + length) · Depth of Field (radius map + focal point) · Radial · Noise (custom mask defines blur strength)
- [ ] **Deform** (single effect, three sub-modes via tab):
  - [ ] **Perspective** — 4 corner handles
  - [ ] **Mesh Warp** — N×M grid handles
  - [ ] **Pin Points** — drop pins onto triangulated mesh, drag pins to deform

## PHASE 28 — Bitmancer Library Storefront & Premium Infrastructure 🆕

> Technical scaffolding for the **à-la-carte shop**. App stays AGPL; premium plugins, effects and asset packs live in a private Bitmancer repo, sold via [Polar.sh](https://polar.sh) (Apache 2.0, MoR), delivered via Cloudflare R2. See [STRATEGY.md](STRATEGY.md) for the business model and the three "Pay what you need" tests, and [F3](#f3--slammer-pro--bitmancer) for the strategic deliverables.

### Foundations
- [x] AGPL-3.0 license + [LICENSE](LICENSE) file
- [x] `.gitignore` privacy hardening (`.claude/plans/`, `*.private.md`, `*.strategy.md`, `notes/`)
- [x] Public [STRATEGY.md](STRATEGY.md)
- [ ] Register `slammer.app` domain (Cloudflare Registrar — Hetzner doesn't sell `.app` reliably)
- [ ] Migrate deploy from GitHub Pages → **Cloudflare Pages** (faster edge, better custom-domain UX, free)
- [ ] Marketing landing page (`/about` or root): single page, ASCII-block aesthetic matching README, "what's free / what's premium" explainer, Bitmancer Library teaser, Polar.sh CTA
- [ ] **Plausible** analytics — anonymous page views only, no fingerprinting

### Polar.sh setup (commerce backend)
- [ ] Create Polar organization for Bitmancer; verify identity for MoR
- [ ] One Polar **product per saleable item** — every plugin / asset pack / themed bundle / lifetime tier is its own SKU
- [ ] Enable native **License Keys** benefit on each product (Polar generates keys at checkout)
- [ ] Webhook endpoint registered: `polar.checkout.completed` → notifies Cloudflare Worker so the user's owned-item list refreshes immediately

### License + delivery infrastructure
- [ ] **Cloudflare Worker** (`api.slammer.app/license`):
  - `POST /verify` — accepts Polar license key, validates against Polar API, returns signed JWT containing `owned: string[]` (item IDs) + `exp` (24h)
  - `POST /webhook` — receives Polar `checkout.completed`, caches user's purchase set in KV for fast subsequent verifications
  - `GET /download/:itemId` — accepts JWT, returns short-lived signed URL for the matching R2 object
- [ ] **Cloudflare R2** bucket (`bitmancer-library`): premium plugin bundles + asset-pack ZIPs; access only via Worker-signed URLs (no public bucket)
- [ ] **Cloudflare KV** (`bitmancer-licenses`): user → owned-item-IDs cache, ~5 min TTL, refreshed by webhook
- [ ] License-key entry UI in Settings → **Library** tab (new): paste key, status indicator, "Refresh ownership" button
- [ ] JWT cache in IndexedDB; auto-renew on near-expiry; offline-tolerant (last good token cached, Library still shows owned items if validation server is briefly unreachable)

### Plugin system extensions
- [ ] Plugin manifest schema bump: each premium plugin has stable `id` (e.g. `datamosh-studio`); free plugins continue without change
- [ ] Plugin registry: ownership-aware loader — premium plugins skip-load until JWT lists their `id` in `owned[]`
- [ ] **Price-tag UI in Effects add-menu**: premium plugins show a small price label (e.g. "€7") instead of a lock icon. Click → opens in-app preview modal (description, screenshot, "Buy on Polar" CTA, dismiss)
- [ ] Same price-tag treatment in the Layer Stack `+` flyout (Phase 9) for premium FX layers and in any future Vector Tools shop entry points
- [ ] Owned-bundle install: register premium plugins in `slammer:library:owned` IndexedDB store; load on app boot before plugin registry locks

### Bitmancer Library plugin (free, AGPL, panel type) — full storefront UX
- [ ] New panel plugin: `src/plugins/panels/bitmancer-library/`
- [ ] **Browse tab** — full catalog. Categories: Effects · Vector Tools · Asset Packs · Themed Bundles · Lifetime. Each card: thumbnail, name, price tag, short blurb, "Buy" / "Owned" / "Install" action
- [ ] **Owned tab** — items the current license key has unlocked, with install / update buttons
- [ ] **Cart-less checkout** — click Buy → opens Polar checkout in new tab → returns to slammer with key auto-detected via `?polar_key=` URL param OR manual paste
- [ ] One-click install — fetches signed download URL from Worker, stores bundle in IndexedDB (`slammer:library:bundles`), registers in plugin system
- [ ] Drag asset-pack item from Library onto canvas → adds image / SVG / texture layer (depends on item type)
- [ ] Background update check on app boot: silently fetch latest version metadata, prompt user only when a meaningful update is available
- [ ] Search + tag filtering across the catalog (catalog metadata served by Worker, cached client-side)

### Asset-pack format
- [ ] Spec: `.zip` containing `manifest.json` (id / name / version / type / contents) + asset files
- [ ] Types: `texture` (PNG/JPEG batch), `gradient` (JSON list of stops), `font` (TTF/OTF/WOFF2 with metadata), `vector-kit` (SVG batch), `template` (`.slammerproj` files)
- [ ] Importer in Bitmancer Library handles each type → routes to appropriate registry (texture cache / gradient store / font upload pipeline / project store)

### Pre-launch validation
- [ ] Three-test gate: every premium item in the launch catalog must individually pass the **Tutorial / 2-Hour / Eigengeld** tests in [STRATEGY.md](STRATEGY.md). Maintainer signs off in writing per item before it's listed in Polar.

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

### F3 — Slammer Pro & Bitmancer Library

**Intent**: keep slammer.app free and AGPL while making the project sustainable through an **à-la-carte** in-app shop — single plugins, themed bundles, asset packs, and an optional lifetime tier — all under the Bitmancer brand. Public model and the three "Pay what you need" tests live in [STRATEGY.md](STRATEGY.md).
**Status**: in progress — strategy public, infrastructure scoped as Phase 28.

**Pricing tiers (all one-time, no subscription):**

| Tier | Price | Notes |
|---|---|---|
| Single plugin / effect / vector tool | €5–10 | Each must pass the three tests in STRATEGY.md |
| Asset pack | €5–15 | Texture / gradient / font / vector kit / template |
| Themed bundle | €15–25 | 3–4 workflow-coherent items, ~30 % bundle discount |
| Slammer Pro Lifetime | €99–129 | All current + future Bitmancer plugins for v1.x |

Sub-deliverables (each shippable on its own):
- [x] Public [STRATEGY.md](STRATEGY.md) — positioning, à-la-carte pricing, three premium-decision tests, license, content-honesty
- [x] AGPL-3.0 license applied
- [ ] [Phase 28](#phase-28--bitmancer-library-storefront--premium-infrastructure-) — technical infrastructure (prerequisite for everything below)
- [ ] **Polar.sh organization** set up; identity verified for Merchant of Record
- [ ] **Launch catalog** (private repo, separate works) — 3–5 launch plugins (lean over full), each individually passing the three tests, plus 1 themed bundle and the Lifetime tier
- [ ] **Bitmancer asset-pack format conversion** — port existing texture packs at [bitmancer.gumroad.com](https://bitmancer.gumroad.com) into the asset-pack `.zip` format and re-list on Polar (legacy Gumroad customers stay on Gumroad and are not migrated)
- [ ] **2–3 new asset packs** drafted before public launch (gradient pack, font bundle, project templates) — same three-test gate even for content
- [ ] **Public launch announcement video** on [@bitmancer](https://www.youtube.com/@Bitmancer) — first dedicated Slammer video, positioned as natural extension of the existing Affinity content
- [ ] **Tutorial backlog** — 2–3 polished AI-voice tutorials drafted *before* launch, one per launch plugin (buffer against post-launch silence)
- [ ] **Continued Affinity content** at reduced cadence — soft cross-pollination, not hard pivot
- [ ] **Devlog format** (raw, edited, creator's voice) — bonus track when interesting things happen, never on a schedule

**Architecture notes** (locked-in; don't re-debate):
- Premium plugins, effects, vector tools and asset packs are **separate works** distributed via Polar.sh commerce + Cloudflare R2 delivery. They live in a **private Bitmancer repo**, never in slammer.app.
- **À-la-carte** is the default model — every saleable thing has its own SKU and price tag. Bundles are an additive convenience for buyers, not the primary unit.
- **Free Tier scope locks at public launch.** What is in the public repo on launch day stays free under AGPL forever. Improvements to free items keep shipping after launch.
- **No DRM**, no online activation requirement. Honor-system license check.
- **One-time payment only**, no subscription. v2.x in the future is a paid upgrade in Affinity cadence.
- **Three-test gate** (see STRATEGY.md): every premium item must pass Tutorial / 2-Hour / Eigengeld tests. Failed items go free, get folded into existing plugins, or don't ship.
- **Bring-your-own-key for AI**. Bitmancer never sees user prompts or outputs.
- **No third-party plugin marketplace** v1 — third parties self-distribute, slammer just loads. Community marketplace deferred to [F4](#f4--community-plugin-marketplace).

**Prerequisite**: Phase 28 ships before any premium item can be sold. Domain + Cloudflare deploy + Polar.sh integration + Cloudflare Worker + Bitmancer Library plugin must be live before any item is listed on Polar.

**Open decisions** (defer until Phase 28 start):
- Exact launch-catalog plugins (pick 3–5; bias toward video-genic capabilities — Datamosh Studio, Halftone Studio, Generative Brush Engine are the current frontrunners)
- Lifetime tier price: €99 / €119 / €129 — recommend **€99 launch / €129 once catalog is fat**
- Single-plugin price spread: flat €7 for all, or tiered €5/€7/€10 based on complexity? (lean tiered)
- License JWT claim shape — `owned: string[]` of item IDs is the working model
- Whether to dual-list legacy Bitmancer texture packs on Polar (yes, after asset-pack-format conversion) or leave them Gumroad-only forever (simpler)

### F4 — Community Plugin Marketplace

**Intent**: open the Bitmancer Library to third-party plugin developers. Sellers list their own plugins; Bitmancer takes a small commission; users browse community plugins next to first-party ones in the same Library UI.
**Status**: deferred — long-term goal, not v1. Listed here so it informs v1 architecture decisions.

Sub-deliverables (sketch only — to be detailed when work starts):
- [ ] **Plugin sandbox** — iframe / Web Worker isolation, capability-based permissions (canvas-read, canvas-write, network, storage). Hard prerequisite — without sandboxing, third-party plugins can't be trusted in the user's app.
- [ ] **Submission + review pipeline** — manual review at first; automated checks for manifest validity, bundle size, allowed APIs
- [ ] **Seller onboarding via Polar Connect** (or equivalent payout mechanism) — third parties get paid directly by Polar minus Bitmancer commission
- [ ] **Commission**: ~20 % standard (vs Apple's 30 % / Steam's 30 %), lower for revenue under a threshold to encourage indie devs
- [ ] **Library UI extensions** — third-party badge, seller profile, ratings, reports
- [ ] **Featured / curated** vs free-listing tiers — quality signal vs ecosystem openness

**Prerequisite**: F3 launched, F1 (Open Slammer SDK) at least partially shipped — the public Operations API + plugin loader are necessary foundations before strangers can ship plugins. Sandboxing is the long pole; everything else is straightforward once that's solved.

**Architecture notes**:
- F4 is the natural extension of F1's "self-hosted plugin URLs" — instead of users pasting random URLs, the Bitmancer Library curates and hosts community plugins.
- Sandbox model decision (iframe vs Worker) is the central technical question; both have trade-offs (iframe = DOM access for renderUI but heavier; Worker = light but no direct DOM).
- Commerce: Polar Connect (if available at the time) or a custom payout flow via Stripe Connect as fallback.
- This is a 2027+ goal at current single-maintainer cadence.

### F5 — Premium Sprint (Bitmancer launch catalog)

**Intent**: build out the launch catalog of premium plugins, effects and asset packs that the Bitmancer Library will sell. Each item must individually pass the three "Pay what you need" tests in [STRATEGY.md](STRATEGY.md). Live in a private repo at `src/plugins/premium/` (gitignored), loaded in dev via `premium-loader.js`, served via R2 in prod (Phase 28).
**Status**: in progress — first 5 plugins migrated to `premium/` folder structure, manifests tagged with `pro: true` + `pack` metadata.

**Pack structure (`pack` field on the manifest):**

| Pack | Items | Status |
|---|---|---|
| **Glitch Pack** | Datamosh · JPEG Compression | Migrated, pre-existing functionality |
| **Raster Pack** | Dither · Halftone (raster) | Dither migrated; raster Halftone TBD |
| **Dots Pack** | Stipple · Halftone (vector) | Migrated, pre-existing functionality |

**Existing premium plugins (migrated from free folders, polish pending):**
- [x] **Datamosh** — moved to `premium/datamosh/`, `pack: 'glitch-pack'`
- [x] **JPEG Compression** — moved to `premium/jpeg-compression/`, `pack: 'glitch-pack'`
- [x] **Dither** — moved to `premium/dithering/` (id stable), `pack: 'raster-pack'`
- [x] **Stipple** (vector) — moved to `premium/stipple/`, `pack: 'dots-pack'`
- [x] **Halftone** (vector) — moved to `premium/halftone/`, `pack: 'dots-pack'`

**New premium plugins / effects / assets (build queue):**
- [ ] **Halftone (raster)** — real screenprint dot pattern with DPI + angle + dot-shape (distinct from vector Halftone, distinct from Dither's halftone mode). Goes into Raster Pack alongside Dither.
- [ ] **Instagram Importer** plugin — login-free public profile scraping or oEmbed-based, pulls user's own posts as image layers
- [ ] **Background Removal** plugin (client-side) — runs on local model (e.g. ONNX U²-Net or BiRefNet via WebGPU/WASM). Available as both standalone plugin AND as a per-layer effect.
- [ ] **AI Inpainting** plugin — fal.ai-backed (BYO key), masked region → AI fill
- [ ] **Soft Face Filter** effect — lightweight skin-smoothing / colour-balancing for portraits
- [ ] **Y2K Vector Pack** assets — curated SVG kit (logos, shapes, ornaments, stickers)
- [ ] **Xerox Textures** asset pack — high-res scan textures of photocopied / faxed material
- [ ] **Organic Gradients** effect (also on roadmap, see Phase 20) — flowing seedable gradients via `noisesc(v + udirsc(v)*t)`. Move from Phase 20 to F5 since it's a strong Pro candidate.
- [ ] **CRT Look** effect — scan lines + RGB bleed + bloom + vignette + barrel distortion preset
- [ ] **Mesh Warp** plugin — pin-mesh deformation (also on Phase 27 Deform tab; if shipped here, drop the Phase 27 Mesh Warp sub-task)

**Architecture notes:**
- All items live in private `bitmancer-plugins` repo, mounted at `src/plugins/premium/`. Gitignored in slammer.app.
- Each item's manifest carries `pro: true`, `pack: '<pack-id>'`, eventually `price: <eur>` (added when commerce wires up in Phase 28).
- Free improvements to non-premium plugins continue independently — moving items here does NOT mean polish stops on free counterparts.
- Phase 19 polish items that touch premium plugins (e.g. Pixelsort scroll-wheel cycle, Dither algorithm browse, etc.) cross-cut into F5; track them in whichever phase the work happens, no double-listing.

**Polish sprints (each premium item gets its own pass before launch):**
- [ ] Datamosh polish — fat-knob UI, more algorithms, before/after preview, presets
- [ ] JPEG Compression polish — quality presets ("Late-2000s Forum", "Compression Decay", "Recompressed Meme"), gen-loss visual feedback
- [ ] Dither polish — algorithm preview thumbnails in picker, scroll-wheel cycle (Phase 19 todo), better palette UI
- [ ] Stipple polish — preview overlay during edit, denser jitter modes, layout previews
- [ ] Halftone (vector) polish — gradient direction handles on canvas

**Open decisions** (defer until Phase 28 / launch nears):
- Per-plugin price points (single plugin €5–10, but flat or tiered?)
- Pack discount: 30 % off pack vs sum of singles is the working model
- Lifetime bundle inclusion: every F5 item ships into Lifetime automatically (per STRATEGY.md)
- Whether Background Removal local model is allowed in free fork too (no — too valuable to give away, keep premium even though tech is OSS)

**Prerequisite**: Phase 28 Bitmancer Library Storefront must be live before any F5 item can be sold publicly. Until then, all F5 work is private development against the dev-loader.
