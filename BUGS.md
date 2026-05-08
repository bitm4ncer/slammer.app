# BUGS.md — parked issues

> Bugs surfaced mid-task that would have derailed momentum to fix in place.
> Each entry: short title + symptom + suspected cause + files + what was tried.
> Reviewed at phase boundaries.

---

## Vector stroke pads from top-left, not centred

**Symptom**: A rectangle vector layer with a thick stroke (e.g. 34 px) doesn't expand the visual outwards equally on all sides — the visible outline appears to push the rect down + right, and the selection bbox shifts with it. Expected behaviour: with `DEFAULT_VECTOR_STROKE.align = 'center'` (the default), half the stroke width should sit inside the path and half outside, so the visual bbox grows symmetrically around the original path bounds.

**Suspected cause**: The renderer's pad / `image.position` math computes `pathBounds` from the path d-string only and doesn't account for the current stroke width. As stroke width grows, the rendered stroke spills past the cached `pathBounds` in one direction (top-left), so the rasterised image is offset by the stroke spill on the bottom-right side instead of being centred. The fixed 16 px pad heuristic doesn't scale with stroke width either.

**Files involved**: `src/core/vector-renderer.js` (look for `pad`, `pathBounds`, `image.position` formula `image.x = pathBounds.x - layer.transform.x - pad`), `src/core/layer.js` (`DEFAULT_VECTOR_STROKE`), `src/ui/vector-tools/anchor-overlay.js` (anchor positions read `layer.transform.x/y` and must stay in sync with whatever fix lands).

**What was tried**: Nothing yet — symptom observed via screenshot only.

**Possible fixes**: (a) inflate `pathBounds` by `strokeWidth / 2` on all sides before computing `image.position`, so the rasterised image canvas grows symmetrically when stroke width changes; (b) make `pad` derive from `Math.max(16, strokeWidth)` (or similar) so the rasteriser canvas always has room for the stroke spill; (c) honour `stroke.align` properly — for `inside` no inflation, for `outside` inflate by full `strokeWidth`, for `center` inflate by `strokeWidth / 2`. Whatever lands must keep `layer.transform.x/y` stable (per the Phase 13 top-left-origin contract in CLAUDE.md) so anchor overlay coords don't drift.

---

## Undo / Redo — only 1 step back, several action types not captured

**Symptom**: Pressing Ctrl+Z repeatedly goes back at most 1 step instead of the expected 80 (capacity in `src/core/history.js`). Some actions don't enter history at all — vector path edits, layer renames, lock toggles likely lost. Even small actions (1 px nudge) feel inconsistently undoable.

**Root cause** (after code audit of `src/core/history.js`):

1. **`statesLookEqual` is incomplete** (L97-118). It compares `transform`, `effects`, `text` per layer — but NOT `vector` (path data), `name`, `locked`, `parentGroupId`, `childIds`, `frame`. So when the user edits a vector anchor, renames a layer, or locks a layer, the post-mutation snapshot looks "equal" by this comparison → `commit()` returns early at L58 → no history entry. The user clicks Undo, nothing reverts because nothing was logged.
2. **`doc:loaded` wipes the past stack** (L122-130: `past.length = 0; past.push(snapshot());`). If `doc.load(...)` is called unexpectedly anywhere in the codebase (autosave restore, a plugin doing a state reset, HMR quirk), the entire history is deleted and the user starts fresh at 1 entry. `canUndo()` returns `past.length >= 2` so 1 entry = no undo possible.
3. **`STRUCTURAL_EVENTS` / `PROP_EVENTS` whitelist is incomplete**. Only events in those Sets trigger commits. New event types added since (e.g. anything emitted by Phase-23 colour-picker, theme switch, vector tool) silently bypass history. Any action that fires only an unlisted event will not be recorded.

**Files involved**: `src/core/history.js` (statesLookEqual L97, doc:loaded handler L122, event sets L11-25), every event emit site in `src/core/document.js` (audit which fire which event names — must align with PROP_EVENTS / STRUCTURAL_EVENTS).

**What was tried**: Code audit only — no changes yet.

**Recommended quick fix** (before the bigger architectural overhaul, see roadmap "History v2"):
- Extend `statesLookEqual` to compare every persisted layer field. Easier alternative: replace the whole function with a structural deepEq on `a.layers` + `a.name` + `a.exportFrame` + `a.guidelines`. The current cheap-scalar-first design is a perf premature-optimisation; deepEq runs in microseconds even on 50-layer projects.
- Audit every event emitted by `document.js` and ensure it's in either STRUCTURAL_EVENTS or PROP_EVENTS. Better: invert the guard — fire scheduleCommit on ANY event NOT in an explicit IGNORE set (e.g. `layer:active`, `effect:processing`).
- Defend `doc:loaded` from accidental triggers: only reset the past stack on EXPLICIT user-initiated loads (project open, file import). Internal state transitions (autosave restore, undo/redo itself) should set `applying = true` so this branch doesn't wipe history.
- Bump `capacity` from 80 → 200 as a stop-gap until History v2 lands.

**Verification after fix**:
- 1 px arrow nudge on an image layer → undo restores. Repeat 50 times → 50 undos work.
- Edit a vector path anchor → undo restores the previous path.
- Rename a layer → undo restores old name.
- Reload page → first undo still works (no spurious doc:loaded wipe).
- Open a `.slammerproj` → that DOES wipe history (correct).

---

## Layer-panel image thumbnails broken

**Symptom**: Thumbnails on layer cards in the Layer Stack panel are missing, blank, or showing placeholder squares instead of the layer's actual content.

**Suspected cause**: The thumb cache reads from `st._paintVersion` to know when to re-encode. If `paintVersion` is undefined (layer never painted), the cache lookup fails or returns a stale/empty thumb. Could also be that thumb encoding was wired before the new `commitImagePosition` rework changed paintLayerSync flow — verify the thumb generator still reads `st.dstCanvas` after my recent fix landed.

**Files involved**: `src/ui/layer-panel.js` (thumb rendering + cache), `src/core/renderer.js` (`_paintVersion` writes around L1055-1060), possibly `src/io/project-store.js` for persisted-thumb path.

**What was tried**: Nothing yet.

**Possible fixes**: (a) Confirm `paintLayerSync` increments `_paintVersion` for every layer type (not just non-FX); (b) layer-panel thumb renderer should fall back to `st.dstCanvas` even when `_paintVersion` is missing; (c) trace which thumb path is broken — initial create, after-edit, or after-reload.

---

## Halftone Raster — adds an unwanted border and Mono mode inverts polarity

**Symptom (a)**: Applying the Halftone Raster effect (premium) draws a visible frame/border around the source image's bounding box that shouldn't be there. **Symptom (b)**: In Mono mode, the dot/anti-dot polarity is inverted — dark areas show light dots instead of dark dots (or vice versa).

**Suspected cause (a)**: Likely the effect is rendering across the FULL padded canvas including the pad margin, instead of clipping to the source alpha. The pad area becomes a solid-colour rectangle of dots → reads as a border. **(b)**: Polarity bug in the Mono branch — the threshold compare is flipped, so luminance > T outputs ink where it should output paper (or the inverse).

**Files involved**: `src/plugins/premium/halftone-raster/index.js` or wherever the raster Halftone is registered (check `src/plugins/premium/` — folder may be named `halftone-raster` / `halftone-print` / similar).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Modulate the output alpha by the source alpha so transparent pad pixels stay transparent; (b) flip the Mono threshold compare or invert the output value before writing.

---

## Quick-access wheel arrows scroll the wrong direction

**Symptom**: The up/down arrows on the quick-access (radial) wheel scroll the wheel in the inverted direction. Clicking up should rotate the wheel so the next item appears at the top — instead it moves the opposite way.

**Suspected cause**: Sign error in the rotation delta. The arrow handler probably does `rotation += step` where it should be `rotation -= step` (or vice versa). Trivial 1-line flip.

**Files involved**: `src/ui/quick-wheel.js` or wherever the radial menu lives (search for `quick-wheel` / `radial-menu` / `effect-wheel`).

**What was tried**: Nothing yet.

**Possible fixes**: (a) Flip the sign on both arrow buttons; (b) verify direction matches scroll-wheel cycling on the same widget so they're consistent.

---

## Grouping shifts layers on canvas to a different position

**Symptom**: Selecting two or more layers and pressing Ctrl+G to group them causes the visible content to jump to a different on-canvas position. The group is created but the children's apparent world positions shift.

**Suspected cause**: When `addGroupLayer` reparents children's Konva.Groups into the new parent group, the parent group has its own `transform.x/y` (likely 0,0 or the topmost child's coords). Children's `group.position` is now in PARENT-LOCAL space — but their stored `layer.transform.x/y` was in WORLD space. If the reparent doesn't compensate the children's local positions for the new parent's offset, they visually jump by the parent's transform.

**Files involved**: `src/core/document.js` (`addGroupLayer`), `src/core/renderer.js` (`group:childrenChanged` and `case 'doc:loaded'` reparent paths around L1690-1720).

**What was tried**: Nothing yet — phase-19 cluster A claims grouping was fixed for order/position but a regression may have crept back in.

**Possible fixes**: (a) On group creation, set the parent group's transform to (0,0) AND keep children's transforms unchanged in world space (store children's worlds, then on reparent recompute their parent-local x/y as `world - parent.world`); (b) alternatively, set the parent's transform to the topmost child's world position and shift children's local positions accordingly so the visible result is identical to pre-group.

---

## Vector shape drop snap-back: one-frame glitch in old position after release

**Symptom**: Drag a vector shape on the canvas to a new location and release — for one frame, the shape snaps back to a position different from both the start and the end, then settles in the correct dropped position. Visible flash, especially on slow drags.

**Suspected cause**: The dragend commit path for vector layers translates path d-coords by the drag delta and writes back via `setVectorPath`. Between dragend's Konva.Group position update and the path d-coord bake + re-rasterise, there's a one-frame window where the Konva.Group is at the new position but the rasterised path is still at the OLD coords. Konva renders the old bitmap at the new group position → flash. Once `setVectorPath` triggers re-rasterise, the rasterised content snaps to where it should be relative to new group origin.

**Files involved**: `src/core/renderer.js` (`contentLayer.on('dragend', ...)` vector branch around L1965-1985, and the multi-drag commit at L1916+), `src/core/document.js` (`setVectorPath`), `src/core/vector-renderer.js` (rasteriseVectorLayer).

**What was tried**: Nothing yet.

**Possible fixes**: (a) On dragend for vector, hide the Konva.Image briefly until re-rasterise completes (add `image.opacity(0)` then `image.opacity(1)` after the next paint); (b) precompute the new rasterised state synchronously before the visible group.position update so they commit atomically; (c) use the same "path-bounds drift" compensation that `applyTransform` does for vector layers — recompute `image.position` immediately after dragend so the OLD bitmap renders at its original world position until the re-rasterise lands.

---

## Drop Shadow → Knockout toggle makes the footer jump up

**Symptom**: With a Drop Shadow effect on the active layer, clicking the **Knockout** toggle in the Options section makes the bottom footer (zoom controls, color hub, settings gear) visibly jump upward by some amount. Toggling it off doesn't restore — it can keep shifting on subsequent toggles.

**Suspected cause**: The toggle triggers a re-render that changes the layer's effective bbox (Knockout=true zeroes pixels where source alpha > 0, so only the shadow halo remains — the visible content rectangle becomes much smaller and offset by `(distance + blur)` from the original layer position). Something in the layout chain is reacting to the bbox change and reflowing the footer's vertical position. Most likely culprits: a `:has()` selector on the body keyed off canvas content height, a sticky/sticky-bottom footer that's actually positioned by content flow rather than `position: fixed`, or a Konva-driven layout side-effect that triggers a window resize cascade.

**Files involved**: `src/plugins/filters/drop-shadow/index.js` (Knockout toggle wiring — but the effect's `process()` only mutates pixel data, can't directly affect layout), `src/style/layout.css` (footer layout), `src/style/components.css`, `src/ui/footer.js` if it exists, otherwise the layout container in `index.html`.

**What was tried**: Nothing yet — needs DevTools `getBoundingClientRect` snapshots before/after the click to identify which container is moving.

**Possible fixes**: (a) ensure the footer is `position: fixed` (or anchored via grid `grid-row: bottom`) so it can't reflow with canvas content; (b) audit any `:has()` selectors or container-query hooks that might react to canvas size changes; (c) if a window-resize handler is the trigger, debounce or gate it so a transient effect-rerender doesn't propagate to layout.

---

## Shift-select multi-layer drag — layers move at different speeds / drift apart

**Symptom**: Shift-clicking two (or more) layers in the Layer Stack to multi-select, then mouse-dragging on the canvas, makes the layers move chaotically — one moves correctly with the cursor while the other drifts at a different rate, or both end up in different positions than expected. Selection outlines also lag or render at stale positions during/after the drag.

**Suspected cause**: The manual multi-drag in `src/ui/canvas-view.js` snapshots each selected node's start position via `node.x()` / `node.y()` (parent-local coords), then applies a world-space delta uniformly via `node.position({ x: info.x + dx, y: info.y + dy })`. This works ONLY when every selected node shares the same parent transform (identity, or both nested under the same scaled/rotated parent). If one layer is top-level and another is inside a group with non-identity transform, the parent-local-vs-world mismatch produces visibly different displacements per layer. There may also be a secondary path: the renderer's `multiDragSession` (`src/core/renderer.js` ~L1824) replicates anchor delta to other selected layers when Konva native drag fires — but Konva drag is disabled (`st.group.draggable(false)` in `syncLayerInteractivity`), so this path shouldn't activate. Worth confirming via a console log that only ONE drag system is firing.

**Files involved**: `src/ui/canvas-view.js` (`snapshotSelectionPositions` ~L693, dragmove handler ~L880-918), `src/core/renderer.js` (`multiDragSession` ~L1824 — should not be active for manual drag, confirm), `src/ui/snap-rulers.js` (snap math reads `info.node.getClientRect({ relativeTo: contentLayer })` which IS world-space — so the snap calc may be correct while the position-set is in parent-local: another mismatch source).

**What was tried**: Nothing yet — diagnostic only.

**Possible fixes**: (a) in `snapshotSelectionPositions`, capture each node's WORLD position via `node.getAbsolutePosition()` instead of parent-local `node.x()`, then in dragmove convert the world target back to parent-local via `node.getParent().getAbsoluteTransform().copy().invert().point({...})` before calling `position({...})`; (b) alternatively, only allow multi-drag when all selected layers share a parent — fall back to single-layer drag for mixed parents (simpler, less correct UX); (c) audit the dragend commit path to ensure `layer.transform.x/y` is set to the resulting WORLD position (so reload + undo are consistent), independent of which parent space the Konva node lives in. Also verify selection-outline redraw fires AFTER all positions are committed so dashed rectangles don't lag behind.

**Repro**: shift-click any two layers → drag one. Watch one layer move correctly while the other slips, OR both move but selection outlines render at offsets that don't match the visible layer positions (per user's screenshot showing dashed rects far below the actual layer content).

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

## ~~Drop Shadow on text/image — content visibly wobbles instead of showing a shadow~~ — fixed

**Symptom**: Adding a Drop Shadow effect to a text (or image) layer and dragging the angle/distance/blur sliders does not produce a visible shadow. Instead, the text/image jitters around on canvas during the drag — appearing to shift back and forth as the user moves the slider. Once the drag stops, the layer settles in roughly the right place but the shadow is still missing or clipped.

**Root cause** — found via code audit (`src/core/renderer.js` + `src/core/vector-renderer.js` + `src/plugins/filters/drop-shadow/index.js`):

The padding-budget compensation has a **frame-ordering bug**. When a Drop Shadow param changes:

1. `effect:propChanged` handler (renderer.js L1634) calls `await rasterizeSource(layer, st)` synchronously for text layers.
2. Inside `rasterizeSource`, line 506-507 (text) and line 494 (image) update `st.image.position({ x: -pad, y: -pad })` **immediately** — pad has just been recomputed by `computePadForEffects` and may be larger or smaller than the previous pad.
3. Right after, the handler calls `paintLayer(layer, st)` which only **schedules** `paintLayerSync` for the next RAF (L1039-1041 → `schedulePaint`).
4. Konva renders one or more frames in between, displaying the **OLD** `st.dstCanvas` content (still padded with the previous pad) at the **NEW** image position. The visible result: the text/image content shifts by `(oldPad − newPad, oldPad − newPad)` until the deferred paint catches up.

As the user drags angle/distance/blur, pad fluctuates per tick → content visibly wobbles. The shadow itself is being computed correctly inside `drop-shadow.process()`, but the wobble masks it and the deferred paint shrinks the visible canvas back to the inner content rect via `getSelfRect`, hiding any shadow that would have rendered outside the original bounds.

**Why this is exactly Drop Shadow's pain**: of all effects, Drop Shadow has the largest pad swing per param change (`Math.max(|ox|, |oy|) + blur + spread`). Blur and Displacement also recompute pad, but their pad budgets are flatter so the wobble is less visible. Drop Shadow with distance=0 → pad=PAD_MIN. Distance=200 → pad approaches PAD_MAX. Drag from 0 to 200 → 200 pixels of position swing.

**Files involved**:
- `src/core/renderer.js` — `rasterizeSource` for image layers (~L494) and text layers (~L506-507) sets `st.image.position` immediately. Should defer to inside `paintLayerSync` (~L1077, right after `st.dstCanvas.getContext('2d').putImageData(finalImageData, 0, 0)` and `st.image.image(st.dstCanvas)`).
- `src/core/vector-renderer.js` — same pattern likely exists for vector layers; audit `paintLayerSync` and the vector branch to confirm.
- `src/plugins/filters/drop-shadow/index.js` — algorithm itself is fine, no changes needed there.

**What was tried**: nothing yet — root-cause audit only.

**Recommended fix**: defer the `st.image.position({ x: -pad, y: -pad })` call from `rasterizeSource` into `paintLayerSync`, so the position update and the new canvas data commit in the same RAF. Concretely:

1. In `rasterizeSource`, REMOVE the inline `st.image.position(...)` lines for image (L494) and text (L506-507) branches. Just compute and stash `st.imagePad` / `st.textPad` on `st`, return `imgData`.
2. In `paintLayerSync`, after `st.image.image(st.dstCanvas)` and the `st.image.width(...)/height(...)` calls (~L1081-1083), add:
   ```js
   const padNow = layer.type === 'image' ? (st.imagePad || 0)
                : (layer.type === 'text' || layer.type === 'vector') ? (st.textPad || 0)
                : 0;
   if (padNow !== undefined) {
     st.image.position({ x: -padNow, y: -padNow });
   }
   ```
3. Verify the same fix applies to vector layers — their rasterise path likely has the same inline-position pattern. If so, hoist it the same way.

**Verification steps after fix**:
- Add a Drop Shadow to a text layer. Drag distance from 0 → 200. The text content stays anchored at its layer-transform position; only the shadow halo grows. No wobble.
- Same with blur (0 → 100) and angle (0° → 360°).
- Same on an image layer.
- Same on a vector layer (if the vector path also has the inline pattern, fix it too).
- Reload the page after a drag — final position survives, layer doesn't jump on reload.
- Undo/redo through several Drop Shadow param changes — no visual jumps mid-history-step.

**Status**: Fixed. The eager `st.image.position(...)` calls in `rasterizeSource` (image L494, text L505-508, vector L557-561 — and vector-only group L578-583 stays intentionally because that branch uses paintLayerSync's commit too) are removed. A new `commitImagePosition(layer, st)` helper in `renderer.js` reads the stashed `st.imagePad` / `st.textPad` / (`st.vectorPad`+`st.vectorPathBounds`) and is called once per `paintLayerSync` immediately after `st.image.image(st.dstCanvas)` + width/height updates — so position and bitmap commit in the same RAF, no wobble.

---

## ~~Group Selection button visible with <2 layers selected + positioning off~~ — closed (no current code matches the report)

**Symptom (reported)**: button appears with <2 layers selected; positioning floated over the issues counter.

**Status**: visibility logic in `src/ui/layer-panel.js:43-49` already gates `combineBtn.hidden = eligible.length < 2`. Live DOM probe confirms `position: static` with no offset overrides — button sits in normal layer-panel header flow. Whatever state produced the reported screenshot is no longer reproducible against current code. Closing; reopen with a fresh repro if it resurfaces.

---

## ~~Stray group-layer icon rendered in footer area~~ — fixed

**Symptom**: A small folder-open icon (`i.fas.fa-folder-open.layer-type-icon.layer-group-icon`, 15×12px) appears in the bottom-right corner of the viewport, near the Undo/Redo buttons. It doesn't belong there — it's a layer-type icon that should only appear on group-layer cards in the Layer Stack panel. Visible in DevTools with `background: #0000008C, padding: 2px 3px`.

**Root cause**: `.layer-type-icon` is absolutely positioned (`position: absolute; bottom: 2px; right: 2px;` in `components.css`). For normal layers the icon lives inside `.layer-thumb`, which has `position: relative`, so it is contained. For group layers the icon is a direct child of `.layer-item` (see `layer-panel.js:182`), but `.layer-item` did **not** have `position: relative` for top-level rows. With no positioned ancestor, the icon escaped to the initial containing block — the viewport — landing at `bottom: 2px; right: 2px`.

**Fix**: Added `position: relative` to `.layer-item` in `src/style/components.css` so every layer card is a positioning context for its absolutely positioned children.

**Files changed**: `src/style/components.css`

---

## ~~Ruler canvas overlaps zoom controls~~ — fixed (2676712)

**Symptom (was)**: Left ruler (z-index 15) covered the bottom-left zoom button cluster (z-index 10) when rulers were toggled on.

**Fix**: option (a) from the sketch. `.ruler--left` in `src/style/components.css` now stops at `bottom: 56px` (16 px footer-gap + ~28 px button height + 12 px breathing) so the ruler ends above the zoom controls instead of overlapping them.
