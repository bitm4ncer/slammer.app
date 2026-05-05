// canvas-view — Konva stage init, pan/zoom, selection, drop-to-add-image.

import Konva from 'konva';
import { getSettings, onSettingsChange } from './settings-popup.js';

// Restrict Konva drag-start to the left mouse button so middle-mouse pan
// never accidentally drags overlay handles.
Konva.dragButtons = [0];

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
  // Overlay layer for the dimmed backdrop + frame stroke (non-interactive).
  // Sits ABOVE the content so it draws over layers, but listening:false so
  // it never intercepts pointer events.
  const overlayLayer = new Konva.Layer({ listening: false });
  stage.add(overlayLayer);
  // Separate layer for the draggable move-handle so it can receive events
  // without blocking layer selection (handle is small and explicit).
  const frameUiLayer = new Konva.Layer();
  stage.add(frameUiLayer);

  // ---------- Export frame overlay ----------
  // Tracks just the handle Konva.Group so dragmove can read its position
  // without re-running the full rebuild while the user is dragging.
  let activeHandle = null;
  let dragInProgress = false;

  // HTML info readout (size + aspect) — sits below the bottom-left corner
  // of the frame, double-click on a value to edit it directly on the canvas.
  const info = window.document.createElement('div');
  info.className = 'export-frame-info';
  info.hidden = true;
  info.innerHTML = `
    <span class="ef-w" contenteditable="false" title="Double-click to edit width">0</span>
    <span class="ef-x">×</span>
    <span class="ef-h" contenteditable="false" title="Double-click to edit height">0</span>
    <span class="ef-suffix">px</span>
    <span class="ef-dot">·</span>
    <span class="ef-rw" contenteditable="false" title="Double-click to set ratio">1</span>
    <span class="ef-colon">:</span>
    <span class="ef-rh" contenteditable="false" title="Double-click to set ratio">1</span>
  `;
  container.appendChild(info);
  const infoW = info.querySelector('.ef-w');
  const infoH = info.querySelector('.ef-h');
  const infoRw = info.querySelector('.ef-rw');
  const infoRh = info.querySelector('.ef-rh');

  // Sticky ratio — when the user explicitly typed a ratio, we display those
  // exact numbers instead of recomputing from w/h (where rounding turns 4:3
  // into 1.33:1). Cleared when the user edits W or H directly.
  let stickyRatio = null;

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function ratioPair(w, h) {
    if (!w || !h) return ['1', '1'];
    const g = gcd(Math.round(w), Math.round(h));
    const rw = Math.round(w / g), rh = Math.round(h / g);
    if (rw <= 64 && rh <= 64) return [String(rw), String(rh)];
    // Awkward ratio — fall back to 2-decimal float against 1.
    return [(w / h).toFixed(2), '1'];
  }

  function positionInfo(f) {
    const stagePos = stage.position();
    const sc = stage.scaleX() || 1;
    // Bottom-left of the frame in world coords → screen coords inside container.
    const sx = stagePos.x + (f.x ?? 0) * sc;
    const sy = stagePos.y + ((f.y ?? 0) + f.h) * sc + 6; // 6 px gap below
    info.style.left = `${sx}px`;
    info.style.top = `${sy}px`;
  }

  function syncInfo(f) {
    if (!f || !(f.w > 0) || !(f.h > 0)) { info.hidden = true; return; }
    info.hidden = false;
    const ae = window.document.activeElement;
    if (ae !== infoW) infoW.textContent = String(Math.round(f.w));
    if (ae !== infoH) infoH.textContent = String(Math.round(f.h));
    if (ae !== infoRw && ae !== infoRh) {
      if (stickyRatio) {
        infoRw.textContent = stickyRatio[0];
        infoRh.textContent = stickyRatio[1];
      } else {
        const [rw, rh] = ratioPair(f.w, f.h);
        infoRw.textContent = rw;
        infoRh.textContent = rh;
      }
    }
    positionInfo(f);
  }

  // Double-click → editable; Enter/blur commits.
  function makeEditable(el, key) {
    el.addEventListener('dblclick', () => {
      el.contentEditable = 'true';
      el.focus();
      window.getSelection()?.selectAllChildren(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') {
        const cur = document.state?.exportFrame;
        if (cur) el.textContent = String(Math.round(key === 'w' ? cur.w : cur.h));
        el.blur();
      }
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      const cur = document.state?.exportFrame;
      if (!cur) return;
      const v = Math.max(8, parseInt(el.textContent.replace(/[^\d]/g, ''), 10) || 0);
      const patch = key === 'w' ? { w: v } : { h: v };
      // User changed dimensions directly — drop the sticky ratio.
      stickyRatio = null;
      document.setExportFrame?.(patch);
    });
  }
  makeEditable(infoW, 'w');
  makeEditable(infoH, 'h');

  // Aspect-ratio editor — two independent number fields. Editing either side
  // applies the new ratio (rw : rh) to the frame, keeping the current width
  // and recomputing the height from it.
  function makeRatioEditable(el) {
    el.addEventListener('dblclick', () => {
      el.contentEditable = 'true';
      el.focus();
      window.getSelection()?.selectAllChildren(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') {
        const cur = document.state?.exportFrame;
        if (cur) {
          const [rw, rh] = ratioPair(cur.w, cur.h);
          infoRw.textContent = rw; infoRh.textContent = rh;
        }
        el.blur();
      }
    });
    el.addEventListener('blur', () => {
      el.contentEditable = 'false';
      const cur = document.state?.exportFrame;
      if (!cur) return;
      const a = parseFloat(infoRw.textContent);
      const b = parseFloat(infoRh.textContent);
      if (!(a > 0) || !(b > 0)) {
        const [rw, rh] = ratioPair(cur.w, cur.h);
        infoRw.textContent = rw; infoRh.textContent = rh;
        return;
      }
      const nh = Math.max(8, Math.round(cur.w * (b / a)));
      // Remember the user's exact ratio so the chip keeps showing "4 : 3"
      // instead of rebuilding "1.33 : 1" from the (rounded) pixel values.
      stickyRatio = [String(a).replace(/\.?0+$/, ''), String(b).replace(/\.?0+$/, '')];
      document.setExportFrame?.({ h: nh });
    });
  }
  makeRatioEditable(infoRw);
  makeRatioEditable(infoRh);

  function syncExportFrame() {
    const f = document.state?.exportFrame;
    // Don't tear down the handle mid-drag — Konva loses the active drag if
    // we destroy it. We just update positions on the existing nodes.
    if (dragInProgress && activeHandle && f) {
      updateFrameNodes(f);
      return;
    }
    overlayLayer.destroyChildren();
    frameUiLayer.destroyChildren();
    activeHandle = null;
    if (!f || !(f.w > 0) || !(f.h > 0)) {
      overlayLayer.batchDraw();
      frameUiLayer.batchDraw();
      syncInfo(f);
      return;
    }
    buildFrameNodes(f);
    overlayLayer.batchDraw();
    frameUiLayer.batchDraw();
    syncInfo(f);
  }

  // Refs so we can update without rebuilding.
  let dimNode = null, frameStrokeNode = null, bracketsNode = null;
  let moveHandleRef = null;
  let cornerHandles = []; // { node, key }

  function buildFrameNodes(f) {
    const x = f.x ?? 0, y = f.y ?? 0, w = f.w, h = f.h;
    const accent = getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';
    const lineGray = '#aab0b6';

    // Dimmed backdrop OUTSIDE the frame (opacity comes from settings).
    dimNode = new Konva.Shape({
      sceneFunc: (ctx) => {
        const big = 1e6;
        ctx.beginPath();
        ctx.rect(-big, -big, big * 2, big * 2);
        ctx.rect(dimNode._x, dimNode._y, dimNode._w, dimNode._h);
        ctx.fillStyle = `rgba(0, 0, 0, ${getSettings().frameDimOpacity ?? 0.80})`;
        ctx.fill('evenodd');
      },
      listening: false,
      perfectDrawEnabled: false,
    });
    dimNode._x = x; dimNode._y = y; dimNode._w = w; dimNode._h = h;
    overlayLayer.add(dimNode);

    // Solid thin gray frame outline.
    frameStrokeNode = new Konva.Rect({
      x, y, width: w, height: h,
      stroke: lineGray,
      strokeWidth: 1.5,
      strokeScaleEnabled: false,
      listening: false,
    });
    overlayLayer.add(frameStrokeNode);

    // Corner brackets — accent L-shapes, length in screen pixels.
    bracketsNode = new Konva.Shape({
      sceneFunc: (ctx) => {
        const stageScale = stage.scaleX() || 1;
        const arm = 14 / stageScale;
        ctx.lineWidth = 2 / stageScale;
        ctx.strokeStyle = accent;
        ctx.lineCap = 'square';
        const bx = bracketsNode._x, by = bracketsNode._y;
        const bw = bracketsNode._w, bh = bracketsNode._h;
        const drawL = (cx, cy, dx, dy) => {
          ctx.beginPath();
          ctx.moveTo(cx + dx * arm, cy);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx, cy + dy * arm);
          ctx.stroke();
        };
        drawL(bx,      by,      +1, +1);
        drawL(bx + bw, by,      -1, +1);
        drawL(bx,      by + bh, +1, -1);
        drawL(bx + bw, by + bh, -1, -1);
      },
      listening: false,
      perfectDrawEnabled: false,
    });
    bracketsNode._x = x; bracketsNode._y = y; bracketsNode._w = w; bracketsNode._h = h;
    overlayLayer.add(bracketsNode);

    // ---------- Move handle — top-right of the frame ----------
    const s = stage.scaleX() || 1;
    const handleR = 6 / s;
    const off = 12 / s;
    const moveHandle = new Konva.Group({
      x: x + w + off,
      y: y - off,
      draggable: true,
    });
    moveHandle.add(new Konva.Circle({
      radius: handleR,
      fill: '#2a2a2a',
      stroke: 'rgba(255,255,255,0.18)',
      strokeWidth: 1,
      strokeScaleEnabled: false,
      shadowColor: 'rgba(0,0,0,0.6)',
      shadowBlur: 4,
      shadowOpacity: 0.7,
    }));
    // 4-direction arrow cross (move icon) — light glyph on dark chip.
    const ARROW_PATH = 'M 0 -4 L -1.4 -2.6 L -0.5 -2.6 L -0.5 -0.5 L -2.6 -0.5 L -2.6 -1.4 L -4 0 L -2.6 1.4 L -2.6 0.5 L -0.5 0.5 L -0.5 2.6 L -1.4 2.6 L 0 4 L 1.4 2.6 L 0.5 2.6 L 0.5 0.5 L 2.6 0.5 L 2.6 1.4 L 4 0 L 2.6 -1.4 L 2.6 -0.5 L 0.5 -0.5 L 0.5 -2.6 L 1.4 -2.6 Z';
    const arrowScale = (handleR * 0.7) / 4;
    moveHandle.add(new Konva.Path({
      data: ARROW_PATH,
      fill: 'rgba(235,235,235,0.95)',
      scaleX: arrowScale,
      scaleY: arrowScale,
      listening: false,
    }));
    moveHandle.on('mousedown touchstart', (e) => {
      if ((e.evt && e.evt.button !== 0) || spaceDown) {
        moveHandle.stopDrag();
        e.cancelBubble = true;
      }
    });
    moveHandle.on('mouseenter', () => { if (!spaceDown) container.style.cursor = 'grab'; });
    moveHandle.on('mouseleave', () => { if (!dragInProgress) container.style.cursor = ''; });
    moveHandle.on('dragstart', () => { dragInProgress = true; container.style.cursor = 'grabbing'; });
    moveHandle.on('dragend', () => {
      dragInProgress = false;
      container.style.cursor = '';
      const cur = document.state?.exportFrame;
      if (cur) document.setExportFrame?.({ x: cur.x, y: cur.y });
    });
    moveHandle.on('dragmove', () => {
      const s2 = stage.scaleX() || 1;
      const off2 = 12 / s2;
      const cur = document.state?.exportFrame;
      if (!cur) return;
      const nx = Math.round(moveHandle.x() - cur.w - off2);
      const ny = Math.round(moveHandle.y() + off2);
      document.setExportFrame?.({ x: nx, y: ny });
    });
    activeHandle = moveHandle;
    moveHandleRef = moveHandle;
    frameUiLayer.add(moveHandle);

    // ---------- Resize handles — 4 corners ----------
    const corners = [
      { key: 'tl', cx: x,     cy: y,     cursor: 'nwse-resize' },
      { key: 'tr', cx: x + w, cy: y,     cursor: 'nesw-resize' },
      { key: 'bl', cx: x,     cy: y + h, cursor: 'nesw-resize' },
      { key: 'br', cx: x + w, cy: y + h, cursor: 'nwse-resize' },
    ];
    const sqHalf = 3.5 / s; // half-size of the square handle in screen pixels
    cornerHandles = [];
    for (const c of corners) {
      const sq = new Konva.Rect({
        x: c.cx - sqHalf, y: c.cy - sqHalf,
        width: sqHalf * 2, height: sqHalf * 2,
        fill: '#fff',
        stroke: '#0a0a0a',
        strokeWidth: 1.2,
        strokeScaleEnabled: false,
        draggable: true,
      });
      sq.on('mousedown touchstart', (e) => {
        if ((e.evt && e.evt.button !== 0) || spaceDown) {
          sq.stopDrag();
          e.cancelBubble = true;
        }
      });
      sq.on('mouseenter', () => { if (!spaceDown) container.style.cursor = c.cursor; });
      sq.on('mouseleave', () => { if (!dragInProgress) container.style.cursor = ''; });
      sq.on('dragstart', (e) => {
        dragInProgress = true;
        container.style.cursor = c.cursor;
        const cur = document.state?.exportFrame;
        if (cur) sq._startFrame = { x: cur.x, y: cur.y, w: cur.w, h: cur.h, aspect: cur.w / cur.h };
        // Free resize (Shift) abandons whatever sticky ratio was set.
        if (e.evt && e.evt.shiftKey) stickyRatio = null;
      });
      sq.on('dragend', () => {
        dragInProgress = false;
        container.style.cursor = '';
        const cur = document.state?.exportFrame;
        if (cur) document.setExportFrame?.({ x: cur.x, y: cur.y });
      });
      sq.on('dragmove', (e) => {
        const s2 = stage.scaleX() || 1;
        const sh = 3.5 / s2;
        const start = sq._startFrame;
        if (!start) return;
        const free = !!(e.evt && e.evt.shiftKey); // Shift = free, default = locked
        const aspect = start.aspect;
        // Centre of the dragged square in world coords.
        const px = sq.x() + sh;
        const py = sq.y() + sh;
        const MIN = 8;
        // Anchor = opposite corner (stays fixed during scale).
        const ax = (c.key === 'tl' || c.key === 'bl') ? start.x + start.w : start.x;
        const ay = (c.key === 'tl' || c.key === 'tr') ? start.y + start.h : start.y;
        let nw = Math.max(MIN, Math.abs(px - ax));
        let nh = Math.max(MIN, Math.abs(py - ay));
        if (!free) {
          // Lock to original aspect — pick whichever dimension drives the larger
          // scale-up so the corner tracks the cursor naturally.
          const wRatio = nw / start.w;
          const hRatio = nh / start.h;
          if (wRatio > hRatio) nh = nw / aspect;
          else                 nw = nh * aspect;
        }
        // Re-derive top-left from anchor + new size.
        let nx = (c.key === 'tl' || c.key === 'bl') ? ax - nw : ax;
        let ny = (c.key === 'tl' || c.key === 'tr') ? ay - nh : ay;
        document.setExportFrame?.({
          x: Math.round(nx), y: Math.round(ny),
          w: Math.round(nw), h: Math.round(nh),
        });
      });
      frameUiLayer.add(sq);
      cornerHandles.push({ node: sq, key: c.key });
    }
  }

  function updateFrameNodes(f) {
    const x = f.x ?? 0, y = f.y ?? 0, w = f.w, h = f.h;
    if (dimNode) { dimNode._x = x; dimNode._y = y; dimNode._w = w; dimNode._h = h; }
    if (bracketsNode) { bracketsNode._x = x; bracketsNode._y = y; bracketsNode._w = w; bracketsNode._h = h; }
    if (frameStrokeNode) { frameStrokeNode.position({ x, y }); frameStrokeNode.size({ width: w, height: h }); }
    // Re-position the handles too. Skip the one currently being dragged so we
    // don't fight Konva's drag (its position already matches by construction).
    const s = stage.scaleX() || 1;
    const off = 12 / s;
    const sqHalf = 3.5 / s;
    if (moveHandleRef && !moveHandleRef.isDragging()) {
      moveHandleRef.position({ x: x + w + off, y: y - off });
    }
    for (const ch of cornerHandles) {
      if (ch.node.isDragging()) continue;
      const cx = ch.key === 'tr' || ch.key === 'br' ? x + w : x;
      const cy = ch.key === 'bl' || ch.key === 'br' ? y + h : y;
      ch.node.position({ x: cx - sqHalf, y: cy - sqHalf });
    }
    overlayLayer.batchDraw();
    frameUiLayer.batchDraw();
    syncInfo(f);
  }

  document.subscribe?.((e) => {
    if (e.type === 'doc:exportFrame' || e.type === 'doc:loaded') syncExportFrame();
  });
  // Reposition the info readout after pan/zoom too.
  function repositionInfo() {
    const f = document.state?.exportFrame;
    if (f && f.w > 0 && f.h > 0) positionInfo(f);
  }
  // (the zoom-on-wheel handler is registered later; we hook the rebuild after it
  //  so it reads the post-zoom stage transform — see the second stage.on('wheel'))
  // Live re-render when the dim opacity changes.
  onSettingsChange(() => overlayLayer.batchDraw());

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
  // After the zoom handler above mutates stage transform, rebuild the frame
  // overlay so handle/bracket pixel-sizes stay constant and the info chip
  // stays glued to the bottom-left corner.
  stage.on('wheel', () => {
    if (!dragInProgress) syncExportFrame();
    else repositionInfo();
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
      return;
    }
    // Activate layer immediately on mousedown so selection handles appear
    // even when the user mouse-downs and drags in one motion (no clean click).
    const target = e.target;
    if (target === stage) return;
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
  window.addEventListener('mousemove', (e) => {
    if (!panning || !lastPan) return;
    const dx = e.clientX - lastPan.x;
    const dy = e.clientY - lastPan.y;
    lastPan = { x: e.clientX, y: e.clientY };
    stage.position({ x: stage.x() + dx, y: stage.y() + dy });
    stage.batchDraw();
    repositionInfo();
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
