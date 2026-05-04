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

- [ ] Split right sidebar into two sections: top **Layer Stack**, bottom contextual panels (Effects, Typography, Plugins) for active layer
- [ ] Draggable handle between sections, persist height in `slammer:ui:sidebarSplit`

## PHASE 6 — Typography polish

- [ ] Selection handles aligned to actual text bounding box
- [ ] Two text modes: **Text** / **Text Box** — slide-out mode picker on Add Text button hover, remember last used as default
- [ ] Extend negative tracking range (current `-10` too low — go to `-50` or further)
- [ ] Fix low line-height clipping (allow rows to overlap, don't cut off button row)
- [ ] Typo filters like Blur must extend beyond selection-control area (don't get cut off)

## PHASE 7 — Knobs & GUI control system

- [ ] Build reusable `Knob` component (rotary, drag + scroll-wheel + double-click-to-reset, with tiny editable input)
- [ ] Build `NumericInput` primitive
- [ ] Replace every slider across the app with the Knob + input pattern
- [ ] Add visual GUI controls where they make sense (gradient stops, curve editor, etc.)
- [ ] Pro "piece of gear" finish: subtle bevels, micro-shadows, tick marks

## PHASE 8 — JPEG compression fix + Blend Modes

- [ ] Investigate and fix JPEG Compression effect
- [ ] Add Blend Modes UI on the layer card (small prev/next icons or hover+scroll to browse — fast preview)

## PHASE 9 — FX / Adjustment Layers (non-destructive stack-level filters)

- [ ] Refactor effect pipeline to support stack-level filters
- [ ] New layer type: **FX / Adjustment Layer** (affects all layers below, non-destructive, Affinity Live-filters style)
- [ ] All filters usable as either direct effect or adjustment layer

## PHASE 10 — New filters

- [ ] **Curves** filter with GUI curve editor
- [ ] **Hue** filter
- [ ] **Color Overlay** filter (recolor free-form PNG via alpha)
- [ ] **Gradient Map** filter
- [ ] **Grain** filter (random / perlin / film / digital — adjustable, as filter or layer)
- [ ] **Displacement** FX (default noise + custom displacement texture + scale)

## PHASE 11 — Document sizes & alignment

- [ ] Document size frames (screens, social 1:1 / 4:5 / 9:16 / Stories, full DIN range, common standards)
- [ ] Frames feel like adjustable export regions, not strict page bounds
- [ ] Export popup: size, file type, quality
- [ ] Alignment controls (visible only when a document size is set)

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

---

## Verification approach

After every phase: launch dev server, exercise the phase's features in browser, regression-check previous phases. Each task above gets ticked only after manual verification in the running app.

## Open questions deferred to specific phases

- **Phase 11**: full preset list of document sizes — confirm at phase start
- **Phase 13**: vector library choice (paper.js vs raw Konva.Path vs custom) — discuss before starting
- **Phase 16**: confirm exact Replicate model slugs at phase start
