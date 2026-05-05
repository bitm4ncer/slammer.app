// Curve editor — interactive 256×200 canvas with draggable control points and
// Catmull-Rom interpolation between them. Builds a 256-entry LUT.

const W = 256;
const H = 200;
const PAD = 10;

export function createCurveEditor({ getPoints, setPoints, channelColor }) {
  const root = document.createElement('div');
  root.className = 'curve-editor';
  root.innerHTML = `<canvas class="curve-canvas" width="${W}" height="${H}"></canvas>`;
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  let dragging = -1;
  const HIT = 12;

  function toUv(p) {
    return { x: PAD + (p.x / 255) * (W - PAD * 2), y: H - PAD - (p.y / 255) * (H - PAD * 2) };
  }
  function toData(uv) {
    return {
      x: clamp(((uv.x - PAD) / (W - PAD * 2)) * 255, 0, 255),
      y: clamp(((H - PAD - uv.y) / (H - PAD * 2)) * 255, 0, 255),
    };
  }
  function pickPointAt(uv) {
    const pts = getPoints();
    let best = -1, bestD = HIT * HIT;
    for (let i = 0; i < pts.length; i++) {
      const p = toUv(pts[i]);
      const dx = p.x - uv.x, dy = p.y - uv.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function draw() {
    const pts = getPoints();
    ctx.clearRect(0, 0, W, H);
    // Backdrop — slightly lighter than the panel surface for contrast.
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, W, H);

    // Subtle 4×4 grid + bolder centre lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = PAD + (i / 4) * (W - PAD * 2);
      const y = PAD + (i / 4) * (H - PAD * 2);
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, H - PAD); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    const midX = PAD + 0.5 * (W - PAD * 2);
    const midY = PAD + 0.5 * (H - PAD * 2);
    ctx.beginPath(); ctx.moveTo(midX, PAD); ctx.lineTo(midX, H - PAD); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD, midY); ctx.lineTo(W - PAD, midY); ctx.stroke();

    // Histogram-style luminance-band hint (left = shadows, right = highlights).
    const grad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(PAD, H - PAD - 8, W - PAD * 2, 8);

    // Diagonal reference
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    const a = toUv({ x: 0, y: 0 }); const b = toUv({ x: 255, y: 255 });
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);

    // Curve path with subtle outer glow in the channel colour.
    const lut = buildLut(pts);
    const col = channelColor();
    ctx.shadowColor = col;
    ctx.shadowBlur = 3;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = 0; x < 256; x++) {
      const uv = toUv({ x, y: lut[x] });
      if (x === 0) ctx.moveTo(uv.x, uv.y); else ctx.lineTo(uv.x, uv.y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Control points — slightly larger, white inner dot for contrast.
    for (let i = 0; i < pts.length; i++) {
      const uv = toUv(pts[i]);
      const isEndpoint = i === 0 || i === pts.length - 1;
      ctx.beginPath();
      ctx.arc(uv.x, uv.y, isEndpoint ? 4 : 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!isEndpoint) {
        ctx.beginPath();
        ctx.arc(uv.x, uv.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    }
  }

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const uv = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = pickPointAt(uv);
    if (hit >= 0) {
      dragging = hit;
    } else {
      const pts = getPoints().slice();
      const newPt = toData(uv);
      pts.push(newPt);
      pts.sort((a, b) => a.x - b.x);
      setPoints(pts);
      dragging = pts.findIndex((p) => p.x === newPt.x && p.y === newPt.y);
      draw();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (dragging < 0) return;
    const rect = canvas.getBoundingClientRect();
    const uv = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const pts = getPoints().slice();
    if (dragging >= pts.length) { dragging = -1; return; }
    const newPos = toData(uv);
    // Endpoints stay locked to x = 0 / 255 (we keep at least the first and last fixed in X).
    if (dragging === 0) newPos.x = 0;
    if (dragging === pts.length - 1) newPos.x = 255;
    pts[dragging] = newPos;
    pts.sort((a, b) => a.x - b.x);
    dragging = pts.findIndex((p) => p === newPos);
    setPoints(pts);
    draw();
  });
  window.addEventListener('mouseup', () => { dragging = -1; });
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const uv = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = pickPointAt(uv);
    const pts = getPoints();
    if (hit >= 0 && pts.length > 2 && hit !== 0 && hit !== pts.length - 1) {
      const next = pts.slice();
      next.splice(hit, 1);
      setPoints(next);
      draw();
    }
  });

  draw();
  return { root, redraw: draw };
}

// Catmull-Rom 256-LUT from sorted control points.
export function buildLut(pts) {
  const lut = new Uint8ClampedArray(256);
  if (!pts || pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const sorted = pts.slice().sort((a, b) => a.x - b.x);
  // Pad with virtual endpoints so Catmull-Rom can extrapolate at the ends.
  const padded = [
    { x: -1, y: sorted[0].y },
    ...sorted,
    { x: 256, y: sorted[sorted.length - 1].y },
  ];
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < sorted.length - 2 && sorted[seg + 1].x < x) seg++;
    const p0 = padded[seg];
    const p1 = padded[seg + 1];
    const p2 = padded[seg + 2];
    const p3 = padded[seg + 3];
    const span = (p2.x - p1.x) || 1;
    const t = clamp((x - p1.x) / span, 0, 1);
    const y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
    lut[x] = clamp(y | 0, 0, 255);
  }
  return lut;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
