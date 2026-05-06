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

## Fit-to-view positions the canvas wrong on Open

**Symptom**: After commit `5f48941`'s `renderer.onceLayersMounted` wiring, opening a project from the project menu DOES trigger `view.fitTo()`, but the resulting view is "somewhere" — not centered on the content.

**Suspected cause**: `view.fitTo()` uses `g.getClientRect({ relativeTo: contentLayer })` per layer group. Even though `onceLayersMounted` fires after `createLayerNodes` returns, the per-layer `Konva.Image` has been initialised with `naturalSize?.w | 0 || 1` and `naturalSize?.h | 0 || 1` — the actual decoded bitmap dimensions arrive later (next paint via `paintLayerSync`). So the rect math runs against placeholder 1×1 dims for some layers and the bbox is wrong.

**Files involved**: `src/core/renderer.js` (createLayerNodes / paintLayerSync), `src/ui/canvas-view.js` (`fitTo`).

**What was tried**: replaced `setTimeout(0)` polling with the `onceLayersMounted` deterministic hook. Helped timing but the bbox is still computed off pre-paint dims.

**Possible fixes**: (a) emit a separate `doc:rendered` event after the FIRST paint finishes for every layer (i.e., when every layerState has had `paintLayerSync` complete once), and have project-menu / project-file listen for that instead; (b) inside `fitTo`, fall back to `layer.naturalSize` from the doc model when `getClientRect` returns 1×1; (c) re-run `view.fitTo()` once more after a short delay as a belt-and-braces.
