# Autonomous run — verification checklist

> Generated 2026-05-07 while the maintainer was away. Each item below corresponds to one commit on `v.1.0.2`. Walk through them in order, tick what passes, file an issue for anything that breaks.

---

## How to verify

Hard reload the dev server (`Ctrl+Shift+R`) before starting so HMR can't mask a broken module-level rewrite.

---

## 1. Canvas Grid — full-stage rendering

**Commits:** `c47ce86` → `07b0212`
**Files:** `src/ui/canvas-grid.js`
**Why:** Two earlier attempts left the grid clipped to a fixed-size square in document space. Konva.Shape was caching a bbox from the first sceneFunc draw. Rewrote to paint via the layer's `draw` event onto the raw 2d context — no Shape, no bbox.

- [ ] Footer **Grid** button toggles the grid (also `Ctrl+;`).
- [ ] Grid covers the **entire viewport** — not bounded to the original-load square.
- [ ] Pan with middle-mouse: grid scrolls with the canvas, no clipping at the new viewport edges.
- [ ] Zoom out far enough: lines auto-tier from 10/100 → 100/1000 → 1000/10000 (no infinite-density mush).
- [ ] Resize side panel / toggle fullscreen: grid re-fits to the new container width without stale dead zones.

---

## 2. Canvas Grid — z-index above export-frame dim

**Commit:** `c47ce86`
**File:** `src/ui/canvas-grid.js`
**Why:** Grid was at z=1 (under the dim overlay). Outside the export frame the dim painted ~80% black on top of the grid, making it look "limited to the doc rect". Lifted to z=3 between overlay and frameUI.

- [ ] With an export frame set + frame-dim > 0, the grid stays at its configured opacity **across the entire viewport** including the dimmed area.
- [ ] Frame-resize handles (corners + the move handle next to the frame) still receive clicks — they sit above the grid layer.

---

## 3. Settings popup — regrouped by intent

**Commit:** `30007d3`
**File:** `src/ui/settings-popup.js`
**Why:** Audit moved Autosave (persistence behaviour, not chrome) from Canvas to Workflow; merged single-row Workflow groups (Effects panel / Vector tools / Typography → Panels / Tools); tightened Canvas to "Stage & grid".

- [ ] **Workflow tab** has Selection · Panels · Tools · Persistence · Coming soon (in that order).
- [ ] **Autosave delay** lives in Workflow → Persistence, with the same knob + numeric input it had before.
- [ ] **Canvas tab** has Export frame · Canvas Grid · Coming soon (Versioning · Frame tool · Crop tool).
- [ ] All grid sub-controls (Show grid, Snap to grid, Minor / Major pitch, Opacity, Colour) live in Canvas → Canvas Grid and behave identically to before the move.

---

## 4. Image-URL drop on canvas — corsproxy fallback

**Commit:** `f24fc89`
**File:** `src/ui/canvas-view.js`
**Why:** Met-museum image CDN doesn't send CORS headers. Dragging a Met card into the canvas hit `Failed to fetch` and silently dropped. Same fallback the Met API search uses (`https://corsproxy.io/?url=…`) now wraps the drop fetch.

- [ ] Open Met plugin → search → drag a result card onto the canvas → image lands as a layer.
- [ ] Console may log `direct fetch failed, retrying via corsproxy` once before success — that's expected.
- [ ] Drag from Unsplash / Pexels still works (they served direct fetch already, so the proxy retry never triggers).

---

## 5. Collapsible Typography & Vector panels

**Commit:** `f24fc89`
**Files:** `src/ui/text-tool.js`, `src/ui/vector-tool.js`, `src/style/effects.css`
**Why:** Phase 19 Cluster A leftover. Click the panel header to fold the body away, freeing screen real estate when typography / vector tweaking isn't the current focus.

- [ ] Select a text layer → **Typo** header has a chevron. Click it: body collapses, chevron rotates 90° anticlockwise.
- [ ] Reload the page: the Typo panel restores its collapsed/expanded state (LocalStorage `slammer:typo:panelCollapsed`).
- [ ] Select a vector layer → same behaviour for the **Vector** header (`slammer:vector:panelCollapsed`).
- [ ] Tab onto the header and press Enter or Space: same toggle.
- [ ] Effects panel below still works while a tool panel is collapsed.

---

## 6. Guidelines hide with rulers

**Commit:** `e613909`
**File:** `src/ui/snap-rulers.js`
**Why:** Toggling rulers off used to leave guideline hairlines floating across the canvas with no UI affordance to drag/delete them.

- [ ] Drag a guideline out from a ruler. Toggle rulers off (footer button or `Ctrl+R`): guidelines disappear.
- [ ] Toggle rulers back on: guidelines reappear at the same world coords.
- [ ] Reload while rulers are off: guideline data still in `doc.state.guidelines`, hairlines remain hidden until rulers come back.

---

## 7. fitTo on Open — naturalSize fallback

**Commit:** `eed1303`
**File:** `src/ui/canvas-view.js`
**Why:** BUGS.md item. `getClientRect` returned 1×1 placeholder dims for Konva.Image nodes whose bitmap hadn't decoded yet, so the bbox was wrong on the first frame after load. Now falls back to `layer.naturalSize × transform.scale*`.

- [ ] Open an existing project from the project menu (Ctrl+O). The view fits — content is centred and visible at a reasonable zoom.
- [ ] Repeat with a project that contains scaled or rotated layers — layers still fit (rotated bboxes over-estimate by up to √2× but never clip).
- [ ] User-driven zoom / pan after Open is preserved if you reload (no second forced fit).

---

## 8. Version display unified to v1.0.2

**Commit:** `eed1303`
**Files:** `index.html`, `src/main.js`
**Why:** Old strings drifted (header tag was `v1.0.0-alpha`, settings stamp was `vv1.0.1`). All three render sites now read from a single string passed into the settings popup.

- [ ] Header tag (next to the slammer.app logo) reads `v1.0.2`.
- [ ] Settings → About → Build → Version reads `v1.0.2`.
- [ ] Settings sidebar bottom stamp reads `v1.0.2 · slammer.app`.

---

## 9. Konva 6-layer warning silenced

**Commit:** `a7aa0e3`
**File:** `src/ui/canvas-view.js`
**Why:** Konva spammed `The stage has 6 layers. Recommended maximum is 3-5` on every layer add and zIndex shift. Our layer count is intentional and stable; merging into Groups would be a major refactor with no measurable performance gain.

- [ ] Open DevTools console. Interact with the canvas (zoom, pan, add a layer). No "stage has 6 layers" warnings appear.
- [ ] Other Konva warnings (real ones) would still surface — only `showWarnings = false` was set, no error filter.

---

## 10. Roadmap.md / BUGS.md cleanup

**Commits:** `eed1303`, `a7aa0e3`
**Files:** `roadmap.md`, `BUGS.md`
**Why:** Cluster A items were mostly already shipped — code present in `toolbar.js`, `layer-panel.js`, `canvas-view.js` — but the roadmap still showed them unchecked. Same for Drop Shadow angle widget. BUGS.md fit-to-view entry struck through.

- [ ] `roadmap.md` Phase 19 Cluster A — every checkbox ticked with a one-line note pointing to the implementation.
- [ ] `roadmap.md` Phase 19 Cluster B — "Drop Shadow angle control rework" ticked.
- [ ] `roadmap.md` end of Phase 18 — version-number line ticked.
- [ ] `BUGS.md` — only one open entry remains: "Undo flicker — every history step tears down all Konva nodes" (correctly parked, scope = renderer rewrite).

---

## 11. Tooltip / aria-label polish on toolbar + layer cards

**Commit:** `586a062`
**Files:** `index.html`, `src/ui/layer-panel.js`, `src/main.js`
**Why:** Audit found gaps in icon-only buttons. Zoom-in / Zoom-out had no titles at all; layer-card lock / vis / dup / del were missing aria-labels; the autosave dot was always titled "Autosave" regardless of state.

- [ ] Hover the canvas zoom **+** and **−** buttons: tooltips read "Zoom in (mouse wheel up)" / "Zoom out (mouse wheel down)".
- [ ] Hover the **Fit** crosshair button: "Fit content to viewport".
- [ ] Hover a layer card's lock icon: title includes `(Ctrl+L)`. Hover the trash: title includes `(Del)`.
- [ ] Make any change. The autosave dot tooltip cycles "Unsaved changes — autosave pending" → "Autosaving…" → "All changes saved" → "Autosave".

---

## 12. Drop dead font-loader re-exports from text-tool

**Commit:** `e9a9e31`
**File:** `src/ui/text-tool.js`
**Why:** `preloadFontsForDoc` and `ensureGoogleFont` had been moved to `font-loader.js` long ago, but `text-tool.js` still re-exported them "for backward compat". Grep confirms zero callers consume them via `text-tool.js` — every consumer (`main.js`, `project-menu.js`, `project-file.js`) imports straight from `font-loader.js`. Public surface trimmed.

- [ ] Open + close a project — fonts still load (regression check on the actual call sites, not the deleted re-exports).
- [ ] Type into a text layer — typography panel still renders normally.

---

## 13. Version display final string

**Commits:** `7eb011f` → `ba6964e`
**Files:** `index.html`, `src/main.js`, `roadmap.md`, `CHECKLIST.md`
**Why:** Mid-run user clarification — display reads `v1.0.2` (dotted), not `v1.0.2-alpha` and not `v1.02`. package.json keeps the canonical `1.0.2`.

- [ ] Toolbar header tag reads exactly `v1.0.2`.
- [ ] Settings → About → Version reads `v1.0.2`.
- [ ] Settings sidebar bottom stamp reads `v1.0.2 · slammer.app`.

---

## 14. Project browser / floating window / plugin roadmap polish

**Commit:** `c0f2fba`
**Files:** `src/ui/project-menu.js`, `src/ui/floating-window.js`, `src/ui/settings-popup.js`
**Why:** Audit pass for tooltips and stale roadmap copy.

- [ ] Open the project browser. Hover Import / Save As / New Folder / Toggle View / Close — each tooltip is now a full sentence ("Import .slmr project file" etc.).
- [ ] Click Toggle View — tooltip flips between "Switch to list view" and "Switch to grid view" depending on current mode (icon already flipped, now the tip matches).
- [ ] Open any floating plugin window. Hover the close button — tip reads "Close (Esc)".
- [ ] Open Settings → Plugins → Coming soon. The list reads Smithsonian / Rijksmuseum / V&A / Plugin sandbox. (Openverse + Plugin Manager were stale — both are already shipped and have been removed.)

---

## 15. Effect-card icon-button labels

**Commit:** `563be91`
**File:** `src/ui/effect-panel.js`
**Why:** `act-toggle` and `act-del` previously read just "Disable" / "Enable" / "Remove" — ambiguous to a screen reader. Both buttons now say "… effect" + matching aria-label.

- [ ] Hover an effect card's circle button — tip reads "Disable effect" or "Enable effect" depending on state.
- [ ] Hover the × — tip reads "Remove effect".

---

## 16. Shortcuts table refresh

**Commit:** `bd5e46e`
**File:** `src/ui/settings-popup.js`
**Why:** Settings → Shortcuts table predated Phase 21. Snap / Rulers / Grid / Space-pan / Alt-escape-snap / F11 / Ctrl+Y were all wired in code but invisible in the UI table.

- [ ] Open Settings → Shortcuts.
- [ ] **Edit** row "Ctrl+Shift+Z / Ctrl+Y" listed for Redo.
- [ ] **Move & transform** row "Alt+drag — Escape snap during drag" listed.
- [ ] **Canvas** rows include `Space+drag` (pan), `Ctrl+R` (rulers), `Ctrl+;` (grid), `S` (snap), `F11` (fullscreen).

---

## 17. README ASCII header version bump

**Commit:** `86779b0`
**File:** `README.md`
**Why:** Header read v.1.0.1 — last stale version string outside the app shell.

- [ ] `README.md` line 5 reads `v.1.0.2`.

---

## 18. Autosave error indicator

**Commit:** `381c8bc`
**Files:** `src/main.js`, `src/style/effects.css`
**Why:** Previously an autosave failure reset the dot to its default state with the generic "Autosave" tooltip — silently indistinguishable from "nothing has changed yet". Now sets state='error' (red dot + glow + tooltip "Autosave failed — check console for details"). The console.error keeps surfacing the actual exception.

- [ ] Hard to reproduce naturally — to test, paste this in DevTools console while the app is open: `(()=>{const oldOpen=indexedDB.open;indexedDB.open=()=>{throw new Error('test')};setTimeout(()=>indexedDB.open=oldOpen,100)})();` then make any change. The dot should briefly turn red.
- [ ] Without provoking it, regular saves still cycle yellow → green → grey.

---

## 19. Layer-card blend-mode trigger tooltip + aria

**Commit:** `eeb8589`
**File:** `src/ui/layer-panel.js`
**Why:** Trigger shows abbreviated mode names ("Mult" / "Scrn" / …) — useful at a glance but ambiguous to a screen reader. Title now reads "Blend mode: Multiply — click to pick, scroll to cycle" and an aria-label carries the full name. Both stay in sync with the live state.

- [ ] Hover any layer's blend-mode pill — tooltip includes the full name + the click/scroll hint.
- [ ] Scroll-wheel over the pill cycles modes; tooltip updates after each step.

---

## 20. Rename keydown handler leak (layer + project + folder)

**Commits:** `43acc59`, `3e7f6dd`
**Files:** `src/ui/layer-panel.js`, `src/ui/project-menu.js`
**Why:** `beginRename` / `beginProjectRename` / `beginFolderRename` each added a `keydown` listener on the contenteditable element on every rename gesture, but never removed it on commit or cancel. Every double-click → cancel cycle leaked another handler. After enough renames, Enter / Escape would trigger the action multiple times. Now `finish()` / `teardown()` calls `removeEventListener` on both paths.

- [ ] Rename a layer 5 times in a row (double-click → type → Esc → repeat). Then Enter once on the 6th — only one rename happens (no duplicate commits from leaked listeners).
- [ ] Same for project-browser project rename and folder rename.

---

## 21. Layer-card opacity row title

**Commit:** `43acc59`
**File:** `src/ui/layer-panel.js`
**Why:** `.layer-opacity-row` had no tooltip; the user had to discover that the knob accepts drag, scroll, AND keyboard input.

- [ ] Hover the opacity area on any layer card — tooltip reads "Layer opacity — drag the knob, scroll, or type a number".

---

## 22. Guideline drag listener leak

**Commit:** `e565c43`
**File:** `src/ui/snap-rulers.js`
**Why:** `createGuidelineEl` attached `mousemove` + `mouseup` listeners on `window` for each guideline and never removed them. Every guideline ever created leaked another pair on `window`, and via closures those listeners held the dead DOM node + guideline object + contentLayer reference forever. Heavy guideline projects = bloated mousemove path. createGuidelineEl now returns `{ el, cleanup }`; both `syncGuidelineEls` (when removing stale guidelines) and the top-level `destroy()` call `cleanup()` before removing the DOM node.

- [ ] Create 10 guidelines from the rulers, drag 9 back to the rulers to delete. The remaining guideline still drags + repositions correctly (other listeners not corrupted).
- [ ] Open DevTools → Performance → record a brief mouse-wave across the canvas — should not show 10 redundant mousemove handler hits per frame.

---

## 23. Drag-listener leaks across knob, curve editor, gradient editor

**Commit:** `1352463`
**Files:** `src/plugins/shared/knob.js`, `src/plugins/filters/curves/curve-editor.js`, `src/plugins/shared/gradient-editor.js`
**Why:** All three widgets attached `window` mousemove + mouseup listeners on construction and never removed them. Each instance leaked a permanent set of handlers that fired on every move event for the session lifetime, and held the widget's DOM via closure. With dozens of knobs per project (every layer opacity, every effect parameter), and gradient editors that rebuild on every stop add/remove, this was real cost. Listeners now attach on mousedown / startDrag and detach on mouseup / endDrag.

- [ ] Drag any knob (e.g. layer opacity). Releases cleanly, value updates as before.
- [ ] Open a Curves filter, drag a curve point. Same behaviour as before, no console errors.
- [ ] Open a Gradient Map filter, drag a gradient stop. Same behaviour as before.
- [ ] Heavy projects (many layers + effects) feel slightly less heavy under sustained mouse motion — measurable in DevTools Performance recording, not by eye.

---

## 24. gradientStopsRow drag-listener leak

**Commit:** `0eb989a`
**File:** `src/plugins/shared/ui-helpers.js`
**Why:** Same pattern as section 23 — `gradientStopsRow`'s per-stop drag attached `window` mousemove + mouseup at handle creation and never removed them. `rebuildHandles` recreates handles aggressively (every stop add / remove / reorder), so this leaked many sets per session. Listeners now attach in mousedown, detach in mouseup.

- [ ] Open any gradient picker that uses gradientStopsRow (e.g. vector-tool gradient-along-stroke). Add / remove stops several times. Drag still works.

---

## 25. Export-button tooltip correction

**Commit:** `19cd441`
**File:** `index.html`
**Why:** Tooltip read "Export PNG (Ctrl+E) · Shift = .slammerproj" — both halves stale. The popup supports PNG / JPEG / WebP, and Shift+click invokes `exportSlmr` which writes `.slmr` (the portable share format), not `.slammerproj` (the local project format).

- [ ] Hover the toolbar Export button — tooltip reads "Export PNG / JPEG / WebP (Ctrl+E) · Shift = portable .slmr".

---

## 26. aria-modal="true" on every modal dialog

**Commit:** `620d528`
**Files:** `src/ui/settings-popup.js`, `src/ui/project-menu.js`, `src/ui/shop-popup.js`, `src/ui/document-size-popup.js`, `src/ui/plugin-manager-popup.js`, `src/ui/typography/font-picker.js`
**Why:** All six dialogs already had `role="dialog"` + `aria-label`; only `aria-modal="true"` was missing. Without it, assistive tech doesn't know that focus is trapped to the dialog.

- [ ] No visible change in normal use. Verifiable in DevTools accessibility tree — each dialog now exposes `modal: true`.

---

## 27. Phase 21 Transform inspector (read-only)

**Commit:** `9abb10c`
**Files:** `src/ui/transform-inspector.js` (new), `src/main.js`, `src/style/components.css`, `roadmap.md`
**Why:** First chunk of the Phase 21 Transform inspector task. Fills the previously empty `.footer-center` area with a tabular-numerics HUD showing the active layer's world-space coordinates, scaled W × H, and rotation. Editable inputs + lock-aspect + reset deferred to a follow-up — the readout alone closes the "user can't see exact coords without DevTools" gap. Roadmap entry marked partially-shipped (`[~]`).

- [ ] Select any non-FX layer. Footer center reads e.g. `X 120 Y 80 W 320 H 240 ∠ 0.0°` with tabular numerics + accent-tinted keys.
- [ ] Drag the layer on canvas — the HUD updates live (`layer:transform` event hook).
- [ ] Rotate via the rotater handle — rotation reads e.g. `∠ 5.0°` (snapped) or `∠ -42.7°` (free).
- [ ] Click an FX layer in the layer panel — HUD hides (FX layers have no own pixels).
- [ ] Click empty canvas to deselect — HUD hides.
- [ ] Multi-drag many layers — HUD only updates for the active layer (no thrash from sibling `layer:transform` events).

---

## 28. Zoom-level readout pill

**Commit:** `4abaa6f`
**Files:** `index.html`, `src/ui/toolbar.js`, `src/style/components.css`
**Why:** Until now the only way to see the current zoom was by hovering the Fit button or by counting wheel ticks. New pill between zoom-in and zoom-out shows the live percentage. Click → reset to 100% around viewport centre. Double-click → fit-to-view.

- [ ] Footer-right zoom-controls show a pill reading e.g. `100%`. Tabular numerics keep the width steady during continuous wheel-zoom.
- [ ] Mouse-wheel over canvas → readout updates live.
- [ ] Click the pill while zoomed in/out → snaps to 100% with the viewport centre fixed (doesn't jump to origin).
- [ ] Double-click the pill → fits content to viewport (same as the Fit button).

---

## What remains in BUGS.md

Just the **undo flicker**. It's a renderer-rewrite task — diff the new state's layers against the live `layerState` map and patch in place instead of nuking + recreating. Best done as its own dedicated cluster, not folded into a polish pass.

## What remains in Phase 21

After this run:
- Frame Tool (drag-create export frames)
- Crop tool (non-destructive per-layer crop rect)
- Transform inspector — **read-only HUD shipped** ✓ (commit `9abb10c`); editable inputs + lock-aspect + reset still TBD
- Quick adjustments bar (effect knobs below selected image)
- Ctrl+Space radial effect picker

The remaining ones still need dedicated runs, not autonomous polish.

---

## Commit graph for this session

```
4abaa6f feat(zoom): footer zoom-level readout with click-to-100% / dblclick-to-fit
9abb10c feat(phase21): footer transform inspector — read-only X / Y / W / H / rotation
620d528 chore(a11y): aria-modal="true" on every modal dialog
19cd441 chore(toolbar): correct btnExport tooltip — formats + .slmr extension
0eb989a fix(ui-helpers): gradientStopsRow drag-listener leak
1352463 fix(shared): gate window-level drag listeners behind mousedown — knob, curves, gradient
e565c43 fix(snap-rulers): guideline drag listener leak
3e7f6dd fix(project-menu): rename keydown handler leak
43acc59 fix(layer-panel): rename keydown handler leak + opacity-row title
eeb8589 chore(layer-panel): blend-mode trigger tooltip + aria
381c8bc feat(autosave): explicit error dot state — red dot + tooltip on save failure
1f22a4c docs: extend CHECKLIST with sections 16-17
86779b0 docs(readme): bump ASCII header v.1.0.1 → v.1.0.2
bd5e46e docs(shortcuts): surface Snap / Rulers / Grid / Space-pan / Alt-snap-escape
c096fc4 docs: extend CHECKLIST with sections 14-15
c0f2fba chore(ui): tooltip consistency in project browser, floating window, plugin roadmap
563be91 chore(effects): tidy effect-card icon-button labels
e9a9e31 chore(text-tool): drop dead font-loader re-exports
586a062 chore(ui): tooltip / aria-label polish on toolbar + layer cards
ba6964e chore(version): correct display string v1.02 → v1.0.2
7eb011f chore(version): shorten display string v1.0.2-alpha → v1.02
baa9039 docs: add CHECKLIST.md for the autonomous-run verification pass
a7aa0e3 chore: silence Konva 6-layer warning, refresh settings roadmap
eed1303 fix(view): fitTo naturalSize fallback + version display unified
f24fc89 feat(canvas-view, panels): URL-drop CORS fallback + collapsible Typo/Vector panels
30007d3 refactor(settings): regroup by intent — autosave to Workflow, tighter Canvas
a23b2cd refactor(settings): move Canvas Grid controls into the Canvas tab
e613909 fix(rulers): hide guidelines when rulers are toggled off
07b0212 fix(canvas-grid): drop Konva.Shape, paint via layer draw event
c47ce86 fix(canvas-grid): lift above export-frame dim so grid covers full viewport
```

All branched from + merged back to `v.1.0.2` via fast-forward.
