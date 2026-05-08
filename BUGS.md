# BUGS.md — parked issues

> Bugs surfaced mid-task that would have derailed momentum to fix in place.
> Each entry: short title + symptom + suspected cause + files + what was tried.
> Reviewed at phase boundaries.

---

## Met images CORS-block on drag-into-canvas

**Symptom**: Met plugin search results display correctly inside the panel (the `<img>` tags load fine — `<img>` doesn't enforce CORS for *display*). But when the user drags a Met image card into the canvas, console shows:
- `Access to fetch at 'https://images.metmuseum.org/...' from origin 'http://localhost:5173' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present`
- `[canvas-view] URL drop failed TypeError: Failed to fetch (canvas-view.js:1038)`

**Suspected cause**: `images.metmuseum.org` (the asset CDN, distinct from the `collectionapi.metmuseum.org` JSON API) does not send CORS headers. `canvas-view.js` line ~1038 does a `fetch(url)` to convert the dropped URL into a Blob layer, and that fetch is rejected at the CORS preflight.

**Files involved**: `src/ui/canvas-view.js` (drop handler around L1038), `src/plugins/panels/_shared/drop-zone.js` (likely the source of the dragged URL).

**What was tried**: nothing yet. The earlier Met API fix (commit `5f48941`) addressed the search/objects endpoint, not the image CDN.

**Possible fixes**: (a) route the image fetch through the same CORS proxy used by the API (`https://corsproxy.io/?url=`); (b) try `<img crossOrigin="anonymous">` + canvas drawImage to grab the bytes if the CDN allows that route; (c) make the drop handler accept the URL directly as the layer source so no fetch is needed (but then export would later hit the same CORS wall when rasterising).

---

## ~~Fit-to-view positions the canvas wrong on Open~~ — fixed

**Symptom (was)**: After commit `5f48941`'s `renderer.onceLayersMounted` wiring, opening a project from the project menu DOES trigger `view.fitTo()`, but the resulting view is "somewhere" — not centered on the content.

**Cause**: `view.fitTo()` used `g.getClientRect({ relativeTo: contentLayer })` per layer group. Even though `onceLayersMounted` fires after `createLayerNodes` returns, the per-layer `Konva.Image` has been initialised with `naturalSize?.w | 0 || 1` placeholder dims; the actual decoded bitmap dimensions arrive a frame or two later via `paintLayerSync`. So the rect math ran against 1×1 placeholder dims for some layers and the bbox was wrong.

**Fix**: option (b) from the original sketch. Inside `canvas-view.js#fitTo`, when `getClientRect` returns ≤2-pixel dims, fall back to `layer.naturalSize` × `layer.transform.scale*` from the doc model. Rotation is ignored in the fallback (resulting bbox over-estimates by up to √2× for a 45°-rotated layer), but that's strictly better than the wrong-by-100 % placeholder rect.

---

## ~~Undo flicker — every history step tears down all Konva nodes~~ — fixed (a6ae171)

**Symptom (was)**: Pressing Ctrl+Z / Ctrl+Y briefly blanked the canvas. The teardown loop in `case 'doc:loaded'` destroyed every Konva node and rebuilt from scratch, leaving the stage empty for several frames while bitmaps re-decoded.

**Fix**: The doc:loaded handler now diffs the new `doc.layers` against the live `layerState` Map. Layers with matching ids are patched in place via a new `patchLayerNodes(layer, st)` helper (transform/opacity/visibility setAttrs + re-rasterise + re-run effect pipeline). Only added/removed ids hit the create/destroy paths. For image layers, `rasterizeSource` short-circuits the bitmap decode when `st._sourceRef === layer.source`, so the patch is fast.

**Files**: `src/core/renderer.js` (`patchLayerNodes` + revised `case 'doc:loaded'`).

---

## Simplify slider is destructive — can't dial back to original shape

**Symptom**: Dragging the Simplify slider on a vector layer reduces anchor points, but dialing back to a lower tolerance doesn't restore the original sharp corners / square shape. The path data appears to be permanently altered after each slider interaction — the user can't return to the pre-simplified geometry.

**Suspected cause**: Phase 13d implemented the slider with ephemeral preview (`setVectorPathEphemeral` on drag, `setVectorPath` on release). But the simplification runs Paper.js `path.simplify(tolerance)` which is destructive — it replaces path segments. If the slider is re-simplifying the *already-simplified* path on each drag (instead of always simplifying from the *original* saved path data), each step compounds and the original is lost.

**Files involved**: `src/ui/vector-tool.js` (simplify slider wiring), `src/ui/vector-tools/path-actions.js` (`computeSimplifiedD()`), `src/core/document.js` (`setVectorPathEphemeral` / `setVectorPath`).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Store the original (pre-simplify) `d` path string when the slider first engages, always run `simplify(tolerance)` against that original, so dialing back to 0 fully restores it; (b) treat `simplify` as a derived view — the stored path data is always the original, simplification is applied at render time with the tolerance as a param (like a non-destructive effect); (c) at minimum, ensure the ephemeral preview path resets to the committed path on each new drag start.

---

## Mesh Gradient — control points + mesh connections broken

**Symptom**: When applying the Mesh Gradient effect, the on-canvas overlay shows control points scattered across the rectangle with criss-crossing dashed connection lines that don't form a clean grid. Multiple handles appear to be unconstrained — they sit far from where the regular grid intersection should be (e.g. a 4×4 mesh shows 16 handles but they're not laid out in a 4×4 lattice). The resulting gradient still renders something colourful, but the mesh structure is visually wrong and editing handles doesn't behave predictably.

**Suspected cause**: Either (a) the handle position storage/restore logic has drifted — handle world-coords are no longer constrained to their grid cell, or saved positions don't match the grid topology; (b) the overlay's connection-line rendering walks neighbours via wrong indices, drawing extra/wrong edges; (c) a recent Phase 19/20 refactor changed how `mesh-gradient-overlay.js` resolves grid indices vs world coords. Possibly related to layer transform changes or rasteriser pad math.

**Files involved**: `src/ui/mesh-gradient-overlay.js` (handle rendering + connection lines), `src/plugins/premium/mesh-gradient/index.js` (or wherever the manifest + process function live — confirm path; may be under a different premium folder), `src/core/document.js` (mesh handle persistence in layer params).

**What was tried**: Phase 20 shipped the bicubic Catmull-Rom + HSL tint version that was working. Something has regressed since.

**Possible fixes**: (a) audit the handle layout init — confirm a 3×3 mesh creates 9 handles at grid intersections (0,0)…(2,2) and connection lines connect each handle only to its 4 cardinal neighbours; (b) check whether handle drag updates flow through the document mutator AND the mesh topology stays canonical (no extra handles sneaking in via repeated effect re-init); (c) verify the overlay reads the same mesh state as the renderer — drift between the two would explain why handles look out of place but the gradient still renders.

---

## Vector shape preview rectangle missing during creation drag

**Symptom**: When drawing a new vector shape (rectangle, ellipse, etc.) by click-dragging on the canvas, no preview outline/rect appears during the drag gesture. The shape only shows up after mouse release. Previously there was a live bounding-box preview while dragging so the user could see the size and position before committing.

**Suspected cause**: The shape-drawer's `mousemove` handler that rendered a temporary preview rect (dashed outline or semi-transparent shape) was likely broken or removed during a recent refactor — possibly the Phase 13b/13c vector tool changes or the active-tool registry rewrite.

**Files involved**: `src/ui/vector-tools/` (shape drawer modules), `src/ui/canvas-view.js` (drag event wiring), `src/ui/vector-tools/active-tool.js` (tool activation).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Check the shape-drawer's `onMouseMove` / `onDrag` handler — it should create/update a temporary Konva.Rect or Konva.Shape on the overlay layer during the drag, then replace it with the real vector layer on release; (b) verify the active-tool registry is forwarding mousemove events to the shape drawer correctly.

---

## Group Selection button visible with <2 layers selected + positioning off

**Symptom**: The "Group selection (Ctrl+G)" button appears in the toolbar area even when fewer than 2 layers are selected (possibly even with 0 or 1). It also has a visual positioning issue — the tooltip/button overlaps other UI elements and looks misplaced (see user screenshot: button floats over the issues counter area).

**Suspected cause**: The button's visibility condition likely checks for `getSelection().length > 0` instead of `>= 2` (grouping requires at least 2 layers). The positioning issue may be a CSS layout problem — the button might not be properly placed in the toolbar flow, or it's absolutely positioned with incorrect offsets.

**Files involved**: `src/ui/toolbar.js` or `src/ui/layer-panel.js` (group button rendering + visibility logic), `src/style/components.css` (button positioning).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Gate visibility on `getSelection().length >= 2`; (b) fix the button's CSS positioning so it sits inline with other toolbar actions; (c) consider moving the group button into the layer panel header (next to +/trash) rather than a floating position.

---

## Stray group-layer icon rendered in footer area

**Symptom**: A small folder-open icon (`i.fas.fa-folder-open.layer-type-icon.layer-group-icon`, 15×12px) appears in the bottom-right corner of the viewport, near the Undo/Redo buttons. It doesn't belong there — it's a layer-type icon that should only appear on group-layer cards in the Layer Stack panel. Visible in DevTools with `background: #0000008C, padding: 2px 3px`.

**Suspected cause**: A layer-type icon element is being appended to the wrong DOM parent — likely the footer or body instead of its layer card. Could be a group-layer card rendering bug where the icon node escapes its intended container, or a leftover/orphaned DOM node from a layer creation/deletion cycle that didn't clean up properly.

**Files involved**: `src/ui/layer-panel.js` (layer card rendering, layer-type icon placement), `index.html` (footer structure).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Check where `.layer-group-icon` is appended — trace the `createElement` / `appendChild` call for group-type layer icons and verify the parent is the layer card thumb, not a higher container; (b) add a cleanup pass that removes orphaned `.layer-type-icon` nodes outside the layer panel on each render cycle.

---

## Ruler canvas overlaps zoom controls

**Symptom**: When rulers are enabled (keyboard `R`), the left ruler canvas visually overlaps the bottom-left zoom button bar (+, %, −, fit, fullscreen). The ruler extends too far down and covers the zoom controls, making them hard to click.

**Suspected cause**: The left ruler `<canvas>` overlay likely has a height of `100%` or `100vh` without accounting for the footer bar height. It needs to stop short of the footer/zoom-bar area so the two don't overlap.

**Files involved**: `src/ui/snap-rulers.js` (ruler rendering + positioning), `src/style/components.css` (ruler overlay CSS).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Set the left ruler's CSS `bottom` to the footer height (e.g. `bottom: var(--footer-height)` or a fixed px value) so it stops above the zoom bar; (b) add a `z-index` fix so the zoom bar sits above the ruler; (c) clip the ruler canvas height to `calc(100% - footer)` in its container.
