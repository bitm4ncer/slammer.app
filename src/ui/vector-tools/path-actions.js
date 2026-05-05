// path-actions — single-path commands (Simplify / Smooth / Reverse /
// Close-or-Open / Join subpaths) and multi-path boolean ops
// (Unite / Subtract / Intersect / Exclude / Divide) operating on the
// active vector layer's paths.
//
// The Vector panel mounts these as a small button row under the
// fill/stroke editors; missing capabilities are hidden (e.g. boolean
// ops are hidden when the layer has fewer than two paths).
//
// All operations go through Paper.js via the shared paper-context, then
// emit a single doc.setVectorPath / setVectorPaths so the renderer +
// history capture one snapshot per action.

import { paper, activatePaper } from '../../core/paper-context.js';
import { showNotification } from '../notifications.js';

// Paper.js v0.12 has no built-in stroke→fill expansion — paperjs-offset
// adds it. Lazy-load only when Outline Stroke runs.
let _offsetPromise = null;
async function loadOffset() {
  if (_offsetPromise) return _offsetPromise;
  _offsetPromise = import('paperjs-offset').then((m) => m.PaperOffset || m.default?.PaperOffset);
  return _offsetPromise;
}

// --- single-path commands ---

export function simplifyPath(doc, layer, pathIdx, tolerance = 2.5) {
  const rec = layer.vector.paths[pathIdx];
  if (!rec) return false;
  activatePaper();
  let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return false; }
  const subs = p.children && p.children.length ? p.children : [p];
  for (const s of subs) { try { s.simplify(tolerance); } catch {} }
  const newD = p.pathData;
  p.remove();
  if (!newD) return false;
  doc.setVectorPath(layer.id, pathIdx, { d: newD });
  return true;
}

export function smoothPath(doc, layer, pathIdx) {
  // Paper's built-in smooth() generates handles to make every anchor
  // continuous (catmull-rom interpolation) — useful for rough paths.
  const rec = layer.vector.paths[pathIdx];
  if (!rec) return false;
  activatePaper();
  let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return false; }
  const subs = p.children && p.children.length ? p.children : [p];
  for (const s of subs) { try { s.smooth({ type: 'catmull-rom' }); } catch {} }
  const newD = p.pathData;
  p.remove();
  if (!newD) return false;
  doc.setVectorPath(layer.id, pathIdx, { d: newD });
  return true;
}

export function reversePath(doc, layer, pathIdx) {
  const rec = layer.vector.paths[pathIdx];
  if (!rec) return false;
  activatePaper();
  let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return false; }
  const subs = p.children && p.children.length ? p.children : [p];
  for (const s of subs) { try { s.reverse(); } catch {} }
  const newD = p.pathData;
  p.remove();
  if (!newD) return false;
  doc.setVectorPath(layer.id, pathIdx, { d: newD });
  return true;
}

export function toggleClosed(doc, layer, pathIdx) {
  const rec = layer.vector.paths[pathIdx];
  if (!rec) return false;
  activatePaper();
  let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return false; }
  const subs = p.children && p.children.length ? p.children : [p];
  const wasClosed = subs.every((s) => s.closed);
  for (const s of subs) { s.closed = !wasClosed; }
  const newD = p.pathData;
  p.remove();
  if (!newD) return false;
  doc.setVectorPath(layer.id, pathIdx, { d: newD, closed: !wasClosed });
  return true;
}

// Outline Stroke — convert the path's stroke band into a filled path,
// then drop the stroke. Useful before exporting to SVG that needs no
// stroke metadata, or before applying boolean ops to a stroked shape.
//
// Width / cap / join are pulled from the path's stroke spec so the
// outlined geometry matches what the user sees on canvas. Paper.js v0.12
// doesn't ship expand() so we use paperjs-offset.
export async function outlineStroke(doc, layer, pathIdx) {
  const rec = layer.vector.paths[pathIdx];
  if (!rec) return false;
  const stroke = rec.stroke || {};
  if (!stroke || stroke.type === 'none' || !(stroke.width > 0)) {
    showNotification('Outline Stroke: this path has no visible stroke.');
    return false;
  }
  activatePaper();
  const PaperOffset = await loadOffset();
  if (!PaperOffset || typeof PaperOffset.offsetStroke !== 'function') {
    showNotification('Outline Stroke: offset library failed to load.');
    return false;
  }

  let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return false; }
  // PaperOffset.offsetStroke takes the offset distance from the path
  // centreline (i.e. half the stroke width). For inside/outside alignment
  // we shift that distance: 'inside' offsets only inward, 'outside' only
  // outward, 'center' spans both sides (the default).
  const halfW = stroke.width / 2;
  const align = stroke.align || 'center';
  const opts = {
    cap:  stroke.cap  || 'butt',
    join: stroke.join || 'miter',
    miterLimit: 10,
  };

  // offsetStroke handles open + closed paths transparently. CompoundPaths
  // need each child outlined separately, then united into one shape.
  const subs = (p.children && p.children.length ? p.children : [p]);
  const outlined = [];
  try {
    for (const sub of subs) {
      // For non-centre alignment, generate two parallel offsets and unite
      // them rather than letting offsetStroke straddle the path.
      let band;
      if (align === 'center') {
        band = PaperOffset.offsetStroke(sub, halfW, opts);
      } else {
        const inner = align === 'inside'
          ? PaperOffset.offset(sub, -stroke.width, opts)
          : sub.clone();
        const outer = align === 'outside'
          ? PaperOffset.offset(sub,  stroke.width, opts)
          : sub.clone();
        // Symmetric difference between outer and inner = the band.
        band = outer.subtract(inner);
        inner.remove(); outer.remove();
      }
      if (band) outlined.push(band);
    }
  } catch (e) {
    console.error('[outlineStroke] offset failed:', e);
    p.remove();
    outlined.forEach((o) => { try { o.remove(); } catch {} });
    showNotification('Outline Stroke failed: ' + (e.message || e));
    return false;
  }
  if (!outlined.length) {
    p.remove();
    showNotification('Outline Stroke produced no geometry.');
    return false;
  }
  // Combine all outlined sub-bands into a single CompoundPath d-string.
  let merged = outlined[0];
  for (let i = 1; i < outlined.length; i++) {
    const u = merged.unite(outlined[i]);
    merged.remove();
    outlined[i].remove();
    merged = u;
  }
  const newD = merged.pathData;
  merged.remove();
  p.remove();
  if (!newD) return false;
  // Stroke geometry becomes the new fill silhouette; stroke is cleared.
  // Inherit the stroke's solid colour as the new fill (matches user expectation).
  const inheritedFill = stroke.type === 'solid'
    ? { type: 'solid', color: stroke.color || '#FFFFFF', opacity: stroke.opacity ?? 1 }
    : (rec.fill && rec.fill.type !== 'none' ? rec.fill : { type: 'solid', color: '#FFFFFF', opacity: 1 });
  doc.setVectorPath(layer.id, pathIdx, {
    d: newD,
    closed: true,
    fill: inheritedFill,
    stroke: { type: 'none' },
  });
  return true;
}

// Join all subpaths inside a compound path into a single open chain by
// connecting endpoints with straight segments. Useful after Divide.
export function joinSubpaths(doc, layer, pathIdx) {
  const rec = layer.vector.paths[pathIdx];
  if (!rec) return false;
  activatePaper();
  let p; try { p = new paper.CompoundPath({ pathData: rec.d }); } catch { return false; }
  const subs = (p.children && p.children.length ? p.children.slice() : [p]);
  if (subs.length < 2) { p.remove(); return false; }
  const first = subs[0];
  for (let i = 1; i < subs.length; i++) {
    const next = subs[i];
    try { first.join(next, 1e-3); } catch {
      // join() only works on touching endpoints — for disjoint subpaths
      // fall back to "import segments" via copying segment list.
      first.addSegments(next.segments.map((s) => s.clone()));
      next.remove();
    }
  }
  const newD = first.pathData || p.pathData;
  p.remove();
  if (!newD) return false;
  doc.setVectorPath(layer.id, pathIdx, { d: newD });
  return true;
}

// --- boolean ops (sub-path level) ---
// Operate on the FIRST and SECOND paths of the layer. Result replaces
// both with a single path that inherits the first path's fill/stroke.
// Picking the operands from the panel's path picker would be a future
// enhancement — for now we use [0] and [1] which matches the typical
// "draw two shapes, combine" workflow.
const BOOL_KIND = ['unite', 'subtract', 'intersect', 'exclude', 'divide'];
export function booleanOp(doc, layer, op, aIdx = 0, bIdx = 1) {
  if (!BOOL_KIND.includes(op)) return false;
  const recA = layer.vector.paths[aIdx];
  const recB = layer.vector.paths[bIdx];
  if (!recA || !recB) return false;
  activatePaper();
  let pa, pb;
  try {
    pa = new paper.CompoundPath({ pathData: recA.d });
    pb = new paper.CompoundPath({ pathData: recB.d });
  } catch {
    if (pa) pa.remove();
    if (pb) pb.remove();
    return false;
  }
  // Both operands must be closed for set ops to make geometric sense.
  // Force-close anything that isn't.
  for (const sub of (pa.children?.length ? pa.children : [pa])) sub.closed = true;
  for (const sub of (pb.children?.length ? pb.children : [pb])) sub.closed = true;

  let result;
  try {
    if (op === 'unite')        result = pa.unite(pb);
    else if (op === 'subtract')result = pa.subtract(pb);
    else if (op === 'intersect')result = pa.intersect(pb);
    else if (op === 'exclude') result = pa.exclude(pb);
    else if (op === 'divide')  result = pa.divide(pb);
  } catch (e) {
    console.error('[boolean]', op, 'failed:', e);
    pa.remove(); pb.remove();
    if (result) try { result.remove(); } catch {}
    showNotification(`Boolean ${op} failed.`);
    return false;
  }
  if (!result) {
    pa.remove(); pb.remove();
    showNotification(`Boolean ${op} produced no geometry.`);
    return false;
  }
  const newD = result.pathData;
  result.remove();
  pa.remove();
  pb.remove();
  if (!newD) return false;

  // Replace the two operand paths with the single result; keep recA's
  // fill/stroke as the merged style. For 'divide' we get a CompoundPath
  // back from Paper, so the d-string already encodes multiple subpaths.
  const next = layer.vector.paths.slice();
  const merged = {
    d: newD,
    closed: true,
    fill: recA.fill,
    stroke: recA.stroke,
  };
  // Remove the two operands, insert merged at min(aIdx, bIdx).
  const lo = Math.min(aIdx, bIdx);
  const hi = Math.max(aIdx, bIdx);
  next.splice(hi, 1);
  next.splice(lo, 1, merged);
  doc.setVectorPaths(layer.id, next);
  return true;
}
