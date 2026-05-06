// Shared helpers for vector-filter plugins. All plugins receive the
// shared `paper` instance via the ctx argument; these helpers wrap the
// most common geometry ops so each plugin stays focused on the math.

// Hydrate a path record's d-string into a Paper.CompoundPath.
export function hydrate(paper, rec) {
  try { return new paper.CompoundPath({ pathData: rec.d }); }
  catch { return null; }
}

// Walk every sub-path of a CompoundPath. Returns an array of segments
// per subpath: [[seg, seg, ...], [seg, ...]].
export function subpaths(p) {
  return p.children && p.children.length ? p.children : [p];
}

// Sample N evenly-spaced points along a Paper sub-path's arc-length.
// Returns array of paper.Point.
export function sampleAlong(sub, count) {
  const len = sub.length;
  if (!(len > 0)) return [];
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    out[i] = sub.getPointAt(Math.min(t * len, len));
  }
  return out;
}

// Build a fresh Paper.Path from a list of points (corners — no handles).
// `closed` controls path closure.
export function pathFromPoints(paper, points, closed) {
  return new paper.Path({
    segments: points.map((p) => new paper.Segment(p)),
    closed,
  });
}

// Smooth a path in-place with catmull-rom continuous handles. No-op if
// fewer than 3 segments.
export function smoothPath(p) {
  try { p.smooth({ type: 'catmull-rom' }); } catch {}
}

// Centroid of a sub-path's segment.point values.
export function centroid(sub) {
  const segs = sub.segments || [];
  if (!segs.length) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const s of segs) { sx += s.point.x; sy += s.point.y; }
  return { x: sx / segs.length, y: sy / segs.length };
}

// Cheap deterministic value-noise in [-1, 1]. Two-arg form gives a 2D
// surface; three-arg form mixes in a seed so plugins can reseed without
// allocating a real noise table.
export function noise2(x, y, seed = 0) {
  const sx = Math.sin(x * 12.9898 + y * 78.233 + seed * 113.7) * 43758.5453;
  return (sx - Math.floor(sx)) * 2 - 1;
}

// Smooth-step interpolation between two value-noise lattice samples
// (gradient-noise alternative — cheap, looks Perlin-ish enough for
// vector displacement).
export function fbm(x, y, seed = 0, octaves = 2) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freq, y * freq, seed + o * 1.234);
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

// Replace a path record's d-string while preserving everything else.
export function withD(rec, d) {
  return { ...rec, d };
}
