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

    let sampleXY; // (x, y) → [-1, +1] each axis
    if (mode === 'texture' && params.texture) {
      const tex = await loadTexture(params.texture);
      if (tex) {
        // Tile the texture across the layer; map R → x-offset, G → y-offset (centred at 128).
        sampleXY = (x, y) => {
          const tx = ((x % tex.w) + tex.w) % tex.w | 0;
          const ty = ((y % tex.h) + tex.h) % tex.h | 0;
          const i = (ty * tex.w + tx) * 4;
          return [(tex.data[i] - 128) / 128, (tex.data[i + 1] - 128) / 128];
        };
      }
    }
    if (!sampleXY) {
      const scale = Math.max(1, Math.min(100, params.scale ?? 8));
      const seed = Math.max(1, Math.floor(params.seed || 1));
      const noiseX = makeValueNoise(W, H, scale, seed * 0xDEADBEEF);
      const noiseY = makeValueNoise(W, H, scale, seed * 0xCAFEBABE + 17);
      sampleXY = (x, y) => [noiseX(x, y) * 2 - 1, noiseY(x, y) * 2 - 1];
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [nx, ny] = sampleXY(x, y);
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

function makeValueNoise(W, H, cellSize, seed) {
  const rand = mulberry32(seed);
  const cw = Math.ceil(W / cellSize) + 2;
  const ch = Math.ceil(H / cellSize) + 2;
  const grid = new Float32Array(cw * ch);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return (x, y) => {
    const fx = x / cellSize;
    const fy = y / cellSize;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix; const ty = fy - iy;
    const ax = ix % cw; const ay = iy % ch;
    const ax1 = (ax + 1) % cw; const ay1 = (ay + 1) % ch;
    const a = grid[ay * cw + ax];
    const b = grid[ay * cw + ax1];
    const c = grid[ay1 * cw + ax];
    const d = grid[ay1 * cw + ax1];
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}
