// canvas-view — Konva stage init, pan/zoom, selection, drop-to-add-image.

import Konva from 'konva';
import { getSettings, onSettingsChange } from './settings-popup.js';
import { getTool, setTool, onToolChange, TOOL_CURSORS } from './vector-tools/active-tool.js';
import { attachShapeDrawer } from './vector-tools/shape-drawer.js';
import { attachPenTool } from './vector-tools/pen-tool.js';
import { attachPencilTool } from './vector-tools/pencil-tool.js';
import { selectOnly, toggleInSelection, addToSelection, clearSelection, getSelection, onSelectionChange } from './selection-state.js';
import { attachMarquee } from './marquee.js';
import { translatePathD } from '../core/vector-renderer.js';

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

  // Tracks the layer the cursor is currently over (in select tool).
  // Drives the grab/grabbing cursor when over a draggable selected layer.
  let hoverLayerId = null;
  // True when the cursor sits inside the bbox of any selected layer —
  // even if an unselected layer is rendered on top of that area. The
  // grab cursor + drag gesture both honour this so the user can pick
  // up a selected layer through an overlapping one.
  let hoverOverSelected = false;

  function syncCursor() {
    if (panning) { container.style.cursor = 'grabbing'; return; }
    if (spaceDown) { container.style.cursor = 'grab'; return; }
    // Active drag of the selection → closed-hand cursor.
    if (pendingGesture && pendingGesture.dragging && pendingGesture.starts.size > 0) {
      container.style.cursor = 'grabbing';
      return;
    }
    // In Select tool, the cursor flips to open-hand when EITHER:
    //   • it's hovering a layer that's part of the current selection, OR
    //   • it's inside the bbox of a selected layer that another layer
    //     happens to overlay (drag-through).
    if (getTool() === 'select'
        && ((hoverLayerId && getSelection().has(hoverLayerId)) || hoverOverSelected)) {
      container.style.cursor = 'grab';
      return;
    }
    container.style.cursor = TOOL_CURSORS[getTool()] || '';
  }
  // Re-sync the cursor whenever the active tool changes.
  onToolChange(() => syncCursor());
  // Re-sync the cursor when the selection changes — a layer just
  // selected at the cursor's position should immediately show the grab
  // affordance without requiring a fresh mousemove.
  onSelectionChange(() => syncCursor());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isEditingText()) {
      spaceDown = true;
      // Per-node draggability is already off (manual gesture model);
      // no need to flip it. Space takes over for pan, so cancel any
      // in-progress marquee + selection drag.
      if (marquee.isActive()) marquee.cancel();
      if (pendingGesture) pendingGesture = null;
      syncCursor();
      e.preventDefault();
    }
    if (e.key === 'Escape' && marquee.isActive()) {
      marquee.cancel();
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
      // Per-node Konva drag is permanently off in the new gesture model
      // (canvas-view's manual handler drives selection drags). So no
      // need to "restore" draggable here — used to flip it back on.
      syncCursor();
    }
  });

  function isEditingText() {
    const ae = window.document.activeElement;
    return !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
  }

  // Shape drawer wires into mousedown/move/up below.
  const shapeDrawer = attachShapeDrawer({
    stage,
    document,
    getStageScale: () => stage.scaleX() || 1,
  });
  const penTool = attachPenTool({ stage, document });
  const pencilTool = attachPencilTool({ stage, document });
  const marquee = attachMarquee({ stage, document });

  // Manual gesture state — replaces Konva's per-node draggable so that
  // mousedown on a layer NEVER auto-changes selection. Selection only
  // updates on a clean click (mousedown + mouseup with no significant
  // movement). Mousedown + drag moves the CURRENTLY SELECTED layers,
  // regardless of which layer the cursor was over at mousedown — so
  // grabbing the overlap region of two layers no longer hijacks the
  // selection to whichever is on top.
  const DRAG_THRESHOLD = 4;        // screen px before "click" becomes "drag"
  let pendingGesture = null;       // { startWorld, hitLayerId, mods, dragging, starts: Map<id, {x, y, node}> }
  // Group click-through drill state — Figma-style. Repeated clicks on
  // the same leaf walk one level deeper through the parent-group chain
  // (outermost group → … → leaf). Reset on click elsewhere.
  let clickDrill = null;           // { leafId, depth }

  // Build [outermost group, …, parent, leaf] from a leaf layer ID by
  // walking parentGroupId. Used by the click-through drill.
  function ancestorChain(leafId) {
    const chain = [];
    let cur = document.findLayer(leafId);
    while (cur) {
      chain.unshift(cur.id);
      cur = cur.parentGroupId ? document.findLayer(cur.parentGroupId) : null;
    }
    return chain;
  }

  function findLayerIdUnder(target) {
    let node = target;
    while (node && node !== stage) {
      const nid = node.id?.();
      if (nid && document.findLayer(nid)) return nid;
      node = node.getParent && node.getParent();
    }
    return null;
  }

  function snapshotSelectionPositions() {
    const map = new Map();
    for (const id of getSelection()) {
      const layer = document.findLayer(id);
      if (!layer || layer.type === 'fx' || layer.locked) continue;
      const node = stage.findOne((n) => n.id?.() === id);
      if (!node) continue;
      map.set(id, { x: node.x(), y: node.y(), node });
    }
    return map;
  }

  // True when world `pt` lies geometrically inside the bbox of ANY
  // currently-selected layer. Used so a mousedown over an OVERLAPPING
  // unselected layer still triggers a drag of the selection underneath
  // — Konva's hit-test would otherwise hand us the top-most layer.
  function cursorInsideAnySelected(pt) {
    for (const id of getSelection()) {
      const layer = document.findLayer(id);
      if (!layer || layer.type === 'fx' || layer.locked) continue;
      const node = stage.findOne((n) => n.id?.() === id);
      if (!node) continue;
      const r = node.getClientRect({ relativeTo: contentLayer });
      if (!r || !(r.width > 0) || !(r.height > 0)) continue;
      if (pt.x >= r.x && pt.x <= r.x + r.width && pt.y >= r.y && pt.y <= r.y + r.height) {
        return true;
      }
    }
    return false;
  }

  stage.on('mousedown touchstart', (e) => {
    if (spaceDown || e.evt.button === 1) {
      panning = true;
      lastPan = { x: e.evt.clientX ?? e.evt.touches?.[0]?.clientX, y: e.evt.clientY ?? e.evt.touches?.[0]?.clientY };
      syncCursor();
      e.evt.preventDefault();
      return;
    }
    // Active vector tool? Hand off to its drawer.
    const tool = getTool();
    if (tool.startsWith('shape:')) {
      if (shapeDrawer.start(e)) { e.evt.preventDefault(); return; }
    } else if (tool === 'pen') {
      if (penTool.start(e)) { e.evt.preventDefault(); return; }
    } else if (tool === 'pencil') {
      if (pencilTool.start(e)) { e.evt.preventDefault(); return; }
    }
    if (tool !== 'select') return;
    const target = e.target;
    if (target === stage) {
      // Empty-stage mousedown → marquee. Modifier-less drag clears
      // multi-selection on commit (the marquee module handles that).
      // Reset the group-drill state — clicking outside breaks the
      // "drill deeper" sequence.
      clickDrill = null;
      if (marquee.start(e)) {
        if (!e.evt.shiftKey && !e.evt.metaKey && !e.evt.ctrlKey) {
          if (getSelection().size > 1) clearSelection();
        }
        e.evt.preventDefault();
      }
      return;
    }
    // Cursor over a layer: capture intent. STRICT click-first rule —
    // selection NEVER changes on mousedown. The decision is made on
    // mouseup: clean release → click → selection logic; movement past
    // threshold → drag (only if the hit layer is already selected).
    const hitLayerId = findLayerIdUnder(target);
    if (!hitLayerId) return;
    const sc = stage.scaleX() || 1;
    const stagePos = stage.getPointerPosition();
    if (!stagePos) return;
    const startWorld = { x: (stagePos.x - stage.x()) / sc, y: (stagePos.y - stage.y()) / sc };
    // Snapshot drag targets when:
    //   • the hit layer is part of the current selection, OR
    //   • the cursor is geometrically inside ANY selected layer's bbox
    //     (drag-through-overlapping-layer — the user grabs over a non-
    //     selected layer that happens to cover their selected one).
    // Otherwise `starts` stays empty: the gesture is alive only for
    // click-vs-drag classification on mouseup.
    const inSelectedBbox = getSelection().has(hitLayerId) || cursorInsideAnySelected(startWorld);
    const starts = inSelectedBbox ? snapshotSelectionPositions() : new Map();
    pendingGesture = {
      startWorld,
      hitLayerId,
      modShift: e.evt.shiftKey,
      modMeta: e.evt.metaKey || e.evt.ctrlKey,
      dragging: false,
      starts,
    };
    e.evt.preventDefault();
  });
  stage.on('mousemove touchmove', (e) => {
    shapeDrawer.move(e);
    penTool.move(e);
    pencilTool.move(e);
    if (marquee.isActive()) marquee.move(e);
    // Track which layer is under the cursor → drives grab/default cursor
    // affordance via syncCursor(). Skip while panning / mid-drag (those
    // already own the cursor state). Also recompute whether the cursor
    // sits inside any selected layer's bbox so the grab affordance
    // shows even through overlapping unselected layers.
    if (getTool() === 'select' && !panning && !spaceDown) {
      const next = e.target === stage ? null : findLayerIdUnder(e.target);
      const sc = stage.scaleX() || 1;
      const sp = stage.getPointerPosition();
      const world = sp ? { x: (sp.x - stage.x()) / sc, y: (sp.y - stage.y()) / sc } : null;
      const overSel = world ? cursorInsideAnySelected(world) : false;
      if (next !== hoverLayerId || overSel !== hoverOverSelected) {
        hoverLayerId = next;
        hoverOverSelected = overSel;
        syncCursor();
      }
    }
    // Manual drag of the current selection. Only moves Konva nodes if
    // the gesture's `starts` map is non-empty — i.e. the user
    // mousedowned on a layer that's part of the selection. Otherwise
    // we still flip `dragging` past threshold (so mouseup classifies
    // it as a non-click) but no nodes move.
    if (pendingGesture) {
      const sc = stage.scaleX() || 1;
      const stagePos = stage.getPointerPosition();
      if (!stagePos) return;
      const cur = { x: (stagePos.x - stage.x()) / sc, y: (stagePos.y - stage.y()) / sc };
      const dx = cur.x - pendingGesture.startWorld.x;
      const dy = cur.y - pendingGesture.startWorld.y;
      if (!pendingGesture.dragging) {
        if (Math.hypot(dx * sc, dy * sc) < DRAG_THRESHOLD) return;
        pendingGesture.dragging = true;
        // Drag just started — flip cursor to grabbing.
        syncCursor();
      }
      if (pendingGesture.starts.size === 0) return;
      // Apply the same delta to every captured layer's Konva.Group.
      for (const [, info] of pendingGesture.starts) {
        info.node.position({ x: info.x + dx, y: info.y + dy });
      }
      const r = window.__slammer?.renderer;
      r?.redrawSelectionOutlines?.();
      r?.scheduleLiveFxRecompute?.();
    }
  });
  stage.on('mouseup touchend', () => {
    shapeDrawer.end();
    penTool.up();
    pencilTool.end();
    if (marquee.isActive()) marquee.end();
    if (pendingGesture) {
      if (pendingGesture.dragging) {
        // Commit each moved layer's transform. Vector layers also need
        // their path d-coords baked by the drag delta — same convention
        // as the existing single-layer drag handler.
        for (const [id, info] of pendingGesture.starts) {
          const layer = document.findLayer(id);
          if (!layer) continue;
          const node = info.node;
          if (layer.type === 'vector') {
            const dx = node.x() - layer.transform.x;
            const dy = node.y() - layer.transform.y;
            if (dx !== 0 || dy !== 0) {
              const newPaths = layer.vector.paths.map((rec) => ({
                ...rec,
                d: translatePathD(rec.d, dx, dy),
              }));
              document.setLayerTransform(id, {
                x: node.x(), y: node.y(),
                scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation(),
              });
              document.setVectorPaths(id, newPaths);
              continue;
            }
          }
          document.setLayerTransform(id, {
            x: node.x(), y: node.y(),
            scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation(),
          });
        }
      } else {
        // Clean click — change selection based on modifiers + the layer
        // under the cursor at mousedown time.
        const leafId = pendingGesture.hitLayerId;
        if (pendingGesture.modMeta) {
          toggleInSelection(leafId);
          clickDrill = null;
        } else if (pendingGesture.modShift) {
          addToSelection(leafId);
          clickDrill = null;
        } else {
          // Plain click → group drill. 1st click on a leaf inside a
          // group selects the OUTERMOST ancestor; consecutive clicks
          // on the same leaf step one level deeper each time.
          const chain = ancestorChain(leafId);
          let depth = 0;
          if (clickDrill && clickDrill.leafId === leafId) {
            depth = Math.min(clickDrill.depth + 1, chain.length - 1);
          }
          clickDrill = { leafId, depth };
          const targetId = chain[depth] || leafId;
          selectOnly(targetId);
          if (document.activeLayerId !== targetId) document.setActiveLayer(targetId);
        }
      }
      pendingGesture = null;
      // Restore the cursor (grab / tool default) now that the gesture
      // has ended.
      syncCursor();
    }
  });
  // Pointer leaves the container while pencil is mid-stroke → auto-commit
  // the stroke (avoids dangling state if the user's mouse exits the canvas).
  container.addEventListener('pointerleave', () => {
    if (pencilTool.isDrawing()) pencilTool.end();
    // Drop the grab cursor as soon as the pointer leaves the canvas.
    if (hoverLayerId || hoverOverSelected) {
      hoverLayerId = null;
      hoverOverSelected = false;
      syncCursor();
    }
  });
  // Esc cancels in-progress shape draw.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') shapeDrawer.cancel();
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
    // If a drag of the selection ends outside the stage, the stage's
    // own mouseup listener won't fire — commit the gesture here as a
    // fallback. Without this, the user releases the mouse off-canvas
    // and selected layers are stuck mid-drag.
    if (pendingGesture && pendingGesture.dragging) {
      for (const [id, info] of pendingGesture.starts) {
        const layer = document.findLayer(id);
        if (!layer) continue;
        const node = info.node;
        if (layer.type === 'vector') {
          const dx = node.x() - layer.transform.x;
          const dy = node.y() - layer.transform.y;
          if (dx !== 0 || dy !== 0) {
            const newPaths = layer.vector.paths.map((rec) => ({
              ...rec,
              d: translatePathD(rec.d, dx, dy),
            }));
            document.setLayerTransform(id, {
              x: node.x(), y: node.y(),
              scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation(),
            });
            document.setVectorPaths(id, newPaths);
            continue;
          }
        }
        document.setLayerTransform(id, {
          x: node.x(), y: node.y(),
          scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation(),
        });
      }
      pendingGesture = null;
    } else if (pendingGesture) {
      // Mouseup outside stage with no drag → discard the gesture so a
      // stray click on a non-stage element doesn't change selection.
      pendingGesture = null;
      // Restore the cursor (grab / tool default) now that the gesture
      // has ended.
      syncCursor();
    }
  });

  // ---------- Double-click text → edit inline on canvas ----------
  stage.on('dblclick dbltap', (e) => {
    if (panning || spaceDown) return;
    let node = e.target;
    while (node && node !== stage) {
      const id = node.id?.();
      const layer = id && document.findLayer(id);
      if (layer && layer.type === 'text') {
        openInlineTextEditor(layer);
        return;
      }
      if (layer && layer.type === 'vector') {
        // Activate the layer and switch to Direct Selection — anchors,
        // handles + dashed outline appear so the user can edit the path
        // without hunting for the toolbar button.
        if (document.activeLayerId !== layer.id) document.setActiveLayer(layer.id);
        setTool('directSelect');
        return;
      }
      node = node.getParent && node.getParent();
    }
  });

  let activeInlineEditor = null;
  function openInlineTextEditor(layer) {
    closeInlineTextEditor();
    const t = layer.text;
    // Find the layer's group on stage to derive screen-space rect.
    const group = stage.findOne((n) => n.id?.() === layer.id);
    if (!group) return;
    // getClientRect() with default skipTransform:false returns the absolute
    // rect after ALL transforms — including stage scale + position. The
    // canvas-text-editor is appended to the same container as the stage
    // canvas, so these coordinates map 1:1 to the container's local space.
    // (Earlier code multiplied by stage scale + added stage position, which
    // double-counted the stage transform and threw the editor off-screen.)
    const rect = group.getClientRect({ skipTransform: false });
    const sc = stage.scaleX() || 1;
    const sx = rect.x;
    const sy = rect.y;
    const sw = Math.max(120, rect.width);
    const sh = Math.max(40, rect.height);

    // Use a contenteditable <div> instead of a <textarea> so the editor
    // auto-sizes to content (no padding-induced wrap, no fixed width).
    const ed = window.document.createElement('div');
    ed.className = 'canvas-text-editor';
    ed.contentEditable = 'plaintext-only';
    ed.spellcheck = false;
    // Multi-line: convert \n in the model to <br> on display, and the inverse
    // when reading back. plaintext-only keeps Enter producing \n on read.
    ed.textContent = t.value;
    ed.style.left = `${sx}px`;
    ed.style.top = `${sy}px`;
    // Match the rasterised text styling so the editor sits over the glyphs.
    const cssFamily = t.font;
    ed.style.fontFamily = `"${cssFamily}", system-ui, sans-serif`;
    ed.style.fontSize = `${(t.size || 96) * sc}px`;
    ed.style.fontWeight = `${(t.variation?.wght != null ? t.variation.wght : t.weight) || 400}`;
    ed.style.color = t.color || '#fff';
    ed.style.textAlign = (t.align === 'justify' ? 'left' : t.align) || 'left';
    ed.style.lineHeight = `${t.lineHeight ?? 1.2}`;
    // Canvas adds letterSpacing in raw pixels per glyph; mirror that in CSS
    // (scaled by stage zoom so the editor box matches the rendered text).
    const lsCss = (t.letterSpacing || 0) * sc;
    ed.style.letterSpacing = `${lsCss}px`;
    // The canvas rasteriser also adds one tracking step AFTER the last glyph
    // (so the visible line is one ls wider than CSS would render). Add the
    // matching padding so the editor box ends where the text actually ends.
    if (lsCss > 0) ed.style.paddingRight = `${lsCss}px`;
    else if (lsCss < 0) ed.style.paddingLeft = `${-lsCss}px`;
    ed.style.textTransform = t.transform && t.transform !== 'none' ? t.transform : 'none';
    // textBox mode wraps to box width; plain text mode flows on one line per paragraph.
    if ((t.mode || 'text') === 'textBox') {
      ed.style.width = `${(t.boxWidth || sw) * sc}px`;
      ed.style.whiteSpace = 'pre-wrap';
    } else {
      ed.style.whiteSpace = 'pre';
    }
    // Editor's text is invisible — the canvas-rendered text shows through
    // as the user types. This avoids the few-pixel baseline mismatch between
    // browser line-box metrics and ctx.fillText baseline placement (which
    // would make the text "jump" when the editor opens). The browser still
    // draws the caret + selection highlight.
    ed.style.color = 'transparent';
    container.appendChild(ed);
    ed.focus();
    // Place caret at end (designers usually want to append, not retype).
    const sel = window.getSelection();
    const range = window.document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // Keep the canvas text visible — it's the source of truth for visual
    // position. Re-rasterising on each keystroke shows the user their edit.

    const onInput = () => document.setTextProp(layer.id, 'value', ed.innerText);
    const onBlur = () => closeInlineTextEditor();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeInlineTextEditor(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); closeInlineTextEditor(); }
    };
    ed.addEventListener('input', onInput);
    ed.addEventListener('blur', onBlur);
    ed.addEventListener('keydown', onKey);
    activeInlineEditor = { ed, group, layer, onInput, onBlur, onKey };
  }
  function closeInlineTextEditor() {
    if (!activeInlineEditor) return;
    const { ed, onBlur } = activeInlineEditor;
    ed.removeEventListener('blur', onBlur);
    ed.remove();
    activeInlineEditor = null;
  }

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
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) {
      // No file — try a URL drop (e.g. a Pexels / Unsplash card dragged from
      // a plugin window onto the canvas). text/uri-list is the standard
      // mime; text/plain is a common fallback. Fetch → Blob → reuse the
      // existing onImageDropped pipeline.
      const uri = (e.dataTransfer?.getData('text/uri-list') || '')
        .split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
        || (e.dataTransfer?.getData('text/plain') || '').trim();
      if (uri && /^https?:\/\//i.test(uri)) {
        try {
          const res = await fetch(uri, { referrerPolicy: 'no-referrer' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) throw new Error(`Not an image (${blob.type || 'unknown'})`);
          const filename = uri.split('/').pop()?.split('?')[0] || 'image';
          onImageDropped?.(new File([blob], filename, { type: blob.type }));
        } catch (err) {
          console.warn('[canvas-view] URL drop failed', err);
        }
      }
      return;
    }
    for (const f of files) {
      // SVG → vector layer (Phase 13a). image/svg+xml MIME OR .svg extension.
      if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) {
        try {
          const { importSvgFile } = await import('./vector-tools/svg-import.js');
          await importSvgFile(f, document);
        } catch (err) {
          console.warn('[svg] import failed', err);
        }
        continue;
      }
      if (f.type.startsWith('image/')) onImageDropped?.(f);
    }
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
