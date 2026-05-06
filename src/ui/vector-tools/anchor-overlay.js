// anchor-overlay — Direct Selection visual + interaction layer.
//
// When the active tool is "directSelect" and the active layer is a vector
// layer:
//   • Each path is outlined in dashed accent.
//   • Each segment.point shows as a draggable white square anchor.
//   • Each non-zero handleIn / handleOut shows as a draggable round dot
//     connected to its anchor by a tangent line.
//
// Performance model (Phase 1.3): during a drag, we update Konva nodes +
// the dashed outline's `data` attribute live, but we do NOT call
// doc.setVectorPath until dragend. A single Paper.CompoundPath is parsed
// once at dragstart and mutated in-place, so the dragend commit is one
// parse + one serialise rather than N.
//
// Coordinate convention (see vector-renderer.js): path d-strings are
// stored in WORLD coords. The overlay's anchor group is positioned at
// the layer's Konva.Group transform; anchors and outlines are placed at
// `worldCoord - layer.transform.x/y` so they live in the group's local
// frame and pick up the layer's scale/rotation.

import Konva from 'konva';
import { getTool, onToolChange } from './active-tool.js';
import { paper, activatePaper } from '../../core/paper-context.js';

// Marker the user can toggle via Alt-click on a handle dot. While set, a
// handle drag mutates only the touched side; otherwise both sides mirror
// (smooth-anchor behavior). Session-scoped — not persisted.
const _asymKey = (layerId, pathIdx, subPathIdx, segIdx) =>
  `${layerId}:${pathIdx}:${subPathIdx}:${segIdx}`;

// Hit padding (path-space pixels at scale 1) added around small grab
// targets so anchors and handles are easier to grab at low zoom.
const ANCHOR_HIT_PAD = 8;
const HANDLE_HIT_PAD = 6;

// Composite key for selected anchors (multi-select via Shift-click).
const _anchorKey = (layerId, pathIdx, subPathIdx, segIdx) =>
  `${layerId}:${pathIdx}:${subPathIdx}:${segIdx}`;
const _parseKey = (k) => {
  const parts = k.split(':');
  return {
    layerId: parts[0],
    pathIdx: +parts[1],
    subPathIdx: +parts[2],
    segIdx: +parts[3],
  };
};

export function initAnchorOverlay({ stage, document: doc }) {
  const overlay = new Konva.Layer();
  stage.add(overlay);
  let liveDragOff = null;
  let anchorDragging = false;

  // Cursor helper — give every draggable handle a `grab` cursor on hover
  // and `grabbing` while it's being dragged. Konva doesn't manage the
  // container cursor itself; we toggle stage.container().style.cursor
  // directly. Restoring on leave/dragend keeps it from sticking.
  function wireGrabCursor(node) {
    const el = stage.container();
    node.on('mouseenter', () => {
      if (!anchorDragging) el.style.cursor = 'grab';
    });
    node.on('mouseleave', () => {
      if (!anchorDragging) el.style.cursor = '';
    });
    node.on('dragstart', () => { el.style.cursor = 'grabbing'; });
    node.on('dragend',   () => { el.style.cursor = ''; });
  }
  // Primary anchor (used for the panel's active-path sync).
  let selected = null;
  // Multi-anchor selection (Shift-click extends; arrow keys nudge all).
  const selectedSet = new Set();
  const asymHandles = new Set();

  // Per-drag cache. Exists only while a handle/anchor is being dragged.
  //   { paperPath: paper.CompoundPath, sub, seg, layerId, pathIdx,
  //     subPathIdx, segIdx, outline: Konva.Path, anchorSub: Konva.Group }
  let dragCache = null;

  function refresh() {
    if (anchorDragging) return;
    overlay.destroyChildren();
    detachLiveDrag();
    if (getTool() !== 'directSelect') { overlay.batchDraw(); return; }
    const layer = doc.activeLayer;
    if (!layer || layer.type !== 'vector') { overlay.batchDraw(); return; }
    drawAnchors(layer);
    attachLiveDrag(layer);
  }

  function attachLiveDrag(layer) {
    const layerGroup = stage.findOne((n) => n.id?.() === layer.id);
    if (!layerGroup) return;
    const onMove = () => syncOverlayTransform(layerGroup);
    layerGroup.on('dragmove.anchorOverlay', onMove);
    layerGroup.on('xChange.anchorOverlay', onMove);
    layerGroup.on('yChange.anchorOverlay', onMove);
    layerGroup.on('scaleXChange.anchorOverlay', onMove);
    layerGroup.on('scaleYChange.anchorOverlay', onMove);
    layerGroup.on('rotationChange.anchorOverlay', onMove);
    layerGroup.on('transform.anchorOverlay', onMove);
    liveDragOff = () => {
      ['dragmove', 'xChange', 'yChange', 'scaleXChange', 'scaleYChange', 'rotationChange', 'transform']
        .forEach((evt) => layerGroup.off(`${evt}.anchorOverlay`));
    };
    syncOverlayTransform(layerGroup);
  }
  function detachLiveDrag() { if (liveDragOff) { liveDragOff(); liveDragOff = null; } }

  function syncOverlayTransform(layerGroup) {
    const grp = overlay.findOne('.anchor-grp');
    if (!grp) return;
    grp.position({ x: layerGroup.x(), y: layerGroup.y() });
    grp.scale({ x: layerGroup.scaleX(), y: layerGroup.scaleY() });
    grp.rotation(layerGroup.rotation());
    grp.offset({ x: layerGroup.offsetX(), y: layerGroup.offsetY() });
    overlay.batchDraw();
  }

  function drawAnchors(layer) {
    activatePaper();
    const layerGroup = stage.findOne((n) => n.id?.() === layer.id);
    if (!layerGroup) return;
    const grp = new Konva.Group({
      name: 'anchor-grp',
      x: layerGroup.x(),
      y: layerGroup.y(),
      scaleX: layerGroup.scaleX(),
      scaleY: layerGroup.scaleY(),
      rotation: layerGroup.rotation(),
      offsetX: layerGroup.offsetX(),
      offsetY: layerGroup.offsetY(),
    });
    overlay.add(grp);

    const offX = layer.transform.x;
    const offY = layer.transform.y;
    const accent = getAccent(layer);

    layer.vector.paths.forEach((rec, pathIdx) => {
      let p;
      try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }

      // Gradient angle/origin handles — drawn first so anchors paint
      // on top. Only when the path has a gradient fill or stroke.
      drawGradientHandles(grp, layer, pathIdx, rec, p, offX, offY, accent);

      // Dashed outline (one Konva.Path per top-level path record). d data
      // is in WORLD coords; group is at layer.transform; outline is shifted
      // by -offX/-offY so geometry maps correctly into group-local space.
      const outline = new Konva.Path({
        name: `path-outline-${pathIdx}`,
        data: rec.d,
        x: -offX, y: -offY,
        stroke: accent,
        strokeWidth: 2.5,
        strokeScaleEnabled: false,
        // Solid bold line in edit mode — was dashed/thin and got lost
        // against the rasterised stroke beneath it.
        hitStrokeWidth: 14,
        shadowColor: accent,
        shadowBlur: 4,
        shadowOpacity: 0.55,
        listening: true,
      });
      outline.on('dblclick dbltap', (e) => {
        e.cancelBubble = true;
        // Path-d is in WORLD coords (see vector-renderer.js convention) —
        // pass the click world coords straight through to Paper, no offset.
        const pos = stage.getPointerPosition();
        if (!pos) return;
        const sc = stage.scaleX() || 1;
        const worldX = (pos.x - stage.x()) / sc;
        const worldY = (pos.y - stage.y()) / sc;
        insertAnchorAtNearestEdge(layer, pathIdx, { x: worldX, y: worldY });
      });
      grp.add(outline);

      const subpaths = p.children && p.children.length ? p.children : [p];
      for (let si = 0; si < subpaths.length; si++) {
        const sub = subpaths[si];
        if (!sub.segments) continue;
        for (let segIdx = 0; segIdx < sub.segments.length; segIdx++) {
          const seg = sub.segments[segIdx];
          const px = seg.point.x - offX;
          const py = seg.point.y - offY;
          buildAnchorGroup(grp, layer, pathIdx, si, segIdx, px, py, seg, accent);
        }
      }
      p.remove();
    });
    overlay.batchDraw();
  }

  // Build the per-anchor sub-group (handles + dots + the anchor square).
  // All four pieces live together so we can find them by name during a drag.
  function buildAnchorGroup(parent, layer, pathIdx, subPathIdx, segIdx, px, py, paperSeg, accent) {
    const key = _anchorKey(layer.id, pathIdx, subPathIdx, segIdx);
    const isSelected = selectedSet.has(key) || (selected
      && selected.layerId === layer.id
      && selected.pathIdx === pathIdx
      && selected.subPathIdx === subPathIdx
      && selected.segIdx === segIdx);
    const isAsym = asymHandles.has(_asymKey(layer.id, pathIdx, subPathIdx, segIdx));

    const sub = new Konva.Group({ name: 'anchor-sub' });
    sub._meta = { layerId: layer.id, pathIdx, subPathIdx, segIdx };
    parent.add(sub);

    // Tangent lines (drawn first so they sit beneath the dots).
    const hi = paperSeg.handleIn;
    const ho = paperSeg.handleOut;
    if (hi && (hi.x || hi.y)) {
      sub.add(new Konva.Line({
        name: 'hi-line',
        points: [px, py, px + hi.x, py + hi.y],
        stroke: accent, strokeWidth: 1.5, strokeScaleEnabled: false,
        opacity: 0.7, listening: false,
      }));
    }
    if (ho && (ho.x || ho.y)) {
      sub.add(new Konva.Line({
        name: 'ho-line',
        points: [px, py, px + ho.x, py + ho.y],
        stroke: accent, strokeWidth: 1.5, strokeScaleEnabled: false,
        opacity: 0.7, listening: false,
      }));
    }

    // Handle dots — fat hit zones via hitFunc inflate.
    if (hi && (hi.x || hi.y)) {
      sub.add(makeHandleDot({
        layer, pathIdx, subPathIdx, segIdx,
        side: 'in',
        anchorX: px, anchorY: py,
        x: px + hi.x, y: py + hi.y,
        accent, isAsym,
      }));
    }
    if (ho && (ho.x || ho.y)) {
      sub.add(makeHandleDot({
        layer, pathIdx, subPathIdx, segIdx,
        side: 'out',
        anchorX: px, anchorY: py,
        x: px + ho.x, y: py + ho.y,
        accent, isAsym,
      }));
    }

    // Anchor square.
    const half = isSelected ? 8 : 7;
    const anchor = new Konva.Rect({
      name: 'anchor',
      x: px - half, y: py - half,
      width: half * 2, height: half * 2,
      fill: isSelected ? accent : '#fff',
      stroke: '#0a0a0a',
      strokeWidth: 1.4, strokeScaleEnabled: false,
      draggable: true,
    });
    // Inflate the hit zone so the user doesn't need pixel-perfect aim.
    anchor.hitFunc(function (ctx, shape) {
      const pad = ANCHOR_HIT_PAD;
      ctx.beginPath();
      ctx.rect(-pad, -pad, shape.width() + pad * 2, shape.height() + pad * 2);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    });
    wireGrabCursor(anchor);
    anchor.on('mousedown', (e) => { e.cancelBubble = true; });
    anchor.on('click', (e) => {
      e.cancelBubble = true;
      if (e.evt.altKey) {
        toggleSmoothCorner(layer, pathIdx, subPathIdx, segIdx);
        return;
      }
      const k = _anchorKey(layer.id, pathIdx, subPathIdx, segIdx);
      if (e.evt.shiftKey) {
        // Toggle membership in the multi-selection set.
        if (selectedSet.has(k)) selectedSet.delete(k);
        else selectedSet.add(k);
        selected = { layerId: layer.id, pathIdx, subPathIdx, segIdx };
      } else {
        selectedSet.clear();
        selectedSet.add(k);
        selected = { layerId: layer.id, pathIdx, subPathIdx, segIdx };
      }
      doc._emitVectorActivePath?.(layer.id, pathIdx);
      refresh();
    });
    anchor.on('dragstart', () => {
      anchorDragging = true;
      selected = { layerId: layer.id, pathIdx, subPathIdx, segIdx };
      beginDragCache(layer, pathIdx, subPathIdx, segIdx);
    });
    anchor.on('dragend', () => {
      finalizeDragCache();
      anchorDragging = false;
      refresh();
    });
    anchor.on('dragmove', () => {
      const newPx = anchor.x() + half;
      const newPy = anchor.y() + half;
      const offX = layer.transform.x;
      const offY = layer.transform.y;
      liveAnchorEdit(sub, { point: { x: newPx + offX, y: newPy + offY } }, offX, offY);
    });
    sub.add(anchor);
  }

  // Render gradient angle/origin handles for a path with a gradient fill
  // (and/or stroke). The handles drag the gradient's `from` and `to`
  // points, which are stored as fractions of the path's bbox (0..1).
  function drawGradientHandles(parent, layer, pathIdx, rec, paperPath, offX, offY, accent) {
    const haveFill = rec.fill && rec.fill.type === 'gradient';
    const haveStroke = rec.stroke && rec.stroke.type === 'gradient';
    if (!haveFill && !haveStroke) return;

    const b = paperPath.bounds;
    if (!b || !(b.width > 0) || !(b.height > 0)) return;

    if (haveFill)   addPair('fill',   rec.fill,   '#fff', accent);
    if (haveStroke) addPair('stroke', rec.stroke, accent, '#fff');

    function addPair(kind, spec, fillFrom, fillTo) {
      const from = spec.from || { x: 0, y: 0.5 };
      const to   = spec.to   || { x: 1, y: 0.5 };
      const fromW = { x: b.x + from.x * b.width, y: b.y + from.y * b.height };
      const toW   = { x: b.x + to.x   * b.width, y: b.y + to.y   * b.height };
      // Connector line + endpoints. All in group-local coords (worldX - offX).
      parent.add(new Konva.Line({
        points: [fromW.x - offX, fromW.y - offY, toW.x - offX, toW.y - offY],
        stroke: accent, strokeWidth: 1, strokeScaleEnabled: false,
        opacity: 0.45, dash: [3, 3], listening: false,
      }));
      parent.add(makeGradientDot(fromW, fillFrom, accent, layer, pathIdx, kind, 'from', b, offX, offY));
      parent.add(makeGradientDot(toW,   fillTo,   accent, layer, pathIdx, kind, 'to',   b, offX, offY));
    }
  }

  function makeGradientDot(worldPt, fill, stroke, layer, pathIdx, kind, side, bounds, offX, offY) {
    const dot = new Konva.Circle({
      x: worldPt.x - offX, y: worldPt.y - offY,
      radius: 9,
      fill, stroke,
      strokeWidth: 1.8, strokeScaleEnabled: false,
      draggable: true,
    });
    dot.hitFunc(function (ctx, shape) {
      const r = shape.radius() + HANDLE_HIT_PAD;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    });
    wireGrabCursor(dot);
    dot.on('mousedown', (e) => { e.cancelBubble = true; });
    dot.on('dragstart', () => { anchorDragging = true; });
    dot.on('dragend', () => {
      anchorDragging = false;
      // Convert dot's group-local position back to world, then to fraction.
      const wx = dot.x() + offX;
      const wy = dot.y() + offY;
      const fracX = (wx - bounds.x) / bounds.width;
      const fracY = (wy - bounds.y) / bounds.height;
      const layerNow = doc.findLayer(layer.id);
      if (!layerNow) { refresh(); return; }
      const recNow = layerNow.vector.paths[pathIdx];
      if (!recNow) { refresh(); return; }
      const cur = kind === 'fill' ? recNow.fill : recNow.stroke;
      if (!cur || cur.type !== 'gradient') { refresh(); return; }
      const next = { ...cur, [side]: { x: fracX, y: fracY } };
      if (kind === 'fill') doc.setVectorFill(layer.id, pathIdx, next);
      else                 doc.setVectorStroke(layer.id, pathIdx, next);
    });
    // Live preview: just move the dot; the connector line is rebuilt on refresh().
    return dot;
  }

  function makeHandleDot({ layer, pathIdx, subPathIdx, segIdx, side, anchorX, anchorY, x, y, accent, isAsym }) {
    const dot = new Konva.Circle({
      name: side === 'in' ? 'hi-dot' : 'ho-dot',
      x, y,
      radius: 7,
      fill: isAsym ? accent : '#fff',
      stroke: accent,
      strokeWidth: 1.6,
      strokeScaleEnabled: false,
      draggable: true,
    });
    dot._meta = { side, anchorX, anchorY };
    dot.hitFunc(function (ctx, shape) {
      const r = shape.radius() + HANDLE_HIT_PAD;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    });
    wireGrabCursor(dot);
    dot.on('mousedown', (e) => { e.cancelBubble = true; });
    dot.on('click', (e) => {
      if (!e.evt.altKey) return;
      e.cancelBubble = true;
      const k = _asymKey(layer.id, pathIdx, subPathIdx, segIdx);
      if (asymHandles.has(k)) asymHandles.delete(k);
      else asymHandles.add(k);
      refresh();
    });
    dot.on('dragstart', () => {
      anchorDragging = true;
      beginDragCache(layer, pathIdx, subPathIdx, segIdx);
    });
    dot.on('dragend', () => {
      finalizeDragCache();
      anchorDragging = false;
      refresh();
    });
    dot.on('dragmove', () => {
      const dx = dot.x() - anchorX;
      const dy = dot.y() - anchorY;
      const offX = layer.transform.x;
      const offY = layer.transform.y;
      const isAsym = asymHandles.has(_asymKey(layer.id, pathIdx, subPathIdx, segIdx));
      const patch = side === 'in' ? { handleIn: { x: dx, y: dy } } : { handleOut: { x: dx, y: dy } };
      // Default = smooth pair → mirror to the other side.
      if (!isAsym) {
        if (side === 'in') patch.handleOut = { x: -dx, y: -dy };
        else patch.handleIn = { x: -dx, y: -dy };
      }
      const subGrp = dot.getParent();  // anchor-sub Konva.Group
      liveAnchorEdit(subGrp, patch, offX, offY);
    });
    return dot;
  }

  // Create the per-drag Paper cache. We hydrate once + hold onto the
  // CompoundPath + the specific sub/segment so live mutations are O(1)
  // and the dragend serialise is one pathData read.
  function beginDragCache(layer, pathIdx, subPathIdx, segIdx) {
    activatePaper();
    const rec = layer.vector.paths[pathIdx];
    if (!rec) return;
    let pp;
    try { pp = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }
    const subs = pp.children && pp.children.length ? pp.children : [pp];
    const sub = subs[subPathIdx];
    const seg = sub?.segments?.[segIdx];
    if (!seg) { pp.remove(); return; }
    const outline = overlay.findOne(`.path-outline-${pathIdx}`);
    dragCache = { paperPath: pp, sub, seg, layer, pathIdx, subPathIdx, segIdx, outline };
  }

  function finalizeDragCache() {
    if (!dragCache) return;
    const { paperPath, layer, pathIdx } = dragCache;
    const newD = paperPath.pathData;
    paperPath.remove();
    dragCache = null;
    if (newD) doc.setVectorPath(layer.id, pathIdx, { d: newD });
  }

  // Apply patch to the cached Paper segment + update the Konva visuals
  // for THIS anchor sub-group only. The dashed outline's d-string is
  // re-read from the cached Paper so all sibling subpaths stay in sync.
  function liveAnchorEdit(sub, patch, offX, offY) {
    if (!dragCache) return;
    const seg = dragCache.seg;
    if (patch.point)     { seg.point.x = patch.point.x; seg.point.y = patch.point.y; }
    if (patch.handleIn)  { seg.handleIn = new paper.Point(patch.handleIn.x, patch.handleIn.y); }
    if (patch.handleOut) { seg.handleOut = new paper.Point(patch.handleOut.x, patch.handleOut.y); }

    // Outline update — reflect the new d on the dashed Konva.Path.
    if (dragCache.outline) {
      dragCache.outline.data(dragCache.paperPath.pathData);
    }

    // Update this sub-group's nodes in place.
    const px = seg.point.x - offX;
    const py = seg.point.y - offY;
    const anchor = sub.findOne('.anchor');
    if (anchor) {
      const half = anchor.width() / 2;
      anchor.position({ x: px - half, y: py - half });
    }
    const hi = seg.handleIn;
    const ho = seg.handleOut;
    const hiLine = sub.findOne('.hi-line');
    const hoLine = sub.findOne('.ho-line');
    const hiDot  = sub.findOne('.hi-dot');
    const hoDot  = sub.findOne('.ho-dot');
    if (hiLine) hiLine.points([px, py, px + (hi?.x || 0), py + (hi?.y || 0)]);
    if (hoLine) hoLine.points([px, py, px + (ho?.x || 0), py + (ho?.y || 0)]);
    if (hiDot) {
      hiDot.position({ x: px + (hi?.x || 0), y: py + (hi?.y || 0) });
      hiDot._meta.anchorX = px; hiDot._meta.anchorY = py;
    }
    if (hoDot) {
      hoDot.position({ x: px + (ho?.x || 0), y: py + (ho?.y || 0) });
      hoDot._meta.anchorX = px; hoDot._meta.anchorY = py;
    }
    overlay.batchDraw();
  }

  function toggleSmoothCorner(layer, pathIdx, subPathIdx, segIdx) {
    activatePaper();
    const rec = layer.vector.paths[pathIdx];
    if (!rec) return;
    let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }
    const subs = p.children && p.children.length ? p.children : [p];
    const sub = subs[subPathIdx];
    const seg = sub?.segments?.[segIdx];
    if (!seg) { p.remove(); return; }
    const isCorner = (!seg.handleIn || (!seg.handleIn.x && !seg.handleIn.y))
                  && (!seg.handleOut || (!seg.handleOut.x && !seg.handleOut.y));
    if (isCorner) {
      const segs = sub.segments;
      const prev = segs[(segIdx - 1 + segs.length) % segs.length];
      const next = segs[(segIdx + 1) % segs.length];
      const tx = (next.point.x - prev.point.x) / 4;
      const ty = (next.point.y - prev.point.y) / 4;
      seg.handleIn = new paper.Point(-tx, -ty);
      seg.handleOut = new paper.Point(tx, ty);
    } else {
      seg.handleIn = new paper.Point(0, 0);
      seg.handleOut = new paper.Point(0, 0);
    }
    const newD = p.pathData;
    p.remove();
    doc.setVectorPath(layer.id, pathIdx, { d: newD });
    refresh();
  }

  // Get every selected anchor (multi or just primary). Returned tuples are
  // grouped by (layerId, pathIdx) so we can delete in one Paper round-trip
  // per path. Within a sub-path, indexes are sorted descending so removing
  // them in order doesn't shift earlier indexes.
  function selectedTuples() {
    const set = new Set(selectedSet);
    if (selected) set.add(_anchorKey(selected.layerId, selected.pathIdx, selected.subPathIdx, selected.segIdx));
    return [...set].map(_parseKey);
  }

  function deleteSelectedAnchor() {
    const tuples = selectedTuples();
    if (!tuples.length) return;
    activatePaper();
    // Group by layer + pathIdx.
    const byPath = new Map();
    for (const t of tuples) {
      const k = `${t.layerId}:${t.pathIdx}`;
      if (!byPath.has(k)) byPath.set(k, []);
      byPath.get(k).push(t);
    }
    for (const [key, list] of byPath) {
      const [layerId, pathIdxStr] = key.split(':');
      const pathIdx = +pathIdxStr;
      const layer = doc.findLayer(layerId);
      if (!layer) continue;
      const rec = layer.vector.paths[pathIdx];
      if (!rec) continue;
      let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { continue; }
      const subs = p.children && p.children.length ? p.children : [p];
      // Delete in descending segIdx within each subpath so earlier indexes
      // stay valid.
      const bySub = new Map();
      for (const t of list) {
        if (!bySub.has(t.subPathIdx)) bySub.set(t.subPathIdx, []);
        bySub.get(t.subPathIdx).push(t.segIdx);
      }
      for (const [siStr, idxs] of bySub) {
        const si = +siStr;
        const sub = subs[si];
        if (!sub) continue;
        idxs.sort((a, b) => b - a);
        if (idxs.length >= sub.segments.length - 1) {
          sub.remove();
        } else {
          for (const i of idxs) sub.removeSegment(i);
        }
      }
      const newD = p.pathData;
      p.remove();
      if (!newD) {
        if (layer.vector.paths.length === 1) {
          doc.removeLayer(layer.id);
        } else {
          const next = layer.vector.paths.slice();
          next.splice(pathIdx, 1);
          doc.setVectorPaths(layer.id, next);
        }
      } else {
        doc.setVectorPath(layer.id, pathIdx, { d: newD });
      }
    }
    selected = null;
    selectedSet.clear();
    refresh();
  }

  // Nudge every selected anchor by (dx, dy) world units. Fires one
  // setVectorPath per affected path so history captures one snapshot
  // for the whole nudge.
  function nudgeSelectedAnchors(dx, dy) {
    const tuples = selectedTuples();
    if (!tuples.length) return;
    activatePaper();
    const byPath = new Map();
    for (const t of tuples) {
      const k = `${t.layerId}:${t.pathIdx}`;
      if (!byPath.has(k)) byPath.set(k, []);
      byPath.get(k).push(t);
    }
    for (const [key, list] of byPath) {
      const [layerId, pathIdxStr] = key.split(':');
      const pathIdx = +pathIdxStr;
      const layer = doc.findLayer(layerId);
      if (!layer) continue;
      const rec = layer.vector.paths[pathIdx];
      if (!rec) continue;
      let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { continue; }
      const subs = p.children && p.children.length ? p.children : [p];
      for (const t of list) {
        const seg = subs[t.subPathIdx]?.segments?.[t.segIdx];
        if (!seg) continue;
        seg.point.x += dx;
        seg.point.y += dy;
      }
      const newD = p.pathData;
      p.remove();
      if (newD) doc.setVectorPath(layer.id, pathIdx, { d: newD });
    }
  }

  // Insert at the nearest point on ANY of this top-level path's subpaths
  // — the SVG path's outline can have multiple disjoint subpaths, and we
  // shouldn't force the user to know which subpath they double-clicked.
  function insertAnchorAtNearestEdge(layer, pathIdx, point) {
    activatePaper();
    const rec = layer.vector.paths[pathIdx];
    if (!rec) return;
    let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return; }
    const subs = p.children && p.children.length ? p.children : [p];
    let best = null;
    const target = new paper.Point(point.x, point.y);
    for (const s of subs) {
      const loc = s.getNearestLocation(target);
      if (!loc) continue;
      const dist = loc.point.getDistance(target);
      if (!best || dist < best.dist) best = { sub: s, loc, dist };
    }
    if (!best) { p.remove(); return; }
    best.sub.divideAt(best.loc);
    const newD = p.pathData;
    p.remove();
    doc.setVectorPath(layer.id, pathIdx, { d: newD });
    refresh();
  }

  function getAccent(layer) {
    return layer.accentColor
      || getComputedStyle(window.document.documentElement).getPropertyValue('--primary').trim()
      || '#8aff8c';
  }

  doc.subscribe((e) => {
    if (e.type === 'layer:active' || e.type === 'layer:removed' || e.type === 'doc:loaded') {
      selected = null;
      selectedSet.clear();
      asymHandles.clear();
    }
    if (
      e.type === 'layer:active' ||
      e.type === 'layer:added' ||
      e.type === 'layer:removed' ||
      e.type === 'layer:vectorChanged' ||
      e.type === 'layer:transform' ||
      e.type === 'doc:loaded'
    ) refresh();
  });
  onToolChange(() => { selected = null; selectedSet.clear(); refresh(); });

  // Backspace / Delete removes the selected anchors; arrow keys nudge them.
  window.addEventListener('keydown', (e) => {
    if (getTool() !== 'directSelect') return;
    if (!selected && !selectedSet.size) return;
    const ae = window.document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteSelectedAnchor();
    } else if (e.key.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft')  dx = -step;
      if (e.key === 'ArrowRight') dx =  step;
      if (e.key === 'ArrowUp')    dy = -step;
      if (e.key === 'ArrowDown')  dy =  step;
      if (dx || dy) {
        e.preventDefault();
        nudgeSelectedAnchors(dx, dy);
      }
    }
  });

  // Click on empty stage area in directSelect → deselect anchor(s).
  stage.on('click.anchorOverlayEmpty', (e) => {
    if (getTool() !== 'directSelect') return;
    if (e.target === stage) {
      if (selected || selectedSet.size) {
        selected = null;
        selectedSet.clear();
        refresh();
      }
    }
  });

  return { refresh };
}
