# slammer.app — Roadmap

> Living document. Tasks get checked off as they ship.
> Small/quick fixes first. Major features last.
> Cohesive visual line maintained across every phase.

---

## Confirmed decisions

1. **Affinity reference**: working code at `C:\Users\konta\Desktop\CRUSH_app\affinity.js` — SSE + JSON-RPC 2.0 on `http://localhost:6767/sse`, talks to Affinity Photo 2's bundled MCP server, no helper needed.
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

- [ ] Fontshare integration ([fontshare.com](https://www.fontshare.com))
- [ ] Variable font controls (weight / width / slant / optical size — auto-detected axes)
- [ ] Font upload functionality

## PHASE 13 — Vector tools

- [ ] Shape tool in left sidebar with slide-out (circle, rect, star, torus + more)
- [ ] Vector pen
- [ ] Bezier editing view (double-click vector layer)
- [ ] Typo → Path button
- [ ] Path interpolation
- [ ] Pathfinder / Boolean operations
- [ ] Metaball tool

## PHASE 14 — Brush tool

- [ ] Brush tool in left sidebar; drawing creates a brush layer
- [ ] Generative brush filters: rainbow, gradient stroke, displaced stroke, noise width, speed-to-width
- [ ] Non-destructive controls on brush layer

## PHASE 15 — Masks (Affinity-style nested)

- [ ] Drag any layer onto another → becomes a nested mask
- [ ] Black hides / white shows
- [ ] Works for raster, vector, text masks
- [ ] Mask thumbnail in layer card with toggle visibility

## PHASE 16 — Plugins system

- [ ] Plugin layer architecture
- [ ] **Pexels** plugin (image search → image layer)
- [ ] **Unsplash** plugin
- [ ] **Image generation** plugin (Replicate API: NanoBanana, Flux — image-to-image, prompts, LORA support incl. `markredito/90sbadtrip`, variant count)
- [ ] **Infinite Gradient** plugin (adjustable gradient layer with `noisesc(v + udirsc(v)*t)` style)
- [ ] **Callshop Frame Generator** integration ([repo](https://github.com/bitm4ncer/Callshop_FrameGenerator))
- [ ] API keys live in Settings popup → API Keys tab

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

## Verification approach

After every phase: launch dev server, exercise the phase's features in browser, regression-check previous phases. Each task above gets ticked only after manual verification in the running app.

## Open questions deferred to specific phases

- **Phase 11**: full preset list of document sizes — confirm at phase start
- **Phase 13**: vector library choice (paper.js vs raw Konva.Path vs custom) — discuss before starting
- **Phase 16**: confirm exact Replicate model slugs at phase start
