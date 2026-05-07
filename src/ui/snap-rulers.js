// snap-rulers.js — snap math, ruler rendering, guideline state, indicator lines.
// Exports initSnapRulers({ stage, container, document, getSettings })
// Returns { destroy, computeSnapForRect, showIndicators, hideIndicators, updateRulers }

const RULER_SIZE = 24; // px — width of left ruler / height of top ruler
const SNAP_TOLERANCE_PX = 6; // screen-px tolerance

// ─── Guideline model helpers ────────────────────────────────────────────────

function getGuidelines(doc) {
  return Array.isArray(doc.state?.guidelines) ? doc.state.guidelines : [];
}

// ─── Snap math ──────────────────────────────────────────────────────────────

/**
 * Gather all candidate snap positions for a given axis from visible layers,
 * guidelines, and the export frame.
 *
 * @param {'x'|'y'} axis
 * @param {object}  stage  — Konva stage
 * @param {object}  doc    — slammer document
 * @param {string|null} excludeLayerId
 * @returns {Array<{pos:number, src:string}>}
 */
function gatherCandidates(axis, stage, doc, excludeLayerId, contentLayer) {
  const candidates = [];
  if (!contentLayer) contentLayer = stage.getLayers()[1];

  // Other visible layers.
  const layerGroups = stage.find('.slammer-layer').filter((g) => g.visible());
  for (const g of layerGroups) {
    const id = g.id?.();
    if (id && id === excludeLayerId) continue;
    const r = g.getClientRect({ relativeTo: contentLayer });
    if (!r || !(r.width > 0) || !(r.height > 0)) continue;
    if (axis === 'x') {
      candidates.push({ pos: r.x, src: `layer:${id}:left` });
      candidates.push({ pos: r.x + r.width / 2, src: `layer:${id}:hcenter` });
      candidates.push({ pos: r.x + r.width, src: `layer:${id}:right` });
    } else {
      candidates.push({ pos: r.y, src: `layer:${id}:top` });
      candidates.push({ pos: r.y + r.height / 2, src: `layer:${id}:vcenter` });
      candidates.push({ pos: r.y + r.height, src: `layer:${id}:bottom` });
    }
  }

  // Guidelines.
  const guidelines = getGuidelines(doc);
  for (const g of guidelines) {
    if (g.axis === 'v' && axis === 'x') candidates.push({ pos: g.pos, src: 'guideline' });
    if (g.axis === 'h' && axis === 'y') candidates.push({ pos: g.pos, src: 'guideline' });
  }

  // Export frame.
  const f = doc.state?.exportFrame;
  if (f && f.w > 0 && f.h > 0) {
    const fx = f.x ?? 0, fy = f.y ?? 0;
    if (axis === 'x') {
      candidates.push({ pos: fx, src: 'frame:left' });
      candidates.push({ pos: fx + f.w / 2, src: 'frame:hcenter' });
      candidates.push({ pos: fx + f.w, src: 'frame:right' });
    } else {
      candidates.push({ pos: fy, src: 'frame:top' });
      candidates.push({ pos: fy + f.h / 2, src: 'frame:vcenter' });
      candidates.push({ pos: fy + f.h, src: 'frame:bottom' });
    }
  }

  return candidates;
}

/**
 * Find the best snap for a set of reference points against candidates.
 * All positions are in CONTENT-LAYER (world) space.
 *
 * @param {number[]} refs        — [left, center, right] or [top, vcenter, bottom]
 * @param {Array}    candidates  — [{pos, src}]
 * @param {number}   tolWorld    — tolerance in world units
 * @returns {{delta:number, snapPos:number, refPos:number, src:string}|null}
 */
function bestSnap(refs, candidates, tolWorld) {
  let best = null;
  for (const ref of refs) {
    for (const c of candidates) {
      const dist = Math.abs(ref - c.pos);
      if (dist <= tolWorld) {
        if (!best || dist < Math.abs(best.refPos - best.snapPos)) {
          best = { delta: c.pos - ref, snapPos: c.pos, refPos: ref, src: c.src };
        }
      }
    }
  }
  return best;
}

/**
 * Compute snap delta for a moving rect.
 * rect is in CONTENT-LAYER (world) space: { x, y, width, height }
 * Returns { dx, dy, snaps: [{axis, snapPos, refPos, src}] }
 */
export function computeSnapForRect(rect, excludeLayerId, stage, doc, contentLayer) {
  const sc = stage.scaleX() || 1;
  const tolWorld = SNAP_TOLERANCE_PX / sc;

  const xRefs = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  const yRefs = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];

  const xCandidates = gatherCandidates('x', stage, doc, excludeLayerId, contentLayer);
  const yCandidates = gatherCandidates('y', stage, doc, excludeLayerId, contentLayer);

  const xSnap = bestSnap(xRefs, xCandidates, tolWorld);
  const ySnap = bestSnap(yRefs, yCandidates, tolWorld);

  const dx = xSnap ? xSnap.delta : 0;
  const dy = ySnap ? ySnap.delta : 0;
  const snaps = [];
  if (xSnap) snaps.push({ axis: 'x', snapPos: xSnap.snapPos, refPos: xSnap.refPos, src: xSnap.src });
  if (ySnap) snaps.push({ axis: 'y', snapPos: ySnap.snapPos, refPos: ySnap.refPos, src: ySnap.src });

  return { dx, dy, snaps };
}

/**
 * Snap a guideline being dragged to nearby layer edges / frame edges /
 * other guidelines. Returns the (possibly snapped) world-space pos.
 * `axis` is the GUIDELINE axis: 'h' (horizontal guideline → snaps along Y)
 * or 'v' (vertical guideline → snaps along X).
 */
export function snapGuidelinePos(axis, pos, doc, stage, contentLayer, ignoreId = null) {
  const sc = stage.scaleX() || 1;
  const tolWorld = SNAP_TOLERANCE_PX / sc;
  // A horizontal guideline is a candidate Y line, so it should snap to other
  // Y candidates. A vertical guideline → X candidates.
  const candAxis = axis === 'h' ? 'y' : 'x';
  const candidates = gatherCandidates(candAxis, stage, doc, null, contentLayer);
  // Drop self when re-dragging an existing guideline by id.
  let best = null;
  for (const c of candidates) {
    // Skip OUR own guideline candidate to avoid snapping to ourselves.
    if (ignoreId != null && c.src === 'guideline') {
      // gatherCandidates doesn't tag guideline candidates with ids today;
      // skip the closest match to our own pos to prevent self-snap.
      if (Math.abs(c.pos - pos) < 0.0001) continue;
    }
    const d = Math.abs(c.pos - pos);
    if (d <= tolWorld && (!best || d < best.dist)) best = { pos: c.pos, dist: d };
  }
  return best ? best.pos : pos;
}

/**
 * Snap a transformer scale gesture by adjusting the new bbox so the
 * dragged edge(s) align with nearby layer / frame / guideline candidates.
 *
 * Konva's transformer calls boundBoxFunc(oldBox, newBox) during scale —
 * the active anchor name tells us which edges are moving.
 *
 * Returns a (possibly adjusted) box in the same shape as newBox:
 *   { x, y, width, height, rotation }.
 *
 * The fixed (non-dragged) edge stays put — only the dragged edge snaps.
 */
export function computeBoxScaleSnap(anchor, oldBox, newBox, doc, stage, contentLayer, excludeLayerId = null) {
  if (!anchor || anchor === 'rotater') return newBox;
  const out = { ...newBox };
  const sc = stage.scaleX() || 1;
  const tolWorld = SNAP_TOLERANCE_PX / sc;
  const movingX = anchor.includes('left') ? 'left' : anchor.includes('right') ? 'right' : null;
  const movingY = anchor.includes('top')  ? 'top'  : anchor.includes('bottom') ? 'bottom' : null;

  function pickClosest(candidates, refPos) {
    let best = null;
    for (const c of candidates) {
      const d = Math.abs(c.pos - refPos);
      if (d <= tolWorld && (!best || d < best.dist)) best = { pos: c.pos, dist: d };
    }
    return best;
  }

  if (movingX) {
    const xCands = gatherCandidates('x', stage, doc, excludeLayerId, contentLayer);
    if (movingX === 'left') {
      const fixedRight = out.x + out.width;
      const snap = pickClosest(xCands, out.x);
      if (snap) {
        out.x = snap.pos;
        out.width = Math.max(1, fixedRight - snap.pos);
      }
    } else {
      const right = out.x + out.width;
      const snap = pickClosest(xCands, right);
      if (snap) {
        out.width = Math.max(1, snap.pos - out.x);
      }
    }
  }

  if (movingY) {
    const yCands = gatherCandidates('y', stage, doc, excludeLayerId, contentLayer);
    if (movingY === 'top') {
      const fixedBottom = out.y + out.height;
      const snap = pickClosest(yCands, out.y);
      if (snap) {
        out.y = snap.pos;
        out.height = Math.max(1, fixedBottom - snap.pos);
      }
    } else {
      const bottom = out.y + out.height;
      const snap = pickClosest(yCands, bottom);
      if (snap) {
        out.height = Math.max(1, snap.pos - out.y);
      }
    }
  }

  return out;
}

// ─── Ruler rendering ─────────────────────────────────────────────────────────

function drawRuler(canvas, axis, stage) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background.
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#1a1a1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sc = stage.scaleX() || 1;
  const stagePos = stage.position();
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#888';

  // Determine the pixel range visible on screen.
  // For x-axis ruler: screen range is [0, w] → world range
  // For y-axis ruler: screen range is [0, h] → world range

  function screenToWorld(screenCoord) {
    return axis === 'x'
      ? (screenCoord - stagePos.x) / sc
      : (screenCoord - stagePos.y) / sc;
  }

  // Adaptive tick spacing: find a "nice" world step so ticks don't crowd.
  // Minor tick every 10px world, medium every 50px, major every 100px.
  // At high zoom (sc > 4) we can use 5px world minor; at low zoom we skip
  // to 25 or 50px minor.
  let minorStep = 10, mediumStep = 50, majorStep = 100;
  if (sc < 0.3) { minorStep = 100; mediumStep = 200; majorStep = 500; }
  else if (sc < 0.7) { minorStep = 50; mediumStep = 100; majorStep = 500; }
  else if (sc < 1.5) { minorStep = 10; mediumStep = 50; majorStep = 100; }
  else if (sc < 4) { minorStep = 5; mediumStep = 25; majorStep = 100; }
  else { minorStep = 1; mediumStep = 5; majorStep = 10; }

  const rulerLength = axis === 'x' ? w : h;
  const worldStart = screenToWorld(0);
  const worldEnd = screenToWorld(rulerLength);

  const firstTick = Math.ceil(worldStart / minorStep) * minorStep;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = textColor;
  ctx.fillStyle = textColor;
  ctx.font = `9px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';

  const RULER_PX = axis === 'x' ? h : w; // thickness of ruler in screen px

  for (let wpos = firstTick; wpos <= worldEnd; wpos += minorStep) {
    const isMajor = wpos % majorStep === 0;
    const isMedium = !isMajor && wpos % mediumStep === 0;
    const screenPos = axis === 'x'
      ? stagePos.x + wpos * sc
      : stagePos.y + wpos * sc;

    // Tick height in screen px.
    const tickH = isMajor ? RULER_PX * 0.65 : (isMedium ? RULER_PX * 0.45 : RULER_PX * 0.3);

    ctx.beginPath();
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = isMajor ? 0.7 : (isMedium ? 0.5 : 0.3);

    if (axis === 'x') {
      ctx.moveTo(screenPos, RULER_PX);
      ctx.lineTo(screenPos, RULER_PX - tickH);
    } else {
      ctx.moveTo(RULER_PX, screenPos);
      ctx.lineTo(RULER_PX - tickH, screenPos);
    }
    ctx.stroke();

    if (isMajor) {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = textColor;
      const label = String(Math.round(wpos));
      if (axis === 'x') {
        ctx.fillText(label, screenPos + 2, 2);
      } else {
        ctx.save();
        ctx.translate(RULER_PX - 2, screenPos - 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }

  // Accent hairline along the edge that faces the canvas.
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = primary;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (axis === 'x') { ctx.moveTo(0, RULER_PX); ctx.lineTo(w, RULER_PX); }
  else               { ctx.moveTo(RULER_PX, 0); ctx.lineTo(RULER_PX, h); }
  ctx.stroke();

  ctx.restore();
}

// ─── Main init ───────────────────────────────────────────────────────────────

export function initSnapRulers({ stage, container, document: doc, getSettings, contentLayer: _contentLayer }) {
  // contentLayer may be passed explicitly or fall back to getLayers()[1].
  const _cl = _contentLayer || null;
  // ── Snap indicator lines (HTML canvas overlay) ──────────────────────────
  const indicatorCanvas = window.document.createElement('canvas');
  indicatorCanvas.className = 'snap-indicator-canvas';
  indicatorCanvas.style.cssText = `
    position:absolute;inset:0;width:100%;height:100%;
    pointer-events:none;z-index:20;
  `;
  container.appendChild(indicatorCanvas);

  function resizeIndicator() {
    const dpr = window.devicePixelRatio || 1;
    indicatorCanvas.width = container.clientWidth * dpr;
    indicatorCanvas.height = container.clientHeight * dpr;
    indicatorCanvas.style.width = container.clientWidth + 'px';
    indicatorCanvas.style.height = container.clientHeight + 'px';
  }
  resizeIndicator();

  // ── Ruler canvases ───────────────────────────────────────────────────────
  const topRulerCanvas = window.document.createElement('canvas');
  topRulerCanvas.className = 'ruler ruler--top';
  container.appendChild(topRulerCanvas);

  const leftRulerCanvas = window.document.createElement('canvas');
  leftRulerCanvas.className = 'ruler ruler--left';
  container.appendChild(leftRulerCanvas);

  // Corner fill for the top-left intersection of the two rulers.
  const cornerDiv = window.document.createElement('div');
  cornerDiv.className = 'ruler-corner';
  container.appendChild(cornerDiv);

  function resizeRulers() {
    const dpr = window.devicePixelRatio || 1;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    topRulerCanvas.width  = cw * dpr;
    topRulerCanvas.height = RULER_SIZE * dpr;
    topRulerCanvas.style.width  = cw + 'px';
    topRulerCanvas.style.height = RULER_SIZE + 'px';
    leftRulerCanvas.width  = RULER_SIZE * dpr;
    leftRulerCanvas.height = ch * dpr;
    leftRulerCanvas.style.width  = RULER_SIZE + 'px';
    leftRulerCanvas.style.height = ch + 'px';
  }

  function updateRulers() {
    if (!getSettings().rulersEnabled) return;
    drawRuler(topRulerCanvas, 'x', stage);
    drawRuler(leftRulerCanvas, 'y', stage);
  }

  function applyRulerVisibility() {
    const on = getSettings().rulersEnabled;
    topRulerCanvas.hidden  = !on;
    leftRulerCanvas.hidden = !on;
    cornerDiv.hidden       = !on;
    container.classList.toggle('rulers-visible', on);
    if (on) { resizeRulers(); updateRulers(); }
  }

  // ── Guideline drag from ruler ─────────────────────────────────────────────
  let guideDrag = null; // { axis, worldPos }

  // Build the set of guideline DOM nodes (hairlines over the canvas).
  const guidelineEls = new Map(); // id → { el, data:{axis,pos} }
  let nextGuideId = 0;

  function syncGuidelineEls() {
    const guidelines = getGuidelines(doc);
    // Remove stale.
    for (const [id, { el }] of guidelineEls) {
      if (!guidelines.find((g) => g._id === id)) {
        el.remove();
        guidelineEls.delete(id);
      }
    }
    // Add missing.
    for (const g of guidelines) {
      if (!guidelineEls.has(g._id)) {
        const el = createGuidelineEl(g);
        guidelineEls.set(g._id, { el, data: g });
      }
    }
    // Update positions.
    for (const [, { el, data }] of guidelineEls) {
      positionGuidelineEl(el, data);
    }
  }

  function positionGuidelineEl(el, g) {
    const sc = stage.scaleX() || 1;
    const sp = stage.position();
    const rulersOn = getSettings().rulersEnabled;
    const offset = rulersOn ? RULER_SIZE : 0;
    if (g.axis === 'h') {
      const screenY = sp.y + g.pos * sc;
      el.style.top = screenY + 'px';
      el.style.left = offset + 'px';
    } else {
      const screenX = sp.x + g.pos * sc;
      el.style.left = screenX + 'px';
      el.style.top = offset + 'px';
    }
  }

  function createGuidelineEl(g) {
    const el = window.document.createElement('div');
    el.className = `guideline guideline--${g.axis === 'h' ? 'horizontal' : 'vertical'}`;
    container.appendChild(el);
    positionGuidelineEl(el, g);

    // Drag to move or delete.
    let dragStart = null;
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragStart = { x: e.clientX, y: e.clientY };
      el.classList.add('guideline--dragging');
    });
    window.addEventListener('mousemove', (ev) => {
      if (!dragStart) return;
      const containerRect = container.getBoundingClientRect();
      const relX = ev.clientX - containerRect.left;
      const relY = ev.clientY - containerRect.top;
      const sc = stage.scaleX() || 1;
      const sp = stage.position();
      let raw;
      if (g.axis === 'h') raw = (relY - sp.y) / sc;
      else                raw = (relX - sp.x) / sc;
      // Snap to nearby element edges + frame edges + other guidelines (Alt to escape).
      const snapOn = getSettings().snapEnabled !== false && !ev.altKey;
      g.pos = snapOn ? snapGuidelinePos(g.axis, raw, doc, stage, _cl, g._id) : raw;
      positionGuidelineEl(el, g);
    });
    window.addEventListener('mouseup', (ev) => {
      if (!dragStart) return;
      el.classList.remove('guideline--dragging');
      dragStart = null;
      const containerRect = container.getBoundingClientRect();
      const relX = ev.clientX - containerRect.left;
      const relY = ev.clientY - containerRect.top;
      const rulersOn = getSettings().rulersEnabled;
      const rulerSize = rulersOn ? RULER_SIZE : 0;
      // Dropped onto the ruler — delete.
      const onTopRuler    = relY < rulerSize;
      const onLeftRuler   = relX < rulerSize;
      const shouldDelete  = (g.axis === 'h' && onTopRuler) || (g.axis === 'v' && onLeftRuler);

      const current = getGuidelines(doc);
      if (shouldDelete) {
        doc.setGuidelines(current.filter((gl) => gl._id !== g._id));
      } else {
        // Commit the updated pos.
        doc.setGuidelines(current.map((gl) => gl._id === g._id ? { ...gl, pos: g.pos } : gl));
      }
    });

    return el;
  }

  // Drag from ruler to create a new guideline.
  function onRulerMouseDown(e, axis) {
    if (e.button !== 0) return;
    if (!getSettings().rulersEnabled) return;
    const containerRect = container.getBoundingClientRect();
    guideDrag = { axis };
    const ghost = window.document.createElement('div');
    ghost.className = `guideline guideline--${axis === 'h' ? 'horizontal' : 'vertical'} guideline--ghost`;
    container.appendChild(ghost);

    function moveGhost(ev) {
      const relX = ev.clientX - containerRect.left;
      const relY = ev.clientY - containerRect.top;
      const sc = stage.scaleX() || 1;
      const sp = stage.position();
      const rulersOn = getSettings().rulersEnabled;
      const offset = rulersOn ? RULER_SIZE : 0;
      const snapOn = getSettings().snapEnabled !== false && !ev.altKey;
      if (axis === 'h') {
        const rawWorld = (relY - sp.y) / sc;
        const worldPos = snapOn ? snapGuidelinePos('h', rawWorld, doc, stage, _cl) : rawWorld;
        // Re-derive screen Y from the (possibly snapped) world pos so the ghost
        // visually anchors to the snap point.
        const screenY = sp.y + worldPos * sc;
        ghost.style.top = screenY + 'px';
        ghost.style.left = offset + 'px';
        guideDrag.worldPos = worldPos;
      } else {
        const rawWorld = (relX - sp.x) / sc;
        const worldPos = snapOn ? snapGuidelinePos('v', rawWorld, doc, stage, _cl) : rawWorld;
        const screenX = sp.x + worldPos * sc;
        ghost.style.left = screenX + 'px';
        ghost.style.top = offset + 'px';
        guideDrag.worldPos = worldPos;
      }
    }

    function commitGhost(ev) {
      ghost.remove();
      const relX = ev.clientX - containerRect.left;
      const relY = ev.clientY - containerRect.top;
      // Lower threshold than the full ruler width — 4 px is enough to confirm
      // intent. The previous 24-px gate (== RULER_SIZE) made guideline creation
      // feel unreliable: short drops inside the ruler band silently dropped.
      const COMMIT_THRESHOLD = 4;
      const dragged = axis === 'h' ? relY > COMMIT_THRESHOLD : relX > COMMIT_THRESHOLD;
      if (dragged && guideDrag?.worldPos !== undefined) {
        const id = ++nextGuideId;
        const newG = { axis, pos: guideDrag.worldPos, _id: id };
        const current = getGuidelines(doc);
        doc.setGuidelines([...current, newG]);
      }
      guideDrag = null;
      window.removeEventListener('mousemove', moveGhost);
      window.removeEventListener('mouseup', commitGhost);
    }

    window.addEventListener('mousemove', moveGhost);
    window.addEventListener('mouseup', commitGhost);
    moveGhost(e);
  }

  topRulerCanvas.addEventListener('mousedown',  (e) => onRulerMouseDown(e, 'h'));
  leftRulerCanvas.addEventListener('mousedown', (e) => onRulerMouseDown(e, 'v'));

  // ── Snap indicator rendering ──────────────────────────────────────────────

  let currentSnaps = [];

  function showIndicators(snaps) {
    currentSnaps = snaps;
    renderIndicators();
  }

  function hideIndicators() {
    currentSnaps = [];
    const ctx = indicatorCanvas.getContext('2d');
    ctx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
  }

  function renderIndicators() {
    const dpr = window.devicePixelRatio || 1;
    const ctx = indicatorCanvas.getContext('2d');
    ctx.clearRect(0, 0, indicatorCanvas.width, indicatorCanvas.height);
    if (!currentSnaps.length) return;

    const sc = stage.scaleX() || 1;
    const sp = stage.position();
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#8aff8c';

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = primary;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    for (const snap of currentSnaps) {
      if (snap.axis === 'x') {
        // Vertical indicator line at snap.snapPos (world X).
        const sx = sp.x + snap.snapPos * sc;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, ch);
        ctx.stroke();
      } else {
        // Horizontal indicator line at snap.snapPos (world Y).
        const sy = sp.y + snap.snapPos * sc;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(cw, sy);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // ── Resize observer ───────────────────────────────────────────────────────

  const ro = new ResizeObserver(() => {
    resizeIndicator();
    if (getSettings().rulersEnabled) {
      resizeRulers();
      updateRulers();
    }
    syncGuidelineEls();
  });
  ro.observe(container);

  // ── Document subscription ─────────────────────────────────────────────────

  const unsub = doc.subscribe?.((e) => {
    if (e.type === 'doc:guidelines' || e.type === 'doc:loaded') {
      syncGuidelineEls();
    }
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  applyRulerVisibility();
  // Assign _ids to guidelines loaded from doc (they may not have them).
  const existing = getGuidelines(doc);
  for (const g of existing) {
    if (g._id == null) g._id = ++nextGuideId;
  }

  return {
    destroy() {
      ro.disconnect();
      if (unsub) unsub();
      indicatorCanvas.remove();
      topRulerCanvas.remove();
      leftRulerCanvas.remove();
      cornerDiv.remove();
      for (const [, { el }] of guidelineEls) el.remove();
      guidelineEls.clear();
    },

    computeSnapForRect(rect, excludeLayerId) {
      return computeSnapForRect(rect, excludeLayerId, stage, doc, _cl);
    },

    showIndicators,
    hideIndicators,

    updateRulers() {
      applyRulerVisibility();
      updateRulers();
      syncGuidelineEls();
    },

    // Called after pan/zoom so rulers + indicators repaint.
    onStageTransform() {
      if (getSettings().rulersEnabled) updateRulers();
      syncGuidelineEls();
      if (currentSnaps.length) renderIndicators();
    },
  };
}
