# BUGS.md — parked issues

> Bugs surfaced mid-task that would have derailed momentum to fix in place.
> Each entry: short title + symptom + suspected cause + files + what was tried.
> Reviewed at phase boundaries.

---

## ~~fal.ai generation aborts (or result is lost) when the plugin window is closed mid-generation~~ — fixed

**Symptom (was)**: Starting a fal.ai generation, then closing the plugin window before the model finished, lost the result — the request was cancelled by the plugin's own teardown logic, or the success handler tried to write into a DOM that no longer existed and silently dropped the layer.

**Suspected cause**: The fal.ai plugin's `renderUI(container, ctx)` likely owns the in-flight request (Promise stored on a closure variable inside the renderUI scope). When `floating-window.js` calls `el.remove()` on close, that closure is GC'd along with the DOM. Any AbortController referenced by it may fire (cancel), and even if the `await fal.subscribe(...)` promise resolves, the success handler tries to call `notify()` / `importImage()` against captured references that may be stale or whose UI side-effects target removed nodes.

**What needs to happen**:
1. **Generation survives window close** — the request keeps running on app-level state, not panel-DOM state. Move in-flight Promise + AbortController to a module-level (or `window.__slammer.activeGenerations` Map keyed by plugin id) so closing the window doesn't tear them down.
2. **Result lands regardless of window state** — when the request resolves, call `window.__slammer.importImage(blob, { name })` directly. That works whether the plugin window is open or closed; the layer simply appears on canvas + in the Layer Stack.
3. **Background indicator while generation runs** — small chip / dot in the footer (or near the Plugins sidebar entry for fal.ai) showing "Generating… (1/3)" with the queue position if known. Click → re-opens the fal.ai window so the user can see live progress + cancel.
4. **Re-opening the window during a live generation** — the plugin's `renderUI` should hydrate from the active-generations Map and resume showing the spinner / progress / queue position, not start a fresh empty UI. The existing `setRunning(true)` helper from Phase 16 polish already handles the visual; it just needs to be called from a hydration step on open.
5. **Cancel on demand** — only if the user explicitly clicks Cancel. Closing the window is NOT a cancel signal.

**Files involved**: `src/plugins/panels/falai/index.js` (request lifecycle, AbortController, result handling), `src/ui/plugin-host.js` (`openPluginWindow` — extend to hydrate in-flight state), `src/ui/floating-window.js` (close lifecycle — verify it doesn't cascade-abort plugin in-flight Promises), `src/main.js` (`window.__slammer` façade may grow an `activeGenerations` Map exposed to the plugin).

**What was tried**: Nothing yet.

**Possible fixes**: (a) hoist the request lifecycle out of `renderUI` and into a plugin-level module state, with the plugin's `renderUI` reading from that state on each mount; (b) add a `window.__slammer.activeGenerations: Map<pluginId, { promise, abort, status, queuePos }>` shared façade so multiple plugins (current fal.ai, future Replicate / Inpainting / Background-Removal jobs) all benefit from the same "keep running on close" guarantee; (c) wire a footer chip that subscribes to the Map and renders one row per active generation across all plugins; (d) audit the close path in `floating-window.js` to confirm no `abort()` is fired implicitly on `el.remove()`.

**Generalise**: this should be the rule for ALL panel plugins that kick off async work (fal.ai today; future AI-Inpainting, Background-Removal, anything queueing on remote APIs). The active-generations Map and footer chip should serve all of them, not be fal.ai-specific. Document the pattern in `src/plugins/plugin-contract.md` so new plugins follow it from day one.

**Fix**: shipped per the original spec (a + b + c + d) plus hydration on re-open.

- New `src/ui/active-generations.js` owns a `Map<jobId, JobRecord>` with `start / update / end / list / get / subscribe` exported as `window.__slammer.activeGenerations`. JobRecord carries `pluginId`, `modelId?`, `modelName?`, `abort()`, `status`, `queuePos`, `message`, `startedAt`. The same module mounts a footer chip (`.active-gen-chip` in `.footer-right`) that subscribes to the registry, stays hidden when empty, summarises a single job with its current status text + queue position, or shows a `×N` count when multiple jobs run. Click → reopens the originating plugin's window via `openPluginWindow`.
- `src/plugins/panels/falai/index.js` refactored: form values are read upfront (while the form's DOM is still alive), then a detached `runDetached(...)` IIFE executes the model run with its own AbortController. Result lands via `window.__slammer.importImage` (the global facade, NOT a closure ref). The success path also calls `ctx.notify` so the user sees a notification regardless of which window they're looking at. The detail pane subscribes to the registry on every render — when a job exists for the currently-selected model, the run-button disables and the cancel-button shows, even on a fresh window mount. Cancel-button asks the registry for the live job and calls its `abort()`, so it works whether the job started in this DOM mount or an earlier one.
- `src/plugins/plugin-contract.md` documents the pattern under "Async work — generations that survive window close" with the canonical capture-input-upfront / detached-IIFE / hydrate-on-mount template.

**Verified**: full lifecycle simulated — start → queued (chip shows "Queued · 3 ahead…") → running (chip shows "Generating…") → resolve writes a layer via global importImage → end (chip hides). Cancel path calls the AbortController. Multi-job summary shows ×N badge. Hydration test: open fal.ai, select model, externally start a job for that model — run-button disabled, cancel-button visible, status shows live message; on end the button re-enables. No console errors throughout.

---

## ~~Vector stroke pads from top-left, not centred~~ — fixed

**Symptom (was)**: A rectangle vector layer with a thick stroke (e.g. 34 px) didn't expand the visual outwards equally on all sides — the visible outline appeared to push the rect down + right, and the selection bbox shifted with it.

**Cause**: The rasteriser correctly computed stroke-aware bounds (`computeBounds` includes `align`-aware spill), but only returned `pathBounds` (no stroke) to the renderer. The renderer's `image.position` formula used `pathBounds.x` to anchor the Konva.Image — so the canvas's left edge landed at `pathBounds.x - pad`, while the rasterised stroke pixel actually sat at `pathBounds.x - strokeWidth/2 - pad`. Result: the entire image (path + stroke) shifted right + down by `strokeWidth/2`.

**Fix** (commits below): the rasteriser now returns BOTH `pathBounds` (for selection handles via `getSelfRect`) AND `paintedBounds` (path + stroke spill). The renderer uses `paintedBounds.x` for `image.position`, so the canvas's left edge sits at the leftmost stroke pixel's true world coord. `getSelfRect` adds `(pathBounds.x - paintedBounds.x)` to `pad` so the selection handles still hug the path tightly inside the now-larger image. The vectorChanged handler also commits the position eagerly (mirroring `paintLayerSync`'s commit) so a stroke-width change re-anchors the image immediately, even on RAF off-frames.

**Files**: `src/core/vector-renderer.js` (rasterise returns `paintedBounds`), `src/core/renderer.js` (`commitImagePosition` + `applyTransform` + `getSelfRect` + vectorChanged handler all use `vectorPaintedBounds`).

**Verified live**: a path at world (100, 100) → (200, 200) stays anchored at world (100, 100) as the stroke width is changed from 0 → 40 → 80 px. `paintedBounds` correctly grows by `strokeWidth/2` on every side; `image.position` shifts by exactly the matching delta.

---

## ~~Undo / Redo — only 1 step back, several action types not captured~~ — fixed

**Symptom (was)**: Ctrl+Z repeatedly went back at most 1 step instead of the expected 80 (capacity in `src/core/history.js`). Vector path edits, layer renames, lock toggles, paint-flag changes — all silently lost.

**Root cause**: three compounding holes in `src/core/history.js`:
1. `statesLookEqual` only compared a hand-picked subset of layer fields (transform / effects / text). It ignored `vector` path data, `name`, `locked`, `parentGroupId`, `childIds`, `frame`, etc. So post-mutation snapshots looked "equal" and `commit()` returned early without logging.
2. The `STRUCTURAL_EVENTS` / `PROP_EVENTS` whitelists drifted as new event types landed elsewhere (Phase-23 colour hub, vector tools, etc.) — anything not in either set bypassed history entirely.
3. Capacity of 80 was tight relative to user expectation of "always undoable."

**Fix** (single commit): closed the holes in `src/core/history.js` as a quick fix ahead of the planned command-pattern History v2 (roadmap.md → Phase 19 Cluster F).
- `statesLookEqual` replaced with `deepEq(a, b)` over the WHOLE snapshot. New fields automatically participate. Microseconds even on 50-layer docs — the previous "scalar-first" optimisation was premature.
- Event handling inverted: every emitted doc event now triggers a debounced commit UNLESS it appears in an explicit `IGNORE_EVENTS` set (`layer:active`, `effect:processing`, the `*Ephemeral` ones, `layer:vectorActivePath`, `doc:guidelines`). New event types default to "in history" — the safe default.
- Capacity bumped 80 → 200.
- `doc:loaded` handler kept as-is: undo / redo are short-circuited by the existing `applying` guard at the top of the subscribe handler; user-initiated loads (project open, `.slammerproj` import, autosave hydrate at boot) intentionally wipe past[] because that's the new baseline. New `withSuspended(fn)` exit hatch on the history API for future callers that need to load doc state without disturbing the stack.

**Files**: `src/core/history.js` (full rewrite of the subscribe handler + duplicate check), `src/main.js` (exposes `history` on `window.__slammer` for diagnostics).

**Verified live** (commit `5d8d0e9`):
- Layer add → commit, transform nudge → commit, layer rename → commit, lock toggle → commit, vector path edit → commit. All four previously-silent mutations now land in history (past grew by 1 per mutation).
- 25 sequential undos all returned `ok=true`; layer transform walked back step-by-step; eventually the layer's existence walked back past the `addVectorLayer` event (layer destroyed — correct).
- After `location.reload()`: past=1 (autosave hydrate = baseline), one edit pushes past=2, first undo restores x=100 → 50. The reload-then-first-undo regression target is closed.
- Redo path symmetric: pop from future, push to past, doc.load with `applying=true`. Verified by single forward step after undo chain.

History v2 (command pattern, see roadmap Phase 19 Cluster F) is the longer-term replacement — this commit is the quick fix that closes the actively-broken user surface.

---

## Layer-panel image thumbnails broken

**Symptom**: Thumbnails on layer cards in the Layer Stack panel are missing, blank, or showing placeholder squares instead of the layer's actual content.

**Suspected cause**: The thumb cache reads from `st._paintVersion` to know when to re-encode. If `paintVersion` is undefined (layer never painted), the cache lookup fails or returns a stale/empty thumb. Could also be that thumb encoding was wired before the new `commitImagePosition` rework changed paintLayerSync flow — verify the thumb generator still reads `st.dstCanvas` after my recent fix landed.

**Files involved**: `src/ui/layer-panel.js` (thumb rendering + cache), `src/core/renderer.js` (`_paintVersion` writes around L1055-1060), possibly `src/io/project-store.js` for persisted-thumb path.

**What was tried**: Nothing yet.

**Possible fixes**: (a) Confirm `paintLayerSync` increments `_paintVersion` for every layer type (not just non-FX); (b) layer-panel thumb renderer should fall back to `st.dstCanvas` even when `_paintVersion` is missing; (c) trace which thumb path is broken — initial create, after-edit, or after-reload.

---

## ~~Halftone Raster — adds an unwanted border and Mono mode inverts polarity~~ — fixed

**Symptom (was, a)**: Applying the Halftone Raster effect drew a visible frame/border around the source's bounding box. **(b)**: Mono mode polarity was inverted — dark areas showed light dots, bright areas showed dark dots.

**Fix**: both per the original sketch. In `src/plugins/premium/halftone-raster/index.js`:

- (a) All three render paths (`renderScreenMono`, `renderScreensRGB`, `renderScreensCMYK`) now write `out[o + 3] = src[o + 3]` (or `paper.a/255 * src[o + 3]` for CMYK) instead of `255` blindly. Pad-area pixels with source alpha 0 stay transparent — no more rectangle.
- (b) `renderScreenMono` builds the per-pixel coverage map as `1 - luma` instead of `luma` directly. Halftone convention: dark source = more ink coverage (large dots), bright source = less ink. RGB and CMYK already invert correctly via channel-to-coverage mapping (CMYK explicitly: `c = 1 - r`).

Verified live with a synthetic 80×80 image (10-px transparent pad + dark-vs-bright body): pad average alpha 0, body 255, dark-source area output luma 71 vs bright-source 178 → polarity correct.

---

## ~~Quick-access wheel arrows scroll the wrong direction~~ — fixed

**Symptom (was)**: The up/down arrows on the quick-access (radial) wheel scrolled the wheel in the inverted direction. Clicking up sent it backwards instead of advancing.

**Fix**: option (a). Both arrow handlers in `src/ui/quick-select-wheel.js:261-262` had their `rotateBy()` signs swapped — UP now calls `rotateBy(+1)`, DOWN calls `rotateBy(-1)`. Verified live: clicking UP rotates the slot rotor from 0° → +45°; clicking DOWN twice nets -45°. Scroll-wheel direction stays consistent (deltaY > 0 still advances the wheel).

---

## ~~Grouping shifts layers on canvas to a different position AND scrambles z-order~~ — fixed

**Symptom (a)**: Selecting two or more layers and pressing Ctrl+G to group them causes the visible content to jump to a different on-canvas position. The group is created but the children's apparent world positions shift.

**Symptom (b)**: The same Ctrl+G action also reorders the children in the Layer Stack — they no longer appear in the same z-order they had before grouping (top-to-bottom order in the panel changes, which means visual stacking on canvas changes too). Roadmap Phase 19 Cluster A line 161 claimed both order + position were fixed via `addGroupLayer()` reading `childIds` in panel-top-first order + `handleSortEnd` rebuild from panel DOM order — this is a regression.

**Suspected cause (a — position)**: When `addGroupLayer` reparents children's Konva.Groups into the new parent group, the parent group has its own `transform.x/y` (likely 0,0 or the topmost child's coords). Children's `group.position` is now in PARENT-LOCAL space — but their stored `layer.transform.x/y` was in WORLD space. If the reparent doesn't compensate the children's local positions for the new parent's offset, they visually jump by the parent's transform.

**Suspected cause (b — z-order)**: `addGroupLayer()` should snapshot the pre-group child order (panel-top-first, which maps to highest-z-first) and write it into `childIds`. Look for: (1) whether `getSelection()` returns the panel-display order or some other iteration order (Set insertion order may not match user's panel layout); (2) whether `splice`ing the group at the topmost child's z-position correctly inherits the topmost slot but pushes other children DOWN by one rank (off-by-one); (3) whether `handleSortEnd`'s DOM-order rebuild fires AFTER the structural commit and inadvertently re-shuffles based on intermediate state.

**Files involved**: `src/core/document.js` (`addGroupLayer`, `getSelection` order semantics), `src/ui/layer-panel.js` (`handleSortEnd` DOM-order rebuild, selection iteration order), `src/core/renderer.js` (`case 'group:childrenChanged'` + `case 'doc:loaded'` reparent paths around L1690-1720).

**What was tried**: Roadmap Phase 19 Cluster A claims this was fixed once. Regression source unknown — probably a recent commit to `getSelection()` storage (Set vs sorted array), or `handleSortEnd` interaction with the new color-hub / quick-wheel cluster touching layer-panel.js.

**Possible fixes**: (a) **Position**: on group creation, set the parent group's transform to (0,0) AND keep children's transforms unchanged in world space (store children's worlds, then on reparent recompute their parent-local x/y as `world - parent.world`); OR set the parent's transform to the topmost child's world position and shift children's local positions accordingly so the visible result is identical to pre-group. (b) **Z-order**: explicitly sort the selected layers by their `doc.indexOfLayer(id)` (descending = top-of-panel first) BEFORE building the group's `childIds`, so the order is deterministic regardless of how `getSelection()` enumerates. Add a regression test: create 3 layers (A, B, C top-to-bottom), select all, Ctrl+G, assert group.childIds === [A.id, B.id, C.id] AND world position of each child is unchanged (within 1 px tolerance).

**Fix**:

- **Position** (a) root cause: `src/core/renderer.js` `createLayerNodes` had an auto-centre block that snapped any freshly-created layer with `transform === (0, 0)` and `naturalSize == null` to the viewport centre. The block was authored for image drag-drop imports but had no `layer.type` guard — a brand-new group (transform defaults to `(0, 0)`, `naturalSize` not yet set) hit the condition and got nudged by hundreds of pixels. After the nudge, each child's Konva.Group still carried its pre-group local position (Konva's `moveTo()` preserves local coords), so when Konva applied the parent's new world position, every child appeared to jump by `(group.transform.x, group.transform.y)`. **Fix**: gated the auto-centre to `layer.type === 'image'`. Groups now stay at `(0, 0)` exactly as the document model intends; children's stored transforms map 1-to-1 to world without compensation.
- **Order** (b) root cause: callers (`toolbar.js`'s `topLevelOrder`, `layer-panel.js`'s combine button + context menu) all pass `childIds` in panel-top-first order, but the renderer's `syncZOrder` Pass 2 and the panel's `nodeMarkup` (which reverses childIds before rendering) both expect BOTTOM-FIRST. The conventions disagreed across files. **Fix**: normalised inside `src/core/document.js` `addGroupLayer` — `childIds` is now sorted by `findIndex(cid)` ascending (bottom-first) regardless of how the caller enumerates the selection. Updated `dissolveGroup` to make the LAST entry (the topmost child) the new active layer when the dissolved group was active, so dissolving feels like "the top child surfaces" rather than "the bottom child surfaces". The existing `handleSortEnd` already used the bottom-first convention (line 566 does `group.childIds = ids.slice().reverse()` on its DOM-order capture) — that path was already correct.

**Verified**: created 3 image layers A (world 100,100), B (220,160), C (340,220) — A bottom, C top of panel. `setSelection(all)` → top-first enumeration `[C, B, A]` passed to `addGroupLayer`. Result: `group.childIds` resolved to bottom-first `[A, B, C]`; `group.transform` stayed `(0, 0)`; each child's Konva absolute position unchanged within 1 px (A 100/100, B 220/160, C 340/220). After page reload: state restored identically. After Ctrl+Z: all 3 layers `parentGroupId: null`, positions still 100/100, 220/160, 340/220.

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

**Status (2026-05-10)**: needs-repro. Diagnostic ran a synthetic image layer with Drop Shadow (distance 30, blur 20), captured `.app-footer.getBoundingClientRect().top` + `.side-panel` height + canvas-area bottom + viewport height, toggled `knockout` via `setEffectParams` OFF→ON→OFF, and re-captured. All values stayed identical (footer.top=867, footerH=36, sidePanel top=48, canvas bottom=867 across all three states). No `:has()` selectors exist anywhere in `src/style/`. `--footer-h` is a static `36px` token and isn't mutated at runtime. The footer is grid-area-anchored, not flow-positioned. The reflow described in the report doesn't reproduce against the current build — likely fixed by an unrelated layout/Konva commit since the report was filed.

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

**Status (2026-05-10)**: needs-repro. Synthetic test ran a 30-step drag emulation (`setVectorPath` + `setLayerTransform` per step at ~16 ms intervals) — `dstCanvas` grew step-by-step (61×61 → 94×94 → … → 221×221) and `_paintVersion` incremented 2 → 7 in lockstep, so the renderer IS rasterising every frame and committing pad-aware sizes. The `layer:vectorChanged` path through `rasterizeSource` → `paintLayer` → `schedulePaint` works as designed under back-to-back updates. If the visible canvas still doesn't show a live preview, the symptom likely lives in Konva stage redraw scheduling, not in the document-event chain — repro with the rectangle tool against the current build before reopening.

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
