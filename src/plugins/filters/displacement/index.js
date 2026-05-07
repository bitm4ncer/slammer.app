// Displacement — for each output pixel (x, y) sample the source at
// (x + dx, y + dy) where (dx, dy) come from a 2-channel value-noise map
// OR an uploaded displacement texture (R = X offset, G = Y offset).
// Edge mode: clamp. Output is a fresh ImageData (cannot mutate in place).

import { sliderRow, pillGroup, makeRoot } from '../../shared/ui-helpers.js';

// In-memory cache: data-URL → decoded { w, h, data: Uint8ClampedArray }.
// Lives for the page lifetime (small textures, cheap re-decode otherwise).
const _textureCache = new Map();

export default {
  id: 'displacement',
  name: 'Displacement',
  version: '1.2.0',
  type: 'filter',
  icon: 'wave-square',
  category: 'glitch',

  defaultParams() {
    return {
      mode: 'noise',     // 'noise' | 'texture'
      amount: 10,        // 0-100 px
      scale: 8,          // 1-40 (noise feature size)
      seed: 1,           // 1-99
      texture: null,     // dataURL of the uploaded texture
    };
  },

  async process(imageData, params) {
    const amount = Math.max(0, Math.min(500, params.amount ?? 10));
    if (amount === 0) return imageData;
    const W = imageData.width, H = imageData.height;
    const src = imageData.data;
    const out = new ImageData(W, H);
    const dst = out.data;
    const mode = params.mode || 'noise';

    // Inlined hot loops per mode — each pixel previously did a closure call
    // that returned a fresh [nx, ny] array (4M allocs on a 2k canvas, 240M/s
    // during a 60 Hz knob drag → GC stalls). Both modes now read directly
    // from cached grid/texture buffers.
    if (mode === 'texture' && params.texture) {
      const tex = await loadTexture(params.texture);
      if (tex) {
        const tW = tex.w, tH = tex.h;
        const td = tex.data;
        const inv128 = 1 / 128;
        for (let y = 0; y < H; y++) {
          // Pre-modulate y once per row.
          const ty = ((y % tH) + tH) % tH;
          const tyRow = ty * tW * 4;
          for (let x = 0; x < W; x++) {
            const tx = ((x % tW) + tW) % tW;
            const ti = tyRow + tx * 4;
            const nx = (td[ti] - 128) * inv128;
            const ny = (td[ti + 1] - 128) * inv128;
            const sx = clampI(x + Math.round(nx * amount), 0, W - 1);
            const sy = clampI(y + Math.round(ny * amount), 0, H - 1);
            const si = (sy * W + sx) * 4;
            const di = (y * W + x) * 4;
            dst[di]     = src[si];
            dst[di + 1] = src[si + 1];
            dst[di + 2] = src[si + 2];
            dst[di + 3] = src[si + 3];
          }
        }
        return out;
      }
    }

    // Noise mode (also the texture-fallback path).
    const scale = Math.max(1, Math.min(100, params.scale ?? 8));
    const seed = Math.max(1, Math.floor(params.seed || 1));
    const gridX = getNoiseGrid(W, H, scale, seed * 0xDEADBEEF);
    const gridY = getNoiseGrid(W, H, scale, seed * 0xCAFEBABE + 17);
    const cwX = gridX.cw, chX = gridX.ch, gX = gridX.grid;
    const cwY = gridY.cw, chY = gridY.ch, gY = gridY.grid;
    const invScale = 1 / scale;

    for (let y = 0; y < H; y++) {
      const fy = y * invScale;
      const iyF = Math.floor(fy);
      const ty = fy - iyF;
      const sy = ty * ty * (3 - 2 * ty);
      const ayX = iyF % chX, ayY = iyF % chY;
      const ay1X = (ayX + 1) % chX, ay1Y = (ayY + 1) % chY;
      const rowAX = ayX * cwX, rowBX = ay1X * cwX;
      const rowAY = ayY * cwY, rowBY = ay1Y * cwY;
      for (let x = 0; x < W; x++) {
        const fx = x * invScale;
        const ixF = Math.floor(fx);
        const tx = fx - ixF;
        const sxN = tx * tx * (3 - 2 * tx);

        const axX = ixF % cwX, ax1X = (axX + 1) % cwX;
        const axY = ixF % cwY, ax1Y = (axY + 1) % cwY;

        const aX = gX[rowAX + axX], bX = gX[rowAX + ax1X];
        const cX = gX[rowBX + axX], dX = gX[rowBX + ax1X];
        const topX = aX + (bX - aX) * sxN;
        const botX = cX + (dX - cX) * sxN;
        const nx = (topX + (botX - topX) * sy) * 2 - 1;

        const aY = gY[rowAY + axY], bY = gY[rowAY + ax1Y];
        const cY = gY[rowBY + axY], dY = gY[rowBY + ax1Y];
        const topY = aY + (bY - aY) * sxN;
        const botY = cY + (dY - cY) * sxN;
        const ny = (topY + (botY - topY) * sy) * 2 - 1;

        const dx = Math.round(nx * amount);
        const dy = Math.round(ny * amount);
        let dsx = x + dx; if (dsx < 0) dsx = 0; else if (dsx >= W) dsx = W - 1;
        let dsy = y + dy; if (dsy < 0) dsy = 0; else if (dsy >= H) dsy = H - 1;
        const si = (dsy * W + dsx) * 4;
        const di = (y * W + x) * 4;
        dst[di]     = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = src[si + 3];
      }
    }
    return out;
  },

  renderUI(params, onChange) {
    const root = makeRoot();
    const local = { ...params };

    function rebuild() {
      root.innerHTML = '';

      root.appendChild(pillGroup({
        label: 'Mode',
        options: [
          { value: 'noise',   label: 'Noise' },
          { value: 'texture', label: 'Texture' },
        ],
        value: local.mode || 'noise',
        onChange: (v) => { local.mode = v; onChange({ mode: v }); rebuild(); },
      }));

      if (local.mode === 'texture') {
        const drop = document.createElement('div');
        drop.className = 'displace-drop' + (local.texture ? ' has-texture' : '');
        drop.innerHTML = local.texture
          ? `<img src="${local.texture}" alt="" /><span class="displace-drop-label">Drop a new texture or click to replace</span><button class="displace-drop-clear" title="Remove texture">×</button>`
          : `<i class="fas fa-cloud-arrow-up"></i><span class="displace-drop-label">Drop a displacement texture<br/><small>R → X offset · G → Y offset · grayscale = both</small></span>`;
        root.appendChild(drop);

        const accept = (file) => {
          if (!file || !file.type.startsWith('image/')) return;
          const reader = new FileReader();
          reader.onload = () => {
            local.texture = reader.result;
            onChange({ texture: reader.result });
            rebuild();
          };
          reader.readAsDataURL(file);
        };
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag-over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
        drop.addEventListener('drop', (e) => {
          e.preventDefault();
          drop.classList.remove('drag-over');
          accept(e.dataTransfer?.files?.[0]);
        });
        drop.addEventListener('click', (e) => {
          if (e.target.closest('.displace-drop-clear')) return;
          const fi = document.createElement('input');
          fi.type = 'file';
          fi.accept = 'image/*';
          fi.onchange = () => accept(fi.files?.[0]);
          fi.click();
        });
        const clearBtn = drop.querySelector('.displace-drop-clear');
        if (clearBtn) clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          local.texture = null;
          onChange({ texture: null });
          rebuild();
        });
      }

      root.appendChild(sliderRow({
        label: 'Amount', min: 0, max: 100, step: 1, value: local.amount ?? 10, defaultValue: 10, suffix: 'px',
        onChange: (v) => { local.amount = v; onChange({ amount: v }); },
      }));

      if (local.mode !== 'texture') {
        root.appendChild(sliderRow({
          label: 'Scale', min: 1, max: 100, step: 1, value: local.scale ?? 8, defaultValue: 8,
          onChange: (v) => { local.scale = v; onChange({ scale: v }); },
        }));
        root.appendChild(sliderRow({
          label: 'Seed', min: 1, max: 99, step: 1, value: local.seed ?? 1, defaultValue: 1,
          onChange: (v) => { local.seed = v; onChange({ seed: v }); },
        }));
      }
    }
    rebuild();
    return root;
  },
};

// ---------- helpers ----------
function clampI(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function loadTexture(dataUrl) {
  if (!dataUrl) return null;
  if (_textureCache.has(dataUrl)) return Promise.resolve(_textureCache.get(dataUrl));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const tex = { w: c.width, h: c.height, data: id.data };
      _textureCache.set(dataUrl, tex);
      resolve(tex);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function mulberry32(seed) {
  let t = (seed >>> 0) || 1;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// LRU cache for value-noise grids, keyed by (W, H, cellSize, seed).
// Each grid was previously rebuilt on every process() call — for noise mode
// at default settings on a 2k canvas that's ~250 KB × 2 grids per slider
// tick. During a knob drag (60 Hz onChange) the rebuild dominated frame time.
// Cap at 6 entries (covers seed/scale toggling without thrashing).
const _noiseCache = new Map();
const NOISE_CACHE_MAX = 6;

function getNoiseGrid(W, H, cellSize, seed) {
  const key = `${W}|${H}|${cellSize}|${seed}`;
  const cached = _noiseCache.get(key);
  if (cached) {
    _noiseCache.delete(key);
    _noiseCache.set(key, cached);
    return cached;
  }
  const rand = mulberry32(seed);
  const cw = Math.ceil(W / cellSize) + 2;
  const ch = Math.ceil(H / cellSize) + 2;
  const grid = new Float32Array(cw * ch);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const entry = { grid, cw, ch };
  _noiseCache.set(key, entry);
  if (_noiseCache.size > NOISE_CACHE_MAX) {
    const oldest = _noiseCache.keys().next().value;
    _noiseCache.delete(oldest);
  }
  return entry;
}
