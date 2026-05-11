// drop-loader — small centred spinner positioned at the world coords of a
// freshly-dropped image / SVG / URL while loadImageBitmap() and the first
// paintLayerSync() resolve. For a small drop (<500 KB JPEG) the first
// paint commits before the 200 ms fade-in fires → no flash. For multi-MB
// drops the loader bridges the otherwise-silent gap.
//
// Wiring:
//   - canvas-view's drop handler calls `dropLoader.showPending(worldX, worldY)`
//     right before forwarding the file to onImageDropped / importSvgFile.
//     Multiple pending drops queue.
//   - doc.subscribe(layer:added) claims the oldest pending entry and binds it
//     to the new layer's id.
//   - renderer.onFirstPainted(id) → hide.
//   - doc.subscribe(layer:removed) → defensive cleanup.
//
// World-space tracking: the stage may pan/zoom while a loader is visible
// (user keeps interacting). The loader re-applies the world→screen transform
// on every animation frame while any loader is mounted, then stops the loop
// when the map drains.

let _stageContainer = null;
let _stage = null;
let _document = null;
let _renderer = null;
// Loaders bound to a known layer id. id → { el, world, fadeInTimer }
const _byLayerId = new Map();
// Pending drops waiting for the next layer:added to claim them.
// FIFO array of { world, fadeInTimer, el } — created up-front so the fade-in
// timer is already counting before the async file decode begins.
const _pending = [];
let _rafTickHandle = 0;

function worldToScreen(worldX, worldY) {
  if (!_stage) return { x: 0, y: 0 };
  const sc = _stage.scaleX() || 1;
  return {
    x: worldX * sc + _stage.x(),
    y: worldY * sc + _stage.y(),
  };
}

function placeLoader(el, world) {
  const p = worldToScreen(world.x, world.y);
  el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
}

function tick() {
  _rafTickHandle = 0;
  if (_byLayerId.size === 0 && _pending.length === 0) return;
  for (const { el, world } of _byLayerId.values()) placeLoader(el, world);
  for (const entry of _pending) if (entry.el) placeLoader(entry.el, entry.world);
  _rafTickHandle = requestAnimationFrame(tick);
}
function ensureTick() {
  if (_rafTickHandle) return;
  _rafTickHandle = requestAnimationFrame(tick);
}

function createLoaderEl() {
  const el = window.document.createElement('div');
  el.className = 'drop-loader';
  el.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
  _stageContainer.appendChild(el);
  return el;
}

function fadeIn(entry) {
  if (!entry.el) return;
  // The 200 ms delay before adding `--visible` is what suppresses the
  // flash on tiny / cached drops: if paintLayerSync commits first,
  // hide() drops the entry before this timer fires.
  entry.fadeInTimer = setTimeout(() => {
    entry.fadeInTimer = 0;
    if (entry.el) entry.el.classList.add('drop-loader--visible');
  }, 200);
}

function disposeEntry(entry) {
  if (!entry) return;
  if (entry.fadeInTimer) { clearTimeout(entry.fadeInTimer); entry.fadeInTimer = 0; }
  const el = entry.el;
  if (!el) return;
  entry.el = null;
  el.classList.remove('drop-loader--visible');
  // Match the 200 ms CSS opacity transition so the user sees a fade-out.
  setTimeout(() => { try { el.remove(); } catch {} }, 220);
}

export function initDropLoader({ stageContainer, stage, document: doc, renderer }) {
  if (!stageContainer || !doc || !renderer) {
    console.warn('[drop-loader] missing dependencies');
    return;
  }
  _stageContainer = stageContainer;
  _stage = stage || null;
  _document = doc;
  _renderer = renderer;

  // Claim the oldest pending drop on the next layer:added. We don't filter
  // by layer.type — every drop branch (image, SVG vector) flows through
  // a single layer:added event right after createLayerNodes spins up.
  doc.subscribe((e) => {
    if (e.type === 'layer:added' && e.layer && _pending.length > 0) {
      const entry = _pending.shift();
      _byLayerId.set(e.layer.id, entry);
      return;
    }
    if (e.type === 'layer:removed' && e.id) {
      const entry = _byLayerId.get(e.id);
      if (entry) {
        _byLayerId.delete(e.id);
        disposeEntry(entry);
      }
      return;
    }
  });

  renderer.onFirstPainted((layerId) => {
    const entry = _byLayerId.get(layerId);
    if (!entry) return;
    _byLayerId.delete(layerId);
    disposeEntry(entry);
  });
}

// Called from canvas-view's drop handler with the world-space drop point.
// Creates the DOM node immediately (so position tracking starts) and starts
// the 200 ms fade-in clock. Returns an opaque handle for completeness.
export function showPendingDrop(worldX, worldY) {
  if (!_stageContainer) return null;
  const el = createLoaderEl();
  const entry = { el, world: { x: worldX, y: worldY }, fadeInTimer: 0 };
  placeLoader(el, entry.world);
  fadeIn(entry);
  _pending.push(entry);
  ensureTick();
  // Safety: if no layer:added arrives within 8 s (e.g. user dropped a file
  // type the doc rejects, fetch failed silently), drop the placeholder so
  // it doesn't dangle forever.
  setTimeout(() => {
    const idx = _pending.indexOf(entry);
    if (idx >= 0) {
      _pending.splice(idx, 1);
      disposeEntry(entry);
    }
  }, 8000);
  return entry;
}
