# CLAUDE.md — Hard-Won Knowledge

> Working notes for Claude. Complements `AGENTS.md` (which covers the general project shape). This file is the place to record gotchas, library quirks, and architectural conventions that have already cost time to figure out — so the next session doesn't relearn them.

## House rules (per user MEMORY.md)

- **Custom scrollbars only** — never ship the native OS scrollbar. Applies to in-page scroll containers AND custom dropdowns.
- **Never mutate the live document via `preview_eval`** — verification probes must be READ-ONLY. Any `addLayer`/`setProp`/etc. via `preview_eval` gets autosaved over the user's real project. Use eval to *inspect* state; use the UI (or actual code edits + HMR) to *change* it.

## Stack additions beyond AGENTS.md

- **Paper.js** (`paper@^0.12`) — vector path engine. Used for bezier maths, path simplify, SVG import/export, boolean ops (Phase 13c).
- **opentype.js** (`opentype.js@^1.3.5`) — font glyph extraction for Text→Path. **Cannot decode woff2** on its own (no Brotli) — see Text→Path section below.

## Vector layer architecture (Phase 13)

The vector layer broke twice while figuring this out. The current convention is **top-left origin with locked transform**:

- `layer.transform.x/y` = the rotation/scale anchor in world. **Set ONCE at layer creation by the shape-drawer / pen / pencil. Never updated by anchor edits, shape param edits, or path mutations.**
- **Path coordinates are in WORLD space** — not local to the layer transform. The same path data describes the same world location regardless of `layer.transform.x/y`.
- `group.offset({x:0, y:0})` always.
- `image.position` compensates for the path bounds drifting as the user edits:
  ```
  image.x = pathBounds.x - layer.transform.x - pad
  image.y = pathBounds.y - layer.transform.y - pad
  ```
  Where `pad = 16` (hardcoded in `vector-renderer.js`). This formula keeps `world(canvas-pixel for path-coord lx) === lx`.

**Why this was hard**: an earlier attempt used a centre-origin convention with three coupled coordinate systems (transform + group.offset + image.position). The user reported "vectors constantly shifting around" — root cause was the bookkeeping, not the library. Reverting to top-left + locked transform fixed it. **Do not reintroduce centre origin.** If you need rotation around a centroid, do it via Konva rotation around `transform.x/y` set to the centroid at creation time — but DON'T mutate `transform.x/y` later.

**Implication for new tools**: when generating paths (text-to-path, SVG import, future things), output coords must be in world space. Layout `firstAnchor.x = layerTransform.x + offset` etc. — not just `offset`.

## Phase 13b features and where they live

| Feature | File |
|---|---|
| Pen tool (P) | `src/ui/vector-tools/pen-tool.js` |
| Pencil tool (B) | `src/ui/vector-tools/pencil-tool.js` |
| Anchor overlay + Direct Selection | `src/ui/vector-tools/anchor-overlay.js` |
| Text→Path conversion | `src/ui/vector-tools/text-to-path.js` |
| Active tool registry | `src/ui/vector-tools/active-tool.js` |
| Vector panel UI (sub-path picker, fill/stroke, shape params) | `src/ui/vector-tool.js` |
| Pencil smoothness slider (footer) | `src/ui/toolbar.js` + `index.html` |
| Settings: `textToPathReplace` toggle | `src/ui/settings-popup.js` |

## Library quirks

### Konva
- **`Konva.dragButtons = [0]`** is set globally so middle-mouse pan doesn't trigger layer drag.
- **Custom `hitFunc` must use real Shape nodes**, not Groups. Passing a Group to `fillStrokeShape(...)` crashes with `shape.fillEnabled is not a function`. For composite hit areas (e.g. anchor halo), use `Konva.Circle` / `Konva.Line` nodes.
- **HMR + module-level state**: dynamic `import()` after HMR can reload a different copy of a module. For singleton state (active tool, paper.js project), prefer top-level imports or store the singleton on `window.__slammer`.

### Paper.js
- The project context is lost when SVG-import temporarily activates a different project. **Re-activate `paper.project` on every call** that touches Paper. See `ensureProject()` in `paper-context.js`.
- `Path.pathData` returns coords in the path's **local** space (ignoring `<g transform=...>` parents). When importing SVG, **bake `path.globalMatrix` into the segments** before extracting `pathData`, otherwise nested groups end up misaligned.
- `path.simplify(tolerance)` is destructive — call it on a temp Path created from samples, then `.remove()` it after extracting `pathData`.

### opentype.js
- v1.3.5's `opentype.load(url, callback)` is deprecated and unreliable. Use `opentype.parse(arrayBuffer)`.
- **Cannot read woff2 directly** — it expects SFNT (TTF / OTF / WOFF1). Don't use `wawoff2` to decompress; it's a CommonJS Emscripten module that won't load through Vite (silent failure).
- **Workaround**: route Google Fonts through Fontsource's jsDelivr CDN, which serves raw TTF:
  ```
  https://cdn.jsdelivr.net/fontsource/fonts/<family-slug>@latest/latin-<weight>-<style>.ttf
  ```
  Slug = lowercase, hyphen-separated. Magic bytes confirm raw SFNT (`00 01 00 00`).
- **Fontshare**: hit `https://api.fontshare.com/v2/css?f[]=<slug>@<weight>` and scrape the `.ttf` URL out of the returned CSS.
- **System fonts**: opentype can't access OS fonts without Local Font Access raw binary access — show a notification telling the user to pick a Google/Fontshare equivalent.

## Text rasteriser pad heuristic

The text rasteriser pads its canvas so blur/displacement effects don't clip:

```js
const pad = Math.min(96, Math.max(16, Math.round(text.size * 0.5)));
```

`layer.transform.x/y` for text layers points at the **top-left of the padded canvas**, so visible content starts at `transform.x + pad, transform.y + pad`. The first baseline is at `pad + size * 0.85`. Anything that needs to align with rendered text (e.g. Text→Path) must use the same pad calculation.

## Anchor-drag race fix

Editing a bezier handle fires `layer:vectorChanged` → overlay rebuild → destroys the dragged Konva node mid-drag, snapping the handle back. Fix:

- An `anchorDragging` flag short-circuits overlay refresh during drag.
- The path outline node is tagged `name="path-outline-${pathIdx}"` and updated via `findOne()` after each drag commit, instead of rebuilding the whole overlay.

## SVG path picker / multi-path layers

Vector layers can hold multiple paths (`layer.vector.paths[]`). The vector panel shows a swatch picker — one swatch per path, clicking it sets the active sub-path (so Fill/Stroke/Shape rows edit that path). The anchor overlay also fires `layer:vectorActivePath` on anchor click so the panel auto-syncs to the path you just touched.

## Phase status

- **Phase 12 — Fonts**: ✅ shipped. Google + Fontshare + Uploaded (IndexedDB) + System (Local Font Access). Variable-font axes, OpenType features, font upload UI.
- **Phase 13a — Vector foundation**: ✅ shipped. Vector layer type, shape primitives, fill/stroke/gradient, SVG drag-drop import, anchor overlay + handles.
- **Phase 13b — Pen/Pencil/anchor edits/Text→Path**: ✅ shipped.
- **Phase 13c — Boolean ops, path actions, Outline Stroke**: ✅ shipped. Stack: Paper.js `PathItem.unite/subtract/intersect/exclude/divide` for booleans (operate on the active sub-path vs the next, wrapping); `paperjs-offset` for Outline Stroke (Paper v0.12 has no native `expand()`); single-path actions (Simplify, Smooth, Reverse, Open/Close, Join, Outline) live in `src/ui/vector-tools/path-actions.js`.
- **Phase 13d — Multi-layer select + simplify slider**: ⏳ pending. Marquee select, shift-click anchors, slider-driven simplify with live preview.

## Default text font

Default text layer uses `font: 'Inter'`, `provider: 'google'` (set in `src/core/layer.js`). When editing layout-related code in the rasteriser or Text→Path, verify with the default Inter case before testing on uploaded/system fonts.

## Commit style

Conventional-commits prefix with scope: `fix(text-to-path): …`, `feat(phase13): …`. Body explains WHY. Always include the trailer:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Pre-commit hooks may rewrite line endings (`LF will be replaced by CRLF`) on Windows — that's fine, ignore the warning.
