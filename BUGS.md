# BUGS.md — parked issues

> Bugs surfaced mid-task that would have derailed momentum to fix in place.
> Each entry: short title + symptom + suspected cause + files + what was tried.
> Reviewed at phase boundaries.

---

## ~~Met images CORS-block on drag-into-canvas~~ — fixed

**Symptom (was)**: Dragging a Met card from the panel onto the canvas produced a CORS rejection on `images.metmuseum.org` (asset CDN, not the JSON API).

**Fix**: option (a) from the original sketch. `src/ui/canvas-view.js:1119` routes the dropped URL through `fetchImageBlob` from `src/plugins/panels/_shared/cors-proxy.js` — direct fetch first, then a multi-proxy fallback chain (corsproxy.io, wsrv.nl, etc.). Same path the Met JSON API already uses.

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

## ~~Simplify slider is destructive — can't dial back to original shape~~ — fixed (226f17e)

**Symptom (was)**: Dragging the Simplify slider rounded corners as expected, but dialing back to lower tolerance never restored the original sharp shape — each session compounded simplification.

**Cause**: The slider's pristine-d snapshot lived in the panel-render closure. Each `setVectorPath` commit fired `layer:vectorChanged`, the panel rebuilt with a fresh closure, and the next pointerdown snapshotted from the ALREADY-SIMPLIFIED `d`.

**Fix**: option (a) from the sketch. Pristine `d` now persists in a module-instance Map keyed by `${layerId}:${pathIdx}` at `initVectorTool` scope, so panel rebuilds reuse the same snapshot. Simplify always computes from the pristine — tolerance=0 fully restores. Layer removal evicts.

**Known follow-up**: a direct anchor-edit between simplify sessions doesn't invalidate the pristine, so the next gesture would discard those edits. Acceptable for now; proper invalidation needs to track non-simplify path mutations.

---

## Mesh Gradient — control points + mesh connections broken

**Symptom**: When applying the Mesh Gradient effect, the on-canvas overlay shows control points scattered across the rectangle with criss-crossing dashed connection lines that don't form a clean grid. Multiple handles appear to be unconstrained — they sit far from where the regular grid intersection should be (e.g. a 4×4 mesh shows 16 handles but they're not laid out in a 4×4 lattice). The resulting gradient still renders something colourful, but the mesh structure is visually wrong and editing handles doesn't behave predictably.

**Suspected cause**: Either (a) the handle position storage/restore logic has drifted — handle world-coords are no longer constrained to their grid cell, or saved positions don't match the grid topology; (b) the overlay's connection-line rendering walks neighbours via wrong indices, drawing extra/wrong edges; (c) a recent Phase 19/20 refactor changed how `mesh-gradient-overlay.js` resolves grid indices vs world coords. Possibly related to layer transform changes or rasteriser pad math.

**Files involved**: `src/ui/mesh-gradient-overlay.js` (handle rendering + connection lines), `src/plugins/premium/mesh-gradient/index.js` (or wherever the manifest + process function live — confirm path; may be under a different premium folder), `src/core/document.js` (mesh handle persistence in layer params).

**What was tried**: Phase 20 shipped the bicubic Catmull-Rom + HSL tint version that was working. Something has regressed since.

**Possible fixes**: (a) audit the handle layout init — confirm a 3×3 mesh creates 9 handles at grid intersections (0,0)…(2,2) and connection lines connect each handle only to its 4 cardinal neighbours; (b) check whether handle drag updates flow through the document mutator AND the mesh topology stays canonical (no extra handles sneaking in via repeated effect re-init); (c) verify the overlay reads the same mesh state as the renderer — drift between the two would explain why handles look out of place but the gradient still renders.

**Next investigation step**: add a one-line `console.log({ handles: layer.params.meshHandles })` inside `mesh-gradient-overlay.js`'s render loop and reproduce. Compare the logged grid (rows × cols) against the expected handle count (rows × cols). If extras appear, walk the call sites to find a duplicate-init path. If positions are wrong but counts are right, the drift is between layer-coords and overlay-coords — check the rasteriser pad math.

---

## Vector shape preview rectangle missing during creation drag

**Symptom**: When drawing a new vector shape (rectangle, ellipse, etc.) by click-dragging on the canvas, no preview outline/rect appears during the drag gesture. The shape only shows up after mouse release. Previously there was a live bounding-box preview while dragging so the user could see the size and position before committing.

**Suspected cause**: The shape-drawer's `mousemove` handler that rendered a temporary preview rect (dashed outline or semi-transparent shape) was likely broken or removed during a recent refactor — possibly the Phase 13b/13c vector tool changes or the active-tool registry rewrite.

**Files involved**: `src/ui/vector-tools/` (shape drawer modules), `src/ui/canvas-view.js` (drag event wiring), `src/ui/vector-tools/active-tool.js` (tool activation).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Check the shape-drawer's `onMouseMove` / `onDrag` handler — it should create/update a temporary Konva.Rect or Konva.Shape on the overlay layer during the drag, then replace it with the real vector layer on release; (b) verify the active-tool registry is forwarding mousemove events to the shape drawer correctly.

**Next investigation step**: pick the rectangle tool, drop a `console.log('shape-drawer move', { x: e.clientX, y: e.clientY })` inside the shape-drawer's onMove handler (look in `src/ui/vector-tools/shape-drawer.js`). Drag on canvas. If the log fires → preview node creation is broken; if it doesn't → active-tool routing in `src/ui/vector-tools/active-tool.js` isn't forwarding the move. That tells us which side of the wiring to fix.

---

## ~~Group Selection button visible with <2 layers selected + positioning off~~ — closed (no current code matches the report)

**Symptom (reported)**: button appears with <2 layers selected; positioning floated over the issues counter.

**Status**: visibility logic in `src/ui/layer-panel.js:43-49` already gates `combineBtn.hidden = eligible.length < 2`. Live DOM probe confirms `position: static` with no offset overrides — button sits in normal layer-panel header flow. Whatever state produced the reported screenshot is no longer reproducible against current code. Closing; reopen with a fresh repro if it resurfaces.

---

## Stray group-layer icon rendered in footer area

**Symptom**: A small folder-open icon (`i.fas.fa-folder-open.layer-type-icon.layer-group-icon`, 15×12px) appears in the bottom-right corner of the viewport, near the Undo/Redo buttons. It doesn't belong there — it's a layer-type icon that should only appear on group-layer cards in the Layer Stack panel. Visible in DevTools with `background: #0000008C, padding: 2px 3px`.

**Suspected cause**: A layer-type icon element is being appended to the wrong DOM parent — likely the footer or body instead of its layer card. Could be a group-layer card rendering bug where the icon node escapes its intended container, or a leftover/orphaned DOM node from a layer creation/deletion cycle that didn't clean up properly.

**Files involved**: `src/ui/layer-panel.js` (layer card rendering, layer-type icon placement), `index.html` (footer structure).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Check where `.layer-group-icon` is appended — trace the `createElement` / `appendChild` call for group-type layer icons and verify the parent is the layer card thumb, not a higher container; (b) add a cleanup pass that removes orphaned `.layer-type-icon` nodes outside the layer panel on each render cycle.

**Next investigation step**: static read of `src/ui/layer-panel.js` shows every `.layer-type-icon` element is generated as an inline template-string child of its layer card markup — no rogue `appendChild` to body or footer found. The bug is likely runtime DOM escape (HMR carryover, leftover from a layer creation/deletion path that didn't clean up, or an orphaned reference). Reproduction step: open DevTools, find the stray `.layer-group-icon` in the bottom-right area, then walk up via `el.parentElement` until you hit something recognisable. That identifies the rogue mount point — much faster than continuing static reads.

---

## ~~Ruler canvas overlaps zoom controls~~ — fixed (2676712)

**Symptom (was)**: Left ruler (z-index 15) covered the bottom-left zoom button cluster (z-index 10) when rulers were toggled on.

**Fix**: option (a) from the sketch. `.ruler--left` in `src/style/components.css` now stops at `bottom: 56px` (16 px footer-gap + ~28 px button height + 12 px breathing) so the ruler ends above the zoom controls instead of overlapping them.
