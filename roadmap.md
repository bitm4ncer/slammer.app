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

### 13d — Multi-layer select + simplify slider ✅
- [x] Marquee select — `src/ui/marquee.js` + `src/ui/canvas-view.js` mousedown/move/up; touch + contain modes; honours locked/hidden/fx exclusions; shift-extend works.
- [x] Shift-click multi-select in Layer Stack — `src/ui/layer-panel.js` shift-range via `selectRange()` reading panel order. (Canvas-side shift-click not wired; marquee + panel cover the workflow.)
- [x] Multi-layer transform — `src/core/renderer.js` `multiDragSession` captures every selected layer's start position on dragstart, replicates the delta on dragmove, commits all transforms on dragend; `selectionNodes()` attaches the full set to the Konva.Transformer; vector paths bake via `translatePathD`.
- [x] Fix: delete-key now honours full selection — `src/ui/canvas-view.js` Delete/Backspace handler loops over `getSelection()` instead of `activeLayerId`.
- [x] Grouping preserves order + position — `addGroupLayer()` reads `childIds` in panel-top-first order, splices the group at the topmost child's z-position; `handleSortEnd` rebuilds from panel DOM order.
- [x] Slider-driven path Simplify with live preview — replaced the one-shot button with a tolerance slider (0–50, default 2.5). Drag fires `doc.setVectorPathEphemeral` (new mutator, emits `layer:vectorChangedEphemeral` — NOT in PROP_EVENTS, so hover-spam doesn't pollute undo). Release commits ONCE via `setVectorPath`. Escape reverts cleanly. Pure `computeSimplifiedD()` extracted from `simplifyPath` so the same formula drives both paths.

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
- [x] Display version unified — `v1.0.2` everywhere (header tag, Settings → About, Settings sidebar stamp). package.json carries the canonical `1.0.2`. Note: actual Phase 18 Artboards features still pending.

---

## PHASE 19 — Bug Bash & Polish 🆕

> Parallel swarm — each cluster ≤ 3 files where possible, dispatched to a Sonnet 4.6 subagent in its own worktree. Main agent reviews diffs.

### Cluster A — Layer panel & multi-select shortcuts
- [x] Ctrl+C / Ctrl+V / Ctrl+D / Ctrl+X on active layer (copy / paste / duplicate / delete) — main.js layer clipboard + toolbar.js Ctrl+D handler
- [x] Visible **Duplicate** button on layer card (next to trash) — `.act-dup` button, `fa-clone`, layer-panel.js
- [x] Arrow keys nudge selected layer 1 px; Shift+Arrow = 10 px — toolbar.js arrow handler, drops nested-under-group children, vector paths translate too
- [x] Auto-scroll layer panel to selected layer — `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` on the active row
- [x] Selection-on-click (not on mousedown) — `pendingGesture` state in canvas-view.js with `DRAG_THRESHOLD = 4`, mousedown alone never auto-changes selection
- [x] **Collapsible Typography & Vector panels** — click the `.tool-panel-head` header to fold the body; chevron rotates; per-panel state under `slammer:typo:panelCollapsed` and `slammer:vector:panelCollapsed`; keyboard-activatable (Enter / Space)
- [x] **Alt+drag to duplicate layer** — `canvas-view.js` mousedown captures `modAlt`; on first dragmove past threshold the gesture pivots: every layer in `pendingGesture.starts` is `doc.duplicateLayer()`-ed at offsetXY {0,0}, the new groups become the drag targets (lazy-resolved through `renderer.layerState`), selection moves to the duplicates. Multi-layer Alt+drag duplicates all selected layers simultaneously.
- [x] **Ctrl+V paste image from clipboard** — `paste` listener in `main.js` reads `clipboardData.items` for `image/*` MIME (screenshots, copied images). Internal layer-paste still takes priority — when `layerClipboard` is non-null the keydown handler `preventDefault`s and the browser never fires `paste`. Otherwise the image is wrapped in a `File` and routed through `addImageFile()`.

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
- [x] **Drop Shadow: angle control rework** — `createAngleDistanceWidget` (`src/plugins/shared/angle-distance-widget.js`) draws a draggable handle on a circular puck so users set angle + distance in one gesture (Figma/Affinity-style). Live canvas preview while dragging. Cartesian XY mode kept as an alternative tab; the Phase 20 Drop Shadow ships with both. Disk size tuned 108 → 88 px in `653bdc9`.
- [ ] **Verify Mesh Gradient classification** — the manifest must have `pro: true` AND `pack: 'gradient-pack'` (or whatever the Infinity Gradients pack id resolves to after the rename). Check `src/plugins/premium/mesh-gradient/index.js` or wherever it actually sits — if it's currently under `src/plugins/tools/` (free) it needs to move to `src/plugins/premium/` and the manifest fields updated. Confirm it shows up in the Bitmancer Shop card grid alongside the other Gradient Pack entries. Also confirm the rendering bug (parked in `BUGS.md` under "Mesh Gradient — control points + mesh connections broken") gets fixed before this can be ticked.

### Cluster C — Footer & canvas chrome
- [x] Frame button: accent-tinted highlight when frame active + inline `×` close affordance (clears `doc.exportFrame`)
- [x] Rotation: live degree readout pill near pointer during drag; **Shift+rotate snaps to nearest 5°**
- [x] Rotater anchor cursor: `grab` on hover, `grabbing` while rotating
- [x] Project loads in **Fit view** (`view.fitTo()` on every `doc:loaded` event, deferred one tick so Konva groups mount first)
- [x] Auto-load fonts on opening another user's project — `preloadFontsForDoc()` now runs on every project-load path (autosave restore, project-menu open, `.slmr` import); `.slmr` manifest enriched with all-provider font metadata (uploaded carries raw bytes; google/fontshare/system carry catalog snapshots so the receiver can `loadFont(meta)` even with a stale catalog)

- [x] **Ctrl+0 fit-to-viewport shortcut** — wired in `toolbar.js` keydown handler alongside the existing modifier shortcuts. Calls `view.fitTo()`.
- [x] **Keyboard zoom (Ctrl+= / Ctrl+- / Ctrl+1)** — toolbar.js. Both step-zoom (×1.2 per press) and Ctrl+1 (jump to 100 %) operate around viewport center, mirroring `Ctrl+0` (fit). Wheel-zoom remains around-pointer.
- [x] **Layer Z-order via Ctrl+arrow** — `Ctrl+↑/↓` bring forward / send backward one step; `Ctrl+Shift+↑/↓` bring to front / send to back. `reorderZ()` helper preserves multi-selection relative order while bubbling through unselected siblings. Wired in toolbar.js' keymap.
- [x] **Layer-stack navigation (Ctrl+Alt+↑/↓)** — clamps at top/bottom of `doc.layers`. Wired in toolbar.js' keymap.
- [x] **Tab toggles side panels** — `body.panels-collapsed` class hides `.tool-sidebar` + `.side-panel`, grid template collapses tools/panel columns to zero so canvas grows. Toolbar + footer stay (user still needs File / zoom). toolbar.js keymap.
- [x] **Trackpad & scroll canvas navigation** — `canvas-view.js` wheel handler now branches on `getSettings().scrollBehavior` ('pan' default, 'zoom' legacy). Pan mode: plain scroll = pan (uses `deltaX` + `deltaY`); `Ctrl/Cmd`+scroll + pinch zoom; `Shift`+scroll → horizontal pan with single-axis wheels. Zoom mode swaps the two. Settings → Workflow → Canvas navigation has a Pan / Zoom segmented toggle.

### Cluster D — Settings tabs
- [x] **Info** tab: app + version, supported file types (project / image / vector / fonts / export), Buy-a-coffee button + GitHub link
- [x] **Shortcuts** tab: 35-row keymap covering File, Edit, Move &amp; Transform, Tools, Canvas. Rendered as a `<table class="settings-shortcuts">` with `<kbd>` styling.

### Cluster E — Export popup
- [x] **WebP** format option (third pill alongside PNG / JPEG; quality slider now also applies)
- [x] Pill-shaped Cancel / Export buttons side by side (`.settings-action-btn` + `--primary` reused from Settings → Info)
- [x] **RGBA / CMYK** toggle — CMYK runs an in-place soft-proof (RGB → CMYK → RGB round-trip) before encoding, since browsers can't write a CMYK container directly. ICC-accurate workflow stays Affinity-via-bridge.
- [x] **Layer Export** region pill — visible only when an active layer is selected; defaults filename to the layer's name; pipes through `renderer.rasterizeLayerToBlob`.
- [x] JPEG-with-transparency auto-mask — for `Layer Export + JPEG + Background: transparent`, the canvas is cropped to the layer's alpha bounding box (no more giant white rectangles).

#### Cluster E v2 — Export popup full rework

> The current popup is a vertical stack of pill rows + a filename input. Functional but charmless and low-information: the user clicks Export blind, with no idea how big the file will be, what it will look like, or whether they cropped the right region. This pass is a full makeover: split layout, live preview, and the QoL features a real export dialog needs.

- [ ] **Two-column layout** — left side: live preview canvas, right side: collapsible setting groups (Region, Format, Quality, Background, Filename, Advanced). Popup grows to accommodate the preview without feeling cramped. Resizable by dragging the bottom-right corner; size persisted under `slammer:window:export`.
- [ ] **Live export preview** — canvas-rendered thumbnail of the exact bytes that would be written, refreshed debounced (~150 ms) on any setting change. Shows: actual pixel dimensions, scale factor effect, background fill, JPEG/WebP compression artifacts at the chosen quality. Pan + zoom with the same scroll/pinch model as the main canvas; "fit" / "100%" buttons in a mini-footer.
- [ ] **File size estimate** — encode the preview at the chosen format/quality once after each settings change, display "~ 1.4 MB · 1920 × 1080" below the preview. Uses real encoder, not a heuristic. Long-running encodes show a small spinner and don't block the UI.
- [ ] **Quality slider always visible** for JPEG + WebP (currently buried). Live updates the preview + size estimate. Default 85, range 1–100. PNG hides the slider but exposes a `Bit depth: 8 / 16` selector when the source has high-bit-depth content.
- [ ] **Custom dimensions** — under SCALE, add a "Custom" pill that opens W × H inputs with a lock-aspect toggle. Shows resulting scale factor inline. Useful for "export at exactly 2400 px wide for Behance".
- [ ] **Crop region** — when REGION is "Visible" or a layer, allow the user to drag a crop rectangle directly on the preview to refine the export bounds before encoding. Preset crop ratios (1:1, 4:5, 16:9, 9:16, free).
- [ ] **Recent presets** — top of the right column shows up to 4 chips of the user's recent export configs (e.g. "PNG · 2× · transparent"). One click loads the whole config. Stored in `slammer:export:recent` (capped at ~12).
- [ ] **Saved presets** — beyond Recent, a small "+" lets the user name and save the current config as a preset (e.g. "Instagram Square", "Behance Wide", "Print 300 DPI"). Listed under Recent. Editable / deletable.
- [ ] **Format-specific advanced options** in a collapsed accordion at the bottom:
  - JPEG: progressive on/off, chroma subsampling (4:4:4 / 4:2:0), strip metadata
  - WebP: lossless toggle, alpha quality (separate from RGB quality), strip metadata
  - PNG: bit depth (8/16), interlace toggle, optimise (run a quick zopfli-style pass for smaller files)
- [ ] **Metadata controls** — common toggles for all formats: include EXIF (camera / DPI / colour profile), strip GPS, set DPI (72 / 150 / 300 / custom). Default: strip GPS, include DPI.
- [ ] **Copy to clipboard** — secondary action button next to Export: encodes the same output and writes it to the system clipboard via `navigator.clipboard.write` with the chosen MIME type. Useful for paste-into-Slack / Figma / email.
- [ ] **Drag-out export** — the preview thumbnail is draggable: dragging it out of the popup window onto the desktop / Finder / Explorer triggers a real file save (uses HTML5 `application/octet-stream` drag with the encoded blob). Same trick Figma uses for asset export. Filename comes from the FILENAME field.
- [ ] **Open after export** — checkbox: after saving, open the file in a new tab (PNG/JPEG/WebP all render natively).
- [ ] **Filename templates** — small `?` next to the FILENAME input shows tokens: `{project}`, `{layer}`, `{date}`, `{time}`, `{w}`, `{h}`, `{format}`. The default is `{project}` but the user can save a template (e.g. `{project}_{w}x{h}@{date}`) under Saved presets.
- [ ] **Region picker improvements** — current REGION pills are flat. Convert to a labeled selector with a thumbnail per region (Export Frame thumb, Visible thumb, per-layer mini-thumbs when applicable). Multi-select for batch export hooks into Phase 24 (Multi-Frame Export).
- [ ] **Background picker rework** — TRANSPARENT / WHITE / BLACK / CUSTOM stay, but CUSTOM opens the new colour picker (Phase 23) instead of a bare colour input. Adds a "Project background" option that uses the project's default background colour.
- [ ] **Visual makeover** — match the broader product aesthetic shipped in Phase 19 Cluster J (UI animations) + Phase 30 (themes). Subtle bevels on inputs, consistent group-header styling, comfortable spacing, theme-aware colours via `--sl-*` tokens. The popup should feel like a polished surface, not a stack of form rows.
- [ ] **Keyboard ergonomics** — `Enter` triggers Export, `Esc` closes, `Ctrl+Shift+E` opens the popup directly to the last config without going through any menu.

### Cluster F — Persistence & undo
- [ ] Undo flicker fix: don't tear down all Konva nodes on history step; diff and patch — **parked in BUGS.md** (renderer rewrite scope; needs its own cluster)
- [x] Audit: plugin params persistence — every plugin stores state in `effect.params` (snapshotted per `JSON.stringify`); only `displacement` keeps a module-level `_textureCache` Map that's a non-persisted in-memory perf cache (correct). No gaps found.
- [x] Audit: events missing from undo coverage — `doc:propChanged` (project rename) was the only gap. Added to history's PROP_EVENTS so renaming a project commits to history; `statesLookEqual` extended to compare `state.name` + `state.exportFrame` so renames + frame edits aren't dropped as duplicate snapshots.

### Cluster G — Typography polish
- [x] Text layer auto-renames to its text content (debounced 300 ms; first 30 chars; stops the moment the user manually renames via layer-card double-click — tracked by a `_autoNamed` flag that persists across reload)
- [x] Font picker: "Use selected layer's text" icon button next to the Preview-text input — disabled when no text layer is active or content is empty
- [x] **Live font preview** with Settings → Workflow → Typography toggle (default ON). Hovering a font card temporarily previews it on the active text layer via a new `setTextPropEphemeral()` API + `layer:textChangedEphemeral` event — NOT in PROP_EVENTS, so hover-spam doesn't bloat undo history. Click commits permanently.

### Cluster H — Vector
- [x] **Split** button on the path picker (visible only on multi-path vector layers) — turns the layer into N independent vector layers, preserves per-path fill/stroke/shape, copies transform/accent/opacity/blendMode/visible/locked + parent group membership, removes the source. New `doc.splitVectorLayer(id)` mutator emits one `layer:removed` + N `layer:added` so history captures it as a single structural commit.
- [x] **Vector panel layout polish** — Path-actions row split: Simplify slider on its own row, action buttons (Smooth / Reverse / Open / Join / Outline) on a dedicated row as a compact pill strip via new `.vector-actions--pills` modifier. Buttons share width evenly (`flex: 1 1 0`) so they read as a single segmented control. COMBINE row gets the same pill treatment.

### Cluster I — Plugin polish
- [x] Image plugins (Unsplash / Pexels / Met): sticky search header — search row + tag pills now wrap in a `.browsable-search-header` that uses `display: contents` in landing state (so the centred landing layout is unaffected) and `position: sticky; top: 38px` once the user's first search exits the landing state.
- [x] fal.ai: progress indicator — a `setRunning(bool)` helper swaps the Run button to a spinner + "Generating…" label, shows a 3 px indeterminate animated progress bar below the actions row, and surfaces queue position when known ("Queued · N ahead…"). Hidden on success / error / cancel.
- [x] fal.ai: group-layer drops — already supported. Verified: `_shared/drop-zone.js` accepts `group` layer types and `renderer.rasterizeLayerToBlob` flattens descendants for groups (the existing Phase 16 wiring is correct).
- [x] **Image plugin loading spinner** — landing-loader's reveal delay tightened from 500 ms → 120 ms in `_shared/browsable.js`. Below 120 ms = sub-perceptual (no flash for fast cache hits); over 120 ms = the centered spinner (existing `.browsable-landing-loader`) appears so the user sees feedback. Met / Openverse routinely hit 1-3 s through wsrv.nl proxy — the old 500 ms gap made those panels look broken on every open.
- [ ] **Plugin feed persistence** — closing and reopening a panel plugin should restore the user's exact session state: current search query, active tag/category filter, current page (for paginated APIs), all loaded items in the feed, and scroll position. Persisted under `slammer:plugin:<id>:feed` in localStorage (or IndexedDB if payload is large). On `openPluginWindow(id)` re-open, hydrate the feed from cache before the next API call so the user lands back exactly where they left off — no jarring "fresh search" on every reopen. Applies to Unsplash, Pexels, Met, fal.ai, and any future panel plugins; ideally implemented as a shared helper in `src/plugins/panels/_shared/` so each plugin opts in with a few lines.
- [ ] **Quick-access wheel: plugin icons + colours** — the radial quick-access widget should display each plugin's manifest icon (FontAwesome class) tinted by its pack accent (or a default for free plugins). Currently shows generic placeholders. Read `manifest.icon` + `manifest.pack` (resolve to `PACK_INFO[pack].color` from `shop-popup.js`) when populating wheel slots.

### Cluster J — UI animations & transitions
- [x] **Plugin window open/close** — `floating-window.js` open animation tuned (200 ms ease-out, 14 px slide + 0.98 → 1 scale). Close adds an `is-closing` class that runs the inverse keyframe (150 ms ease-in) before `el.remove()` — host re-mount logic still sees the close fire after the node is gone. All floating windows (plugin panels, export popup) inherit.
- [ ] **Panel collapse/expand** — smooth height transition on Typography, Vector, Effects, and any future collapsible panel. Use `max-height` transition or `grid-template-rows: 0fr → 1fr` for a clean accordion feel (~200ms ease).
- [x] **Settings modal overlay** — `.settings-backdrop` fade-in extended from 160 → 280 ms; `.settings-modal` gets its own `settingsModalRise` keyframe (200 ms ease, 10 px slide + 0.985 → 1 scale) so the surface lands while the world recedes. Cinematic without dragging.
- [ ] **Z-index hierarchy** — enforce a strict stacking order: Settings modal + overlay (highest) → Shop popup → Plugin windows (in focus order) → rest of the app. Define named z-index layers in `variables.css` (`--z-app`, `--z-plugin-window`, `--z-shop`, `--z-settings-overlay`, `--z-settings`).
- [ ] **General micro-transitions** — audit remaining abrupt show/hide interactions (dropdowns, tooltips, effect-card expand, add-menu) and add subtle fade/scale transitions where it feels natural. Keep durations short (100–200ms) and respect `prefers-reduced-motion`.

## PHASE 20 — New Effects Library ✅

> Each effect = own file under `src/plugins/filters/` (free) or `src/plugins/premium/` (paid). Shipped via parallel swarm.

- [x] **Posterize** — Adjustments. Levels 2–32, RGB / Luminance / Palette modes, Linear / Perceptual / Equalised distribution, edge softness, bias, mix.
- [x] **Twirl** — Distort. Inverse-warp rotation with smooth/linear/hard/bell falloff + Inverse mode.
- [x] **Ripple** — Distort. 4 wave shapes (sine/triangle/square/sawtooth) × 4 polarisations (radial/horizontal/vertical/diagonal), phase + decay.
- [x] **RGB Shift** — Glitch. Flat per-channel XY OR Radial chromatic-aberration mode with bias.
- [x] **Bulge** — Distort. True spherical projection + Smooth / Cone / Pinch-bell falloffs; Free aspect for oval bulges.
- [x] **Drop Shadow** — Stylize. Polar (Angle + Distance) OR Cartesian input, blur, spread (alpha dilate), 4 blend modes, Inner Shadow + Knockout toggles.
- [x] **Halftone Raster** 🟦 PREMIUM (Raster Pack) — true print-shop screening. Monochrome / RGB / CMYK-separated modes with industry-standard angles (C=15° M=75° Y=0° K=45°), per-channel pitch + ink overrides, UCR K-plate, Euclidean dot transition, dot gain, sub-pixel anti-aliasing, vignette.
- [x] **Organic Gradient** 🟪 PREMIUM (Infinity Gradients) — domain-warped simplex noise (1–4 iterations) → multi-stop gradient (Linear / Spherical / Conic sampling), animation toggle with rAF tick, time-offset freezes, vignette + grain + 5 blend modes.
- [x] **Mesh Gradient** 🟪 PREMIUM (Infinity Gradients) — bicubic Catmull-Rom interpolation across 2×2 / 3×3 / 4×4 / 5×5 grid; smoothness slider blends nearest → bilinear → bicubic; on-canvas overlay (`src/ui/mesh-gradient-overlay.js`) with draggable colour handles + colour pickers; HSL tint modifiers preserve user's mesh design.
- [x] **Gradient Library** 🟪 PREMIUM (Infinity Gradients) — panel plugin browsing 80 curated gradients across 9 categories. Click to apply, drag onto any gradient picker (`gradientStopsRow` extended with `application/x-slammer-gradient` drop-target + "Browse presets…" button + focus tracking).
- [x] Effect picker now lists **Adjustments / Glitch / Distort / Stylize / Color / Render** (the empty Distort & Stylize buckets from Cluster B fill up; Render is new for Phase 20).
- [x] Shop: 4 new entries in `PLUGIN_PALETTE` (each with its own flag colour + character pattern + mark code); new **Infinity Gradients** pack added to `PACK_INFO`.

## PHASE 21 — Canvas Tools & Inspectors 🆕

- [x] **Snap toggle** (right footer, keyboard `S`) — layer-to-layer edge + center alignment with dashed accent indicator lines that span the canvas. Snaps work in single-layer drag AND multi-layer drag (uses union bbox of the whole selection). 6-px screen-space tolerance, converted to world via `1 / stage.scaleX()`. Hold Alt to escape. Persisted as `slammer:settings.snapEnabled` (default ON).
- [x] **Ruler toggle** (center footer, keyboard `R`) — top + left rulers as `<canvas>` overlays with adaptive zoom-aware ticks (minor / medium / major). Drag from ruler edge → creates a guideline at that world coord. Drag a guideline back into the ruler → deletes. Guidelines persist in `doc.state.guidelines`, survive reload, enter undo (history's `statesLookEqual` extended to compare guidelines). When the Snap toggle is also on, drags snap to guidelines too. Persisted as `slammer:settings.rulersEnabled` (default OFF).
- [x] New `src/ui/snap-rulers.js` (~350 LOC) module owns the snap math + ruler / guideline rendering; exposes `{ computeSnapForRect, showIndicators, hideIndicators, updateRulers, onStageTransform, destroy }`. Mounted from `main.js`; canvas-view's drag handler calls into it.
- [ ] **Frame Tool** in left sidebar: drag on canvas to create a new export frame (foundation for Phase 24 multi-frame)
- [ ] **Crop tool** for layers (non-destructive — stored as crop rect in layer metadata, applied at render time)
- [~] **Transform inspector** in footer — read-only first cut shipped (`src/ui/transform-inspector.js`): X / Y / W / H / rotation HUD in `.footer-center`, tabular numerics, accent-tinted keys, hidden when no non-FX layer is active. Editable inputs + lock-aspect + reset still TBD.
- [ ] **Quick adjustments bar** below selected image: every effect/typo knob currently on the layer in one bar. Settings toggle.
- [ ] **Ctrl+Space** opens center-screen radial effect picker
- [x] **Canvas Grid** — subtle two-tier grid (default 10 px minor / 100 px major) rendered between bgLayer and contentLayer, moves with the canvas via stage transform. Footer button (right footer next to Snap + Ruler, keyboard `Ctrl+;`) toggles visibility. Settings → Workflow → Canvas Grid: Show grid + Snap to grid toggles, Minor pitch slider (5..100), Major pitch slider (50..500, auto-clamped to multiple of minor), Opacity (0..100), Colour. Grid lines drawn via single `Konva.Shape` `sceneFunc` (raw canvas) with integer-pixel snap for crispness; major lines render at 2× alpha + 1.5 px. `snap-rulers.gatherCandidates` extends with grid-line candidates when `snapEnabled && canvasGridShow && canvasGridSnap` — capped at 200 per axis across the visible viewport. New `src/ui/canvas-grid.js` module.

## PHASE 21b — Shortcut Manager (centralise before more pile up) 🆕

- [ ] **Central shortcut registry** (`src/ui/shortcut-manager.js`) — single module that owns all key bindings. Each shortcut = action ID + default combo + category (File / Edit / Move / Tools / Canvas). All existing `keydown` listeners across the app (~10 files: toolbar, canvas-view, vector tools, layer-panel, etc.) refactored to register through the registry instead of ad-hoc `addEventListener`.
- [ ] **User-configurable shortcuts** — Settings → Shortcuts tab becomes editable: click a row, press a new combo, confirm. Conflict detection warns when two actions share the same combo. Overrides stored in `slammer:settings.shortcuts` (sparse map of action ID → custom combo; absent = default).
- [ ] **Reset to defaults** — per-shortcut and global reset button in the Shortcuts tab.
- [ ] Migrate the existing Ctrl+0 fit-to-viewport shortcut (Phase 19 Cluster C) through the new registry once it ships.

## PHASE 22 — Selection Tools 🆕

- [ ] **Magic Wand** tool: pick pixel, select connected pixels within colour-threshold (tolerance / contiguous / anti-alias). Outputs a mask layer (Phase 15 infra) or transient selection. Object-detection variant deferred.
- [ ] Eraser brush integration with Phase 15 mask infra (replaces per-layer mask buffer from Phase 14)

## PHASE 23 — Color System (full pro) 🆕

> Goal: turn the existing color picker into a central hub that owns both colours AND gradients, drives every fill/stroke surface in the app, and feels like a real product. Drag-and-drop is the connective tissue.

### Color hub UI (futuristic, slide-out from the dot)

- [x] **Color dot in center-footer** — drawer-style popover that slides UP from below the wheel/dot cluster (`body.color-hub-open` adds `bottom: calc(... + var(--color-hub-h) + 8px)` to `.quick-wheel` + `.color-circle-btn` + `.quick-wheel-controls`); drawer fills the new gap above the footer. 240 ms ease-out open, ease-in close. `.is-closing` pattern from `floating-window.js`. Glow halo on the dial while the hub is open.
- [x] **Stroke ring around the dot** — new `.color-circle-stroke-ring` inset inside the dial; centre `.color-circle-swatch` = fill. Click `event.target` branches: ring opens hub focused on stroke, centre on fill. Hub stays open across slot switches; clicking the OPPOSITE chip in the popover swaps the editing slot live. Hidden in dot-mode (too small to read).
- [x] **Picker layout** — Solid | Gradient | None segmented mode row replaces the planned `Color | Gradient` pill (third state covers no-fill / no-stroke). Hue ring + HSL triangle stays for solid mode; gradient mode swaps in a stop-track + angle slider; none dims the picker and shows a checker chip.
- [x] **Eyedropper** — `EyeDropper` API call wired to the eyedropper button in the popover (commits to the active slot via `setActiveSlot`).
- [x] **Hex / HSL readouts + numeric inputs** — Hex + R/G/B inputs ship in the side column. (HSL numeric inputs deferred; the triangle picker IS HSV-driven, so HSL numerics are nice-to-have not blocking.)
- [x] **Opacity slider** — per-slot opacity (0-100 %) below the picker. Stored on the active state as `fillOpacity` / `strokeOpacity`; applied to both solid + gradient and propagated to new layers via `buildVectorFillFromActive` / `buildVectorStrokeFromActive`.
- [x] **Visual polish**: dark surfaces, no border / no radius (drawer fuses with footer band), glow ring on the dot when the popover is open, footer stacks BETWEEN drawer and dial so the drawer reads as "pulled out from under a shelf".

### Color & Gradient Library (central hub)

- [ ] **Saved swatches strip** inside the popover — user-saved colours + currently used colours from the active project. Drag a colour out of the strip onto any target on the canvas to apply.
- [ ] **Saved gradients strip** in the gradient mode of the popover — same model as swatches but for gradients. Drag a gradient out to apply.
- [ ] **Library popup** (full-screen) — extended browser like the existing Gradient Library plugin. Categories: Recent · Favourites · Project palette · Bitmancer presets · User packs. Search + tag filter. Same UX language as the Gradient Library so they feel like sibling features.
- [ ] **Save / delete** — `+` button in the swatches/gradients strip captures the current colour/gradient. Right-click or drag-to-trash removes.
- [ ] **Drag-drop apply** — every drop target accepts the same MIME types:
  - `application/x-slammer-color` (hex/rgba payload)
  - `application/x-slammer-gradient` (already used by Gradient Library — extend to all gradient pickers)
  - Drop targets: vector layer (canvas hit-test → fill or stroke based on drop position / modifier key), text layer (→ text colour), every `colorRow` / `gradientStopsRow` input across the app, the dot itself.
- [ ] **Hover preview** — dragging a colour over a vector/text layer on canvas shows a live preview tint while hovering, commits on drop, reverts on cancel. Same pattern as the existing live font preview from Phase 19 Cluster G.

### Stroke + Fill model

- [x] **Two-slot active colour state** — `colors.js` storage migrated to `{ fill, stroke }`. Old string shape transparently wrapped on first read (`fill = oldString`, `stroke = #000000`). New API: `getActiveFill / getActiveStroke / getActiveSlots / setActiveSlot / swapFillStroke`. `getActive()` kept as back-compat for plugins (returns fill string). Exposed via `window.__slammer.colors`.
- [x] **Swap fill/stroke** keyboard shortcut — `X` wired in `toolbar.js` keymap; calls `colors.swapFillStroke()`. Settings → Shortcuts table updated. Convenience swap button (fa-arrows-rotate) inside the popover's slot toggle row does the same.
- [x] **No-fill / no-stroke** option in the picker — third button (slashed circle / `fa-ban` icon) in the mode row. When selected, the picker dims, the slot chip + dial swatch / ring render a checker pattern, and `buildVectorFillFromActive` / `buildVectorStrokeFromActive` emit `{ type: 'none' }` for new layers.

### New layer inheritance

- [x] **Newly created vector shape, path, or text layer takes the currently active fill + stroke** — shape-drawer.js (rect / ellipse / polygon / star / line), pen-tool.js, pencil-tool.js, and `addText()` in toolbar.js all read the active state at creation time via `buildVectorFillFromActive` / `buildVectorStrokeFromActive` (or `getActiveFill` for text, which only handles solid colour). Stroke width is carried through. Line tool stays special-cased: forces fill: none + a visible solid stroke even when active stroke kind is none.
- [x] First-launch defaults stay sensible: green fill (`#8aff8c`) + black stroke (`#000000`) ship as the seed values in `colors.js`. Existing projects keep their stored choices via the silent migration.

### Storage & API

- [ ] **Storage layout**:
  - `slammer:colors:swatches` — array of saved colours (`{ id, hex, alpha, name? }`)
  - `slammer:colors:gradients` — array of saved gradients (re-uses existing gradient stop format)
  - `slammer:colors:active` — `{ fill, stroke }` last-used pair, restored on app boot
  - Project-scoped overrides (palette specific to a `.slammerproj`) serialised into the manifest
- [ ] **Public API on `window.__slammer.colors`**: `getActive()`, `setActive({ fill, stroke })`, `subscribe(cb)`, `saveSwatch(c)`, `saveGradient(g)`, `applyTo(layerId, slot)` — so plugins (incl. premium) can read/subscribe and panel plugins like the Library can drive it.
- [ ] **Named color variables** (deferred to a follow-up sub-phase 23b if needed): user creates `--accent`, `--bg`, etc. Assignable to text colour, vector fill / stroke, gradient stops, Color Overlay tint. Editing the variable propagates to every consumer live. Skip in v1 — not on the critical path for the "feels like a product" goal.

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

- [x] **Blur** rebuild — Phase 27 first wave: Normal · Directional (radial angle widget + length 0–400 px) · Radial (Zoom + Spin sub-modes with adjustable centre); Inner / Outer alpha toggle orthogonal to kernel; icon swap droplet → feather; vector + text canvas pad now grows with the effect stack so outer blur isn't clipped at the bbox.
- [ ] **Blur — Depth of Field** mode (radius map + focal point) — needs depth-texture upload UI; ship as a follow-up to the Phase 27 first wave.
- Noise Blur moved to F5 premium build queue (Glitch Pack candidate) per maintainer call.
- [ ] **Deform** (single effect, three sub-modes via tab):
  - [ ] **Perspective** — 4 corner handles
  - [ ] **Mesh Warp** — N×M grid handles
  - [ ] **Pin Points** — drop pins onto triangulated mesh, drag pins to deform
- [ ] **Fisheye** — Distort. Global lens distortion projecting the image onto a sphere/hemisphere for the classic 180° wide-angle look. Distinct from Bulge (Bulge is localised with a centre + falloff; Fisheye is a full-frame lens projection). Controls: amount/strength (−100 = pincushion, 0 = flat, +100 = full barrel), zoom (compensate the edge crop), centre offset (shift the optical centre off-frame), edge mode (clamp / wrap / mirror / transparent), aspect lock (square vs match-frame). Sub-modes for projection style: **Equidistant**, **Equisolid**, **Stereographic**, **Orthographic** (the four standard fisheye projections, distinct mathematical mappings producing different edge curvatures). Free effect — could be a premium polish later if the projection picker turns into a real lens-simulator.
- [ ] **3D** 🟧 PREMIUM (Surface Pack — new) — Stylize. A unified bevel + emboss + 3D-shade effect inspired by Affinity's combined Layer Effects panel: instead of forcing the user to pick "Bevel/Emboss" OR "3D" as separate effects, this single effect blends both worlds. Treats the layer's alpha/luma as a height-field, then runs Phong-ish per-pixel shading. Controls: **Type** (Pillow / Outer Bevel / Inner Bevel / Emboss / Sculpt — the last one being the full 3D mode), Radius (height-field smoothing), Depth (extrusion strength), Soften (post-blur on the lighting result), Profile picker (curve-shaped falloff: linear, S-curve, ridge, custom-drawable), Direction (Azimuth + Elevation set via a circular puck like the existing Drop Shadow widget), Highlight + Shadow colours with separate opacities, Diffuse / Specular / Shininess sliders (active in Sculpt mode), Specular colour, Ambient + colour, multi-light support (1–4 lights, each with its own direction + colour + intensity), Invert toggle, Scale-with-object toggle. Live preview during all knob drags. Works on text, vector and image layers — the height field source adapts (alpha for vector/text, luma+alpha for image).
- [ ] **Plastic** 🟧 PREMIUM (Surface Pack) — Stylize. Recreates After Effects' CC Plastic look: glossy, sculpted plastic/wax surface generated from the layer's luma or alpha. Sibling to the 3D effect but tuned specifically for the soft, rolled-shoulder, high-spec material aesthetic — works beautifully on text, shapes, and photos. **Algorithm** (height-field bump-shading, not real 3D): (1) build heightmap H from source channel (luma for photos, alpha for clean text/shapes — user-selectable); (2) **heavy separable Gaussian pre-blur on H** — this is THE knob that decides "plastic" vs "crinkled emboss"; (3) per-pixel surface normals from heightmap gradient (Sobel-style); (4) Blinn-Phong shading: ambient + diffuse + tight specular lobe with high shininess exponent (typical 4–256 range); (5) modulate by source alpha so transparency is preserved. **Controls**: Surface Bump source (Self / Other layer) + channel (Luma / Alpha / Red), Smoothness (the pre-blur radius — the most expressive knob), Bump Height (gradient multiplier), Light Direction (azimuth via circular puck), Light Height (elevation 0–90°), Light Intensity, Light Colour, Ambient (0–1), Diffuse (0–1), Specular Highlight (intensity), Highlight Sharpness / Roughness (Phong exponent), Specular Colour (default white, often tinted for stylised plastic). **Performance**: ~300–800 ms on Canvas 2D for a 2000×2000 image — bottleneck is the pre-blur, not the shading. Strategy: downsample heightmap to ≤1024 px (bump tolerates it), cache pre-blurred H, only recompute when Smoothness or Bump source changes. Live light-direction scrubbing via cached H is fast (~5–20 ms re-shade). WebGL fragment-shader path is a future optimisation if the user demands real-time everything (parked under a "WebGL upgrade" note, not in v1). **References**: glfx.js bumpDistortion, three.js `MeshPhongMaterial` bumpMap source, ShaderToy "Phong bump" canonicals (Inigo Quilez). **Effort estimate** (per research): medium difficulty, 1–2 days for a polished v1 in Canvas 2D. **Pack home**: ships the Surface Pack alongside 3D — both are material/lighting effects sharing the same height-field + Phong infrastructure (consider extracting the shared pre-blur + normals math into `src/plugins/premium/_shared/heightfield.js`).

- [ ] **Holographic Foil** 🟧 PREMIUM (Surface Pack) — Stylize. Turns the layer into a shifting iridescent surface, like real holographic foil — Pokémon holo cards, vinyl stickers, Y2K branding, hyperpop. Reuses Surface Pack's `_shared/heightfield.js` (height-from-luma + Gaussian pre-blur + Sobel normals from Plastic). **Algorithm**: heightmap → per-pixel normal → instead of Phong shading, sample a thin-film interference colour LUT indexed by `N · L` (or `N · V` for viewing angle) → optional sparkle layer (high-frequency noise modulating specular intensity). Different shading function on the same heightfield as Plastic. **Controls**: Light direction (azimuth + elevation puck), Colour cycle range (full spectrum / pastel / neon / custom 3-stop, picker hooks into Phase 23 Color System), Frequency (colour bands per unit angle), Sparkle amount, Roughness, Mix with original (tint a photo iridescent without losing it). **Effort**: medium. 1–2 days once the heightfield helper is extracted from Plastic.
- [ ] **Liquid Chrome** 🟧 PREMIUM (Surface Pack) — Stylize. Heightfield → reflective metal shader. Polished Terminator-2 / chrome-typography vibe. Y2K essential. Same heightfield + normals as Plastic + Holographic Foil; the shading samples an environment-map gradient (sky-to-ground vertical gradient, customisable) reflected via the normal vector, plus a tight specular highlight — looks like chrome reflecting a sky. **Controls**: Environment gradient (3-stop sky / horizon / ground, with built-in presets: classic chrome, gold, copper, oilslick), Roughness (blurs the env-map sample), Specular intensity, Light direction, Mix. **Pack arc**: Surface Pack now reads as 3D (sculpting) → Plastic (matte glossy) → Holographic Foil (iridescent) → Liquid Chrome (reflective) — cohesive product story. **Effort**: medium. 1–2 days once heightfield helper exists.
- [ ] **Time Smear** 🟦 PREMIUM (Glitch Pack) — Distort/Glitch. Unified temporal-corruption effect combining Echo + Trails + Slit-Scan into one tool with a mode picker. All three modes share the "displace pixels through a temporal axis on a still image" idea, so bundling avoids three sibling plugins doing closely-related work. **Modes**: (a) **Echo** — N (1–32) discrete offset+faded copies along a direction vector, per-step hue-rotate + rotate for stroboscopic / video-feedback look, blend mode per echo, opacity falloff curve, spacing in px; (b) **Trails** — continuous directional smear (motion-blur cousin), opacity gradient from source to tail, length, taper; (c) **Slit-Scan** — per-row or per-column resample driven by a displacement map (Self luma / Self alpha / Other layer / Procedural noise), axis (horizontal / vertical / radial), strength, smoothing — photo-finish-camera vibe; (d) **Hybrid** — slit-scan offset + echo stack, for the wildest combinations. **Shared controls** (all modes): Direction (Azimuth puck), Strength, Edge mode (clamp / wrap / mirror / transparent), Mix. Switching modes preserves shared params (direction, strength, mix) so the user can flip between modes without losing the visual. **Pack home**: Glitch Pack alongside Datamosh + JPEG Compression. Gives the pack a clear "temporal corruption" theme. **Effort**: medium (3 modes share the resample + direction infrastructure, but each has its own kernel) — 2–3 days for a polished v1.
- [ ] **Glitch Text Builder** 🟦 PREMIUM (text-only) — Stylize. Text-layer-only effect for the full "text becoming corrupted" toolkit. No equivalent in browser editors. Lives under `src/plugins/premium/glitch-text/`. **Modes** (one effect, multiple sub-systems composable): (a) **Char Replace** — randomly swap N% of glyphs with similar-looking glyphs from a pool (Latin / Cyrillic / mathematical / zalgo, with pool editor); (b) **Drift** — per-glyph X/Y jitter, optionally driven by procedural noise so the text shimmers in a controlled way; (c) **Scanline Corruption** — slice text horizontally and offset slices (text-tuned VHS tracking); (d) **Chromatic Split** — RGB-shifted glyph copies (text-tuned RGB Shift); (e) **Cursor Artefacts** — fake terminal cursor blinks, line wraps mid-glyph; (f) **Replace Pool Editor** — user picks which character classes are in the replacement pool. Effect manifest gates `supportedLayerTypes: ['text']` so it doesn't appear in the Add menu on image / vector layers. **Pack home**: standalone premium with own pack tag — if more text-only effects emerge, they form a "Type Pack" together. **Effort**: medium-high. Infrastructure is straightforward but the modes need polish — 3–4 days for a v1 with all modes working.

### Phase 27 — Photoshop Staples Catch-up (free, batch)

> Honest-coverage pass: effects every Affinity / Photoshop user instinctively reaches for and is surprised slammer doesn't have. Ship as a single focused sprint — they're each small, but together they close obvious gaps. All free, all under Adjustments / Stylize categories.

- [ ] **Gradient Map** — Adjustments. Highest-leverage of the batch: maps each pixel's luminance to a colour gradient. Black input → first stop, white → last stop. Industry-standard cinematic colour-grading tool. **Pulls from the existing Gradient Library** (Phase 23 + the Gradient Library plugin) so the user can drop a curated gradient directly onto the effect — turns slammer's gradient catalogue into a one-click colour-grading library. Controls: gradient picker (`gradientStopsRow` + drop-target for `application/x-slammer-gradient`), preserve luminance toggle, opacity, blend mode (re-uses canonical `BLEND_MODES`). ~150 lines of LUT-build + per-pixel apply.
- [ ] **Edge Detection / Find Edges** — Stylize. Sobel-style outline pass with strength + invert + threshold + edge thickness + colour mode (mono / per-channel / source-tinted). Photoshop Stylize staple, surprisingly absent. Doubles as a creative effect (line-art look) and a utility (mask source for compositing).
- [ ] **Solarize** — Stylize. Classic Sabattier-effect: invert pixels above a luminance threshold, leave dark pixels alone. Single-knob effect (threshold 0–255) plus Inverse toggle (invert below instead of above). Massive visual identity for ~30 lines of code.
- [ ] **HSL adjust per hue range** — Adjustments. Lightroom-style selective colour panel: 8 hue ranges (red / orange / yellow / green / aqua / blue / purple / magenta), per-range Hue / Saturation / Luminance sliders. UI: tabbed strip across the top selects active range, three sliders below. Pro photography / colour-grading staple.
- [ ] **Black & White (channel-mixer)** — Adjustments. Proper B&W conversion: per-source-channel weight sliders (R / G / B sum to 100 %, optionally normalisable), tint colour at the end (warm / cool / sepia / custom), tone-preservation toggle. Far better than `Saturation = 0`. Replaces the de-facto B&W path users currently fake via Levels.

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

### Phase 28a — License-key MVP (must ship for v1.0)
> Activation path 1 from STRATEGY.md "How you keep your purchases". License keys are the always-works default. No login required.

- [ ] **Cloudflare Worker** (`api.slammer.app/license`):
  - `POST /verify` — accepts Polar license key, validates against Polar API, returns signed JWT containing `owned: string[]` (item IDs) + `exp` (24h)
  - `POST /webhook` — receives Polar `checkout.completed`, caches user's purchase set in KV for fast subsequent verifications
  - `GET /download/:itemId` — accepts JWT, returns short-lived signed URL for the matching R2 object
- [ ] **Cloudflare R2** bucket (`bitmancer-library`): premium plugin bundles + asset-pack ZIPs; access only via Worker-signed URLs (no public bucket)
- [ ] **Cloudflare KV** (`bitmancer-licenses`): user → owned-item-IDs cache, ~5 min TTL, refreshed by webhook
- [ ] License-key entry UI in Settings → **Library** tab (new): paste key, status indicator, "Refresh ownership" button
- [ ] JWT cache in IndexedDB; auto-renew on near-expiry; offline-tolerant (last good token cached, Library still shows owned items if validation server is briefly unreachable)
- [ ] Local fallback `slammer:license:keys` store — multiple keys can be pasted (one per plugin / bundle); offline reactivation when worker is reachable but Polar API is down

### Phase 28b — Polar account sync (post-MVP convenience)
> Activation path 2 from STRATEGY.md. Builds on top of 28a — license keys still work, sync layers in.

- [ ] **Cloudflare Worker** OAuth endpoints:
  - `POST /license/oauth/start` — initiates Polar OAuth, returns redirect URL
  - `POST /license/oauth/callback` — exchanges OAuth code for token + customer ID
  - `GET /license/sync` — given the OAuth token, fetches all customer's purchases from Polar, returns JWT covering everything owned
  - `GET /license/refresh` — refresh-token-based JWT renewal
- [ ] Settings → Library tab gains a "Sign in to Polar" / "Sign out" action. Status badge shows email when signed in.
- [ ] In-app shop header gains a small "Sign in" CTA when not authenticated.
- [ ] Logout clears `slammer:license:jwt` + `slammer:license:user`; does NOT remove installed plugin bundles or stored keys (graceful degrade — user keeps using until JWT expires from cache).
- [ ] Comp-key workflow: 100%-off Polar discount codes (e.g. `BITMANCER-PRESS-2026`) for friends + press. Recipient checks out at €0, gets real key, activates exactly like a paying user — no special slammer code path.

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
- [ ] **FX vs Plugins distinction on shop cards** — currently the shop popup mixes Effects (filters/tools) and panel Plugins in one grid with the same chrome. Use the existing `.shop-card-stamp` element on each card to tag the kind: `EFFECT` for `type === 'filter' \| 'tool'`, `PLUGIN` for `type === 'panel'`. Stamp colour matches the pack accent for effects, neutral for plugins. Filter pills at the top of the shop popup gain matching `Effects` / `Plugins` toggles so the user can scope the grid to one kind. Wire-up in `src/ui/shop-popup.js` (`renderCard()` + the `PLUGIN_PALETTE` / `PACK_INFO` data layer).

### Asset-pack format
- [ ] Spec: `.zip` containing `manifest.json` (id / name / version / type / contents) + asset files
- [ ] Types: `texture` (PNG/JPEG batch), `gradient` (JSON list of stops), `font` (TTF/OTF/WOFF2 with metadata), `vector-kit` (SVG batch), `template` (`.slammerproj` files)
- [ ] Importer in Bitmancer Library handles each type → routes to appropriate registry (texture cache / gradient store / font upload pipeline / project store)

### Pre-launch validation
- [ ] Three-test gate: every premium item in the launch catalog must individually pass the **Tutorial / 2-Hour / Eigengeld** tests in [STRATEGY.md](STRATEGY.md). Maintainer signs off in writing per item before it's listed in Polar.

---

## PHASE 30 — Themes 🆕

- [ ] **Theme switcher** — Settings → General. Three built-in themes + system auto. Implemented via a top-level `[data-theme="dark|anthracite|light"]` attribute on `<html>` that flips all CSS custom properties in `variables.css`. Dark stays the default.
- [ ] **CSS variable layer**: define every surface/text/border colour as a `--sl-*` variable in `variables.css`, with dark values as default and overrides under `[data-theme="anthracite"]` and `[data-theme="light"]`. Audit all hardcoded `#xxx` / `rgb()` in `components.css` and inline styles — migrate to variables.
- [ ] **Dark** (default) — current colour scheme, unchanged.
- [ ] **Anthracite** — mid-tone grey theme, slightly lighter than Dark. Warm charcoal surfaces (~`#2a2a2e` panels, `#343438` sidebar, `#3e3e42` cards) instead of the near-black current palette. Softer contrast, easier on the eyes for long sessions. Same text/icon colours as Dark, just lifted backgrounds.
- [ ] **Light** — full light mode: light grey/white surfaces, dark text, adapted icons.
- [ ] **Canvas background**: each theme gets its own checkerboard / grid / ruler tones. Anthracite uses a subtly lighter checker than Dark; Light uses warm grey or white.
- [ ] **Accent colour interaction**: user's chosen accent (`--ctx-accent`) stays unchanged across all themes; only surface/chrome colours flip. Ensure contrast ratios pass WCAG AA in every theme.
- [ ] **Persist** theme choice in `slammer:settings.theme` (values: `dark` / `anthracite` / `light` / `system`). `system` follows `prefers-color-scheme` media query (maps to Light or Dark; Anthracite is manual-only).
- [ ] **Transition**: smooth 200ms transition on theme swap (on `background-color`, `color`, `border-color` only — no transition on box-shadow or transform to avoid jank).

### Phase 30b — Custom Theme Editor (v2) 🆕

> Builds on Phase 30's CSS variable infrastructure. Ship after the three fixed presets are stable.

- [ ] **Theme Editor UI** — Settings → Themes tab. Colour pickers for the ~8-10 key surfaces: panel background, sidebar, cards, borders, text primary/secondary, canvas checker, scrollbar. Live preview while editing — changes apply instantly via `style.setProperty`.
- [ ] **Save / Load / Delete** custom themes — stored in `slammer:settings.customThemes` (array of `{ name, colors }` objects). Theme switcher dropdown shows built-in presets + user themes.
- [ ] **Duplicate preset as starting point** — user picks Dark/Anthracite/Light, hits "Customize", edits from there instead of starting blank.
- [ ] **Import / Export** — JSON file in/out so users can share themes. Drag a `.slammer-theme.json` onto the app to import.
- [ ] **Community themes** — potential future tie-in with F4 (Community Plugin Marketplace): themes as a shareable asset type alongside plugins and asset packs.

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
| **Glitch Pack** | Datamosh · JPEG Compression · **Time Smear** (new) | Datamosh + JPEG migrated; Time Smear TBD (combined Echo + Trails + Slit-Scan) |
| **Raster Pack** | Dither · Halftone (raster) · **ASCII** (new) | Dither migrated; raster Halftone + ASCII TBD |
| **Dots Pack** | Stipple · Halftone (vector) | Migrated, pre-existing functionality |
| **Liquid Pack** | Twirl · Ripple · Bulge · **Liquify** (new) | Twirl/Ripple/Bulge shipped Phase 20; Liquify TBD |
| **Gradient Pack** | Liquid Gradients (rename from Organic Gradient) · Mesh Gradient · Gradient Library | Shipped as "Infinity Gradients"; renaming pack + lead effect |
| **Mosaic Pack** | Emoji · Photo Mosaic · Pixel Art · LEGO Brick (all new) | New pack — all TBD |
| **Surface Pack** | 3D · Plastic · **Holographic Foil** · **Liquid Chrome** (all new) | New pack — all TBD; share `_shared/heightfield.js` math (pre-blur + normals + Phong). Pack arc: 3D (sculpting) → Plastic (matte glossy) → Holographic Foil (iridescent) → Liquid Chrome (reflective) |
| **Type Pack** | **Glitch Text Builder** (new, text-only) | New micro-pack for text-only premium effects; one member at launch, room to grow |

**Existing premium plugins (migrated from free folders, polish pending):**
- [x] **Datamosh** — moved to `premium/datamosh/`, `pack: 'glitch-pack'`
- [x] **JPEG Compression** — moved to `premium/jpeg-compression/`, `pack: 'glitch-pack'`
- [x] **Dither** — moved to `premium/dithering/` (id stable), `pack: 'raster-pack'`
- [x] **Stipple** (vector) — moved to `premium/stipple/`, `pack: 'dots-pack'`
- [x] **Halftone** (vector) — moved to `premium/halftone/`, `pack: 'dots-pack'`

**New premium plugins / effects / assets (build queue):**
- [ ] **Halftone (raster)** — real screenprint dot pattern with DPI + angle + dot-shape (distinct from vector Halftone, distinct from Dither's halftone mode). Goes into Raster Pack alongside Dither.
- [ ] **ASCII** 🟦 PREMIUM (Raster Pack) — converts image to ASCII art. Grid of cells, each cell's average luminance mapped to a character from a density ramp. Controls: cell size, font size, character set (preset + custom), foreground/background colour mode (original colour / monochrome / custom), contrast, invert. Preset character sets: Standard (` .:-=+*#%@`), Blocks (`░▒▓█`), Braille, Minimal, Digits, Katakana. Custom character set input field lets users type their own ramp. Output rendered onto canvas via fillText at cell positions — stays raster, not a text layer. Goes into Raster Pack alongside Dither + Halftone.
- [ ] **Instagram Importer** plugin — login-free public profile scraping or oEmbed-based, pulls user's own posts as image layers
- [ ] **Social Media Templates** plugin (panel type) — browseable library of social-media frame templates (Instagram square / story / reel cover, TikTok, Twitter card, LinkedIn banner, YouTube thumb, Pinterest pin, etc.). Each template = a `.slammerproj` snapshot with placeholder layers + a frame at the platform's exact px dimensions. Drag-and-drop a template onto the canvas to instantiate it as a new project (or as new layers in the current project). Categories: Instagram · TikTok · Twitter / X · LinkedIn · YouTube · Pinterest · General. Search + tag filter. Stored under `src/plugins/premium/social-templates/` with `pack: 'templates-pack'` (new pack — could grow with brand-kit / poster / lookbook templates later).
- [ ] **Monolab-inspired effects audit** (research-derived candidates) — the iOS app monolab.app ships 140+ "concept-based" filters; several are gaps in our catalog and resonate with the slammer.app aesthetic. Candidates to slot into Phase 27 free / Surface Pack / Glitch Pack as appropriate: **Local Threshold / Adaptive Threshold** (Sauvola/Niblack — superior to global threshold for Y2K xerox aesthetic, complements Dither/Halftone), **Moiré Drift** (interference-pattern overlay; pairs with Halftone), **Engraving / Lines** (directional line-screen / hatching, vector-friendly, fits SVG export), **Trace Tone / Relief** (auto-vectorisation: raster → Paper.js path contours by luminance bands — leverages existing vector layer infrastructure), **Edge Halo** (structural haloing, distinct from edge-detection outline), **Vector Field Warp** (field-driven displacement; distinct from Twirl/Ripple/Bulge radial primitives), **Fragment Field / Multi-Exposure Shards** (between RGB Shift and Datamosh tonally), **Echo Grid** (grid-quantised replication, complements Halftone/Stipple on a discrete lattice), **Residual Self / Long-Exposure Ghost** (luminance-based ghosting/decay overlay). To be triaged + scoped per effect when the maintainer prioritises.
- [ ] **Background Removal** plugin (client-side) — runs on local model (e.g. ONNX U²-Net or BiRefNet via WebGPU/WASM). Available as both standalone plugin AND as a per-layer effect.
- [ ] **AI Inpainting** plugin — fal.ai-backed (BYO key), masked region → AI fill
- [ ] **Soft Face Filter** effect — lightweight skin-smoothing / colour-balancing for portraits
- [ ] **Y2K Vector Pack** assets — curated SVG kit (logos, shapes, ornaments, stickers)
- [ ] **Xerox Textures** asset pack — high-res scan textures of photocopied / faxed material
- [ ] **Vignette** effect — standalone radial darkening/lightening. Extracted from Organic Gradient (which loses its built-in vignette). Controls: amount, roundness, feather, midpoint, colour. Free or premium TBD.
- [ ] **CRT Look** effect — scan lines + RGB bleed + bloom + vignette + barrel distortion preset
- [ ] **Mesh Warp** plugin — pin-mesh deformation (also on Phase 27 Deform tab; if shipped here, drop the Phase 27 Mesh Warp sub-task)
- [ ] **Emoji** 🟨 PREMIUM (Mosaic Pack) — two layout modes in one effect. **Grid mode**: splits image into a cell grid, computes each cell's average colour in CIELAB, matches to the perceptually closest emoji. **Scatter mode**: luminance-driven density scatter (Poisson disk sampling) — darker areas get more/larger emoji packed tighter, lighter areas sparser. Emoji overlap, vary in size, and rotate randomly for an organic collage look (similar to Stipple's spatial distribution but with emoji glyphs). Ships a Twemoji sprite atlas (~200KB, CC-BY 4.0) for pixel-identical cross-platform rendering. Shared controls: emoji set (Full / Faces / Nature / Food / Objects / custom subset), background mode (transparent / original / solid), colour bias strength. Grid controls: cell size. Scatter controls: density, size range (min/max), rotation variance, overlap amount. Live preview at reduced resolution during slider drag, full-res on release.
- [ ] **Photo Mosaic** 🟨 PREMIUM (Mosaic Pack) — rebuilds the image from a library of small tile images. Integrates with the Unified Media Library (Phase 25) and plugin folders: user selects a folder of images as the tile source. Each cell's average colour matched against tile averages via CIELAB Delta-E. Controls: cell size, tile repetition limit (min distance before reuse), colour tint strength (blend tile toward target colour vs show original tile), tile rotation (0° / random / match gradient), source folder picker. Falls back to a bundled default tile set (geometric shapes / textures) when no folder is selected.
- [ ] **Pixel Art** 🟨 PREMIUM (Mosaic Pack) — downscales the image to a low-res grid then renders each cell as a clean flat-colour square (nearest-neighbour upscale with hard edges). Controls: cell size (pixel block size), colour palette (Unlimited / NES 54 / Game Boy 4 / SNES 256 / C64 16 / CGA 16 / custom palette picker), dither within palette (none / ordered / Floyd-Steinberg), outline mode (adds 1px dark outline per colour region for a sprite look), grid lines toggle. Distinct from Dither: Pixel Art enforces flat fills per cell and palette-locks, Dither preserves continuous tonal gradients.
- [ ] **LEGO Brick** 🟨 PREMIUM (Mosaic Pack) — renders the image as a grid of LEGO-style circular studs. Each cell becomes a raised stud with a subtle 3D bevel (CSS-style radial gradient for the dome highlight + shadow). Controls: stud size, colour palette (Official LEGO 40-colour palette / extended / full), plate colour (baseplate behind studs), bevel strength, gap size between studs, shadow direction. Output looks like a real LEGO mosaic set instruction — could pair with a "parts list" export (count per colour) as a bonus feature.
- [ ] **Noise Blur** effect 🟦 PREMIUM (Glitch Pack candidate) — custom-mask-driven variable-strength blur (per-pixel blur amount sampled from an upload-able mask / noise texture). Sits next to the Phase 27 free Blur as a dedicated premium variant; lets the user paint where blur is sharp vs soft. UI: mask drop-zone + noise-fallback generator + per-channel strength curve.
- [ ] **Liquify** effect 🟦 PREMIUM (Liquid Pack) — domain-warped displacement. Uses the same multi-iteration simplex noise engine as Liquid Gradients, but instead of mapping noise → colour, it maps noise → per-pixel displacement (dx, dy). Result: organic, flowing distortion with much more structure and control than the basic value-noise Displacement effect. Controls: scale, warp strength, warp iterations (1–4), edge mode (clamp/wrap/mirror), seed, "Move on canvas" spatial offset (shared concept with Liquid Gradients). Animate toggle reuses the same rAF tick + time-offset architecture. Think: Photoshop Liquify-meets-procedural-distortion — no brush painting, pure generative warp.

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
- [ ] Liquid Gradients overhaul (currently "Organic Gradient") — rename + restructure + new capabilities:
  1. **Rename + new icon** — `Organic Gradient` → `Liquid Gradients` everywhere (id, display name, manifest, shop card, PACK_INFO). Pack rename: `infinity-gradients` → `gradient-pack`. The existing icon (currently `fa-droplet` or similar) reads as a generic colour icon; swap to something more evocative of liquid/flow — candidates: `fa-water`, `fa-wave-square`, a custom inline SVG of a flowing wave. Pick during implementation.
  2. **Gradient Library integration** — if the user owns the Gradient Library plugin, show a "Browse presets…" button that opens the library and lets the user pick a gradient to use as the colour source. Falls back to the built-in stops editor if library isn't owned.
  3. **Play/Pause animation** — replace the current on/off toggle with a play/pause button. Pausing freezes the animation at its current time offset (keeps the visual state). Stopping/disabling should NOT reset to start — the frozen frame is the feature.
  4. **Remove Mix knob** — redundant now that we have global per-effect opacity/mix slider.
  5. **Remove Vignette** — extract to standalone Vignette effect (see build queue above). Liquid Gradients should do one thing well.
  6. **"Move on canvas" mode** — toggle button: when enabled, the user can grab and drag the noise texture across the layer, offsetting it in X/Y. Similar to the time-offset concept but spatial, in all directions. Persisted as `offsetX` / `offsetY` params. Works with or without animation.
  7. **Shop restructuring** — move from Infinity Gradients pack to new **Gradient Pack** alongside Gradient Library and Mesh Gradient. Update `PLUGIN_PALETTE`, `PACK_INFO`, and shop card in `shop-popup.js`.

**Open decisions** (defer until Phase 28 / launch nears):
- Per-plugin price points (single plugin €5–10, but flat or tiered?)
- Pack discount: 30 % off pack vs sum of singles is the working model
- Lifetime bundle inclusion: every F5 item ships into Lifetime automatically (per STRATEGY.md)
- Whether Background Removal local model is allowed in free fork too (no — too valuable to give away, keep premium even though tech is OSS)

**Prerequisite**: Phase 28 Bitmancer Library Storefront must be live before any F5 item can be sold publicly. Until then, all F5 work is private development against the dev-loader.

### F6 — Collaborative Canvas (v2 idea, exploratory)

**Intent**: turn slammer.app from a single-player editor into a multiplayer canvas. Two flavours of multiplayer, both running on the same realtime layer:

1. **Private co-working** — invite-only sessions. Friends, classes, agencies build moodboards, edit projects, or jam on visuals together in one shared canvas. Cursors with names, live layer edits, presence indicators.
2. **Public open boards** — large shared canvases where strangers find each other and claim a corner to work in. Think Reddit r/place meets a real image editor. Persistent canvases hosted on Bitmancer-managed public servers, with separate boards for themes / events / community jams.

**Status**: idea / exploration only. No commitment, no architecture decisions — flagged here so it's not lost. v2 territory: not before Phase 30 ships and the v1 product is stable.

**Core technical questions to answer before committing**:
- Realtime backend choice — CRDT (Yjs / Automerge) over WebSocket, or operational-transform server, or hosted service (Liveblocks, PartyKit, Cloudflare Durable Objects)?
- Conflict semantics for non-trivial state: layer transforms, vector path edits, effect param sliders, font assets — every mutation must merge sanely under concurrent edits.
- Asset hosting — collaborative canvases can't ship images as base64 in the doc (too heavy for sync). Need an asset-storage layer (R2 + signed URLs?) so layers reference URLs instead of inlined Blobs.
- Permission model — host vs editor vs viewer; locked layers; edit history per user.
- Public-board moderation — open canvases will get vandalised. Need flag/report, soft delete, mod tools, rate limits, region-claim ("you own a 1024×1024 patch for X minutes after last edit").
- Cost model — collaborative features need a backend, breaking the no-server promise of v1. Public boards might be a Pro/Lifetime perk; private co-working could be a paid add-on or a Pro tier.

**Sub-deliverables** (none committed, all exploratory):
- [ ] **Realtime spike**: prototype a 2-cursor demo on a single project — share Konva stage state via Yjs over WebSocket. Just to validate the latency + merge story.
- [ ] **Asset URL layer**: refactor image layers to support URL-source images alongside the existing Blob/data-URL path. Required prerequisite — no point building collab if assets can't sync.
- [ ] **Presence layer**: cursor + selection broadcast on top of the realtime backend.
- [ ] **Layer-edit conflict semantics**: define how `setLayerTransform`, `setEffectParams`, vector path edits, and history snapshots merge under concurrent writers.
- [ ] **Private session MVP**: invite link → join existing project as collaborator. No public boards yet.
- [ ] **Public-board MVP**: one large canvas (e.g. 8192×8192), region claims, basic moderation. Probably ships as a separate `/boards/<id>` route.
- [ ] **Asset upload + R2 hosting** for shared sessions.
- [ ] **Pricing decision**: standalone subscription? Pro-tier perk? Per-board credits?

**Open questions to think about before any of this**:
- Does collaboration align with the "tool for solo creative slamming" identity, or does it dilute it?
- Public boards bring real moderation/legal exposure (NSFW content, copyrighted material posted by strangers). Does Bitmancer want to be in that business?
- Is private co-working a feature people will actually use, or is "share a screenshot of my work" enough? Validate with users before building.

**Prerequisite**: v1 product stable, Phase 28 commerce live (so a pricing model exists), Phase 30 themes shipped (so collaborators can use the same UI). Realistic timeline: 2027+ — exploration only until then.

### F7 — Tutorial Recorder (in-app screen + mic capture)

**Intent**: lower the friction for users to record their workflow and post it to social media. Tutorials, before/after reels, glitch-process clips, behind-the-scenes — all from inside slammer, no third-party recorder needed. **The strategic angle is distribution**: the easier it is to record, the more user-generated tutorial content lands on YouTube / TikTok / Twitter, and that content is the discovery channel for slammer.app's tribe (per STRATEGY.md "discover tools through YouTube tutorials, not LinkedIn"). Every recording shipped is a free billboard.

**Stack**: pure browser APIs, no native plugin, no server. Target browsers: Chrome / Edge / Firefox desktop. Safari macOS works for `getDisplayMedia` since 13.1 — usable. Mobile Safari has no `getDisplayMedia` — out of scope.

- `navigator.mediaDevices.getDisplayMedia()` — user picks tab / window / full screen via browser dialog (no way around this dialog, it's a permission gate).
- `navigator.mediaDevices.getUserMedia({ audio: true })` — mic source.
- Web Audio API (`AudioContext` + `MediaStreamAudioSourceNode` + `MediaStreamAudioDestinationNode`) — mix mic + tab audio (where Chrome supports tab audio in `getDisplayMedia`) into one track.
- `MediaRecorder` — encodes the combined video + audio stream to WebM (VP9 + Opus by default).
- Output Blob → download or save into the Library (Phase 25) as a recording asset.

#### v1 — Basic recorder (~1–2 days)

- [ ] **Record button** in the footer (or in a dedicated quick-access slot) — small red dot, tooltip "Record screen". Click → opens browser source picker. Selecting a source starts the recording, button turns into a stop indicator with live elapsed time.
- [ ] **Mic toggle** in the recording control: on by default if the user grants mic permission, off if they decline. Mic level meter (3-bar visual) shows live audio while recording.
- [ ] **Pause / Resume** — `MediaRecorder.pause()` / `.resume()`.
- [ ] **Stop → Save dialog**: "Save as WebM" download or "Add to Library" (Phase 25). Default filename: `slammer-{project}-{YYYY-MM-DD-HHMM}.webm`.
- [ ] **Permission persistence** — once user grants mic + screen, store the preference so subsequent recordings don't need re-grant within the same session (browser handles this anyway, but we acknowledge it in UI copy).
- [ ] **Settings → Workflow → Recorder** sub-section: default mic source pick, default output format (WebM only in v1), record-cursor toggle (browser handles cursor capture).

#### v2 — Polished recorder (~3–4 extra days)

- [ ] **Webcam picture-in-picture** — overlay a small webcam feed in a draggable corner of the recorded canvas. Implemented via a separate `getUserMedia({ video: true })` stream composited onto an OffscreenCanvas, fed back into MediaRecorder via `canvas.captureStream()`. Toggle on/off mid-recording.
- [ ] **Trim before save** — after stop, show the recorded WebM in a small preview popup with start/end handles to trim. Trim happens client-side via `MediaSource` or by re-encoding the trimmed range with MediaRecorder.
- [ ] **Cursor highlight overlay** — optional yellow ring around the cursor to make tutorials clearer. Compositing layer on the canvas, disabled outside recording mode.
- [ ] **Click-zoom** — when a click happens, briefly zoom-pulse the area for emphasis (optional, off by default). Useful for short-form vertical-video tutorials.
- [ ] **Multi-take stitching** — record several takes and concatenate them into one WebM via segmented MediaRecorder.

#### v3 — Pro recorder (defer to demand, ~5–10 days)

- [ ] **MP4 export via ffmpeg.wasm** — for users who want native social-media compatibility without re-encoding elsewhere. Bundle is ~25 MB so this is probably opt-in via a "MP4 transcode (one-time download)" prompt, not a default load.
- [ ] **Vertical-format crop** — pre-crop the recording to 9:16 / 1:1 while recording so the output is ready for IG Reels / TikTok without post-processing.
- [ ] **Annotation overlay** — type text / draw arrows directly during pause-frame for educational call-outs. Composited onto the video before encoding.
- [ ] **One-click share** — direct intent-based share to Twitter / LinkedIn (URLs only) or copy-to-clipboard for paste into TikTok / YouTube uploaders.

#### Strategic notes

- **Free, not premium.** This is a distribution multiplier; gating it behind a paywall defeats the purpose. Lives in the free app forever.
- **Embed in Bitmancer Shop** (post-Phase 28): premium pack pages can link to a Tutorial Recorder demo of using the pack's effects. Self-recorded by maintainer, takes minutes. Lowers friction for premium purchases.
- **Tribe alignment** — STRATEGY.md says the audience "discovers tools through YouTube tutorials, not LinkedIn". The recorder turns every user into a potential micro-tutorial creator without forcing them to learn OBS / ScreenPal / QuickTime.
- **No telemetry attached** — the recording stays local, no tracking, no upload. Users export when they choose.

**Pricing**: free, in core app. No Pro gate.

**Prerequisite**: nothing — can ship anytime after v1 is stable. Could ship before Phase 30 themes if the maintainer wants the distribution lever sooner.

**Open questions**:
- Should recordings auto-save into the Library (Phase 25) as a side-effect, so users find their recordings later? Probably yes.
- Should the recorder be limited to recording the slammer canvas tab only, or full-screen too? Full-screen unlocks "screen + camera face-cam" tutorials but increases the footprint of the feature. Default to full freedom (browser dialog already lets the user choose).
