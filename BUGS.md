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

## Undo flicker — every history step tears down all Konva nodes

**Symptom**: Pressing Ctrl+Z / Ctrl+Y briefly blanks the canvas. The flash is short but visible, especially on projects with many layers.

**Suspected cause**: `src/core/history.js#undo` calls `doc.load(prev)`, which fires `doc:loaded`. The renderer's `doc:loaded` handler in `src/core/renderer.js` (~line 1311) tears down every layer's Konva nodes (`destroyLayerNodes(id)`) and rebuilds them via `await createLayerNodes(layer)`. The teardown leaves the Konva stage empty for several frames while bitmaps re-decode.

**Files involved**: `src/core/renderer.js` (createLayerNodes / destroyLayerNodes / `case 'doc:loaded'`), `src/core/history.js`, `src/core/document.js#load`.

**What was tried**: nothing — flagged in Phase 19 Cluster F audit, parked because the fix is a renderer rewrite, not a small patch.

**Sketch of the fix**: instead of nuking + rebuilding, diff `state.layers` against the live `layerState` Map:
- For layers in BOTH old + new: patch in-place (transform, params, visible, opacity, source).
- For layers ONLY in new: create.
- For layers ONLY in old: destroy.
- Walk `effect.params` per cached effect step and only invalidate caches whose params changed.
This needs a fresh design pass + careful handling of source Blob refs and FX layers (which composite from layers below). Best done as its own dedicated cluster, not folded into a polish pass.
