// canvas-view — Konva stage init, pan/zoom, selection, drop-to-add-image.

import Konva from 'konva';

export function initCanvasView({ container, document, onImageDropped }) {
  const stage = new Konva.Stage({
    container,
    width: container.clientWidth,
    height: container.clientHeight,
  });
  const bgLayer = new Konva.Layer({ listening: false });
  stage.add(bgLayer);
  const contentLayer = new Konva.Layer();
  stage.add(contentLayer);

  // Resize stage with container.
  const resize = () => {
    stage.width(container.clientWidth);
    stage.height(container.clientHeight);
    contentLayer.batchDraw();
  };
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(container);
  }

  // ---------- Wheel zoom (zoom-to-pointer) ----------
  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const scaleBy = 1.08;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clamped = Math.max(0.05, Math.min(20, newScale));
    stage.scale({ x: clamped, y: clamped });
    stage.position({
      x: pointer.x - mousePointTo.x * clamped,
      y: pointer.y - mousePointTo.y * clamped,
    });
    stage.batchDraw();
    syncCursor();
  });

  // ---------- Spacebar + drag pan ----------
  let spaceDown = false;
  let panning = false;
  let lastPan = null;

  function syncCursor() {
    container.style.cursor = panning ? 'grabbing' : (spaceDown ? 'grab' : '');
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isEditingText()) {
      spaceDown = true;
      stage.find('.slammer-layer').forEach((g) => g.draggable(false));
      syncCursor();
      e.preventDefault();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isEditingText()) return;
      const id = document.activeLayerId;
      if (id) {
        document.removeLayer(id);
        e.preventDefault();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      panning = false;
      // Restore draggable state on all layers.
      stage.find('.slammer-layer').forEach((g) => g.draggable(true));
      syncCursor();
    }
  });

  function isEditingText() {
    const ae = window.document.activeElement;
    return !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
  }

  stage.on('mousedown touchstart', (e) => {
    if (spaceDown || e.evt.button === 1) {
      panning = true;
      lastPan = { x: e.evt.clientX ?? e.evt.touches?.[0]?.clientX, y: e.evt.clientY ?? e.evt.touches?.[0]?.clientY };
      syncCursor();
      e.evt.preventDefault();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!panning || !lastPan) return;
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    lastPan = { x: e.clientX, y: e.clientY };
    stage.position({ x: stage.x() + dx, y: stage.y() + dy });
    stage.batchDraw();
  });
  window.addEventListener('mouseup', () => {
    panning = false;
    lastPan = null;
    syncCursor();
  });

  // ---------- Click selection ----------
  stage.on('click tap', (e) => {
    if (panning || spaceDown) return;
    const target = e.target;
    if (target === stage) {
      document.setActiveLayer(null);
      return;
    }
    // Walk up to find a layer group with id matching a known layer.
    let node = target;
    while (node && node !== stage) {
      const id = node.id?.();
      if (id && document.findLayer(id)) {
        if (document.activeLayerId !== id) document.setActiveLayer(id);
        return;
      }
      node = node.getParent && node.getParent();
    }
  });

  // ---------- File drop on canvas ----------
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    container.classList.add('drag-over');
  });
  container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer?.files || []);
    files.forEach((f) => {
      if (f.type.startsWith('image/')) onImageDropped?.(f);
    });
  });

  function zoomBy(factor) {
    const newScale = Math.max(0.05, Math.min(20, stage.scaleX() * factor));
    stage.scale({ x: newScale, y: newScale });
    stage.batchDraw();
  }

  function fitTo() {
    // Fit all visible layer bounding rects into the viewport.
    const groups = stage.find('.slammer-layer').filter((g) => g.visible());
    if (!groups.length) {
      stage.scale({ x: 1, y: 1 });
      stage.position({ x: 0, y: 0 });
      stage.batchDraw();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of groups) {
      const r = g.getClientRect({ skipTransform: false, relativeTo: contentLayer });
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;
    const pad = 60;
    const scaleX = (stage.width() - pad * 2) / w;
    const scaleY = (stage.height() - pad * 2) / h;
    const scale = Math.max(0.05, Math.min(20, Math.min(scaleX, scaleY)));
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: -minX * scale + (stage.width() - w * scale) / 2,
      y: -minY * scale + (stage.height() - h * scale) / 2,
    });
    stage.batchDraw();
  }

  return {
    stage,
    bgLayer,
    contentLayer,
    zoomBy,
    fitTo,
    getStage: () => stage,
  };
}
