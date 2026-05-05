// gradient-editor — reusable multi-stop gradient bar with drag-to-move
// handles, click-to-add, double-click-to-remove, and a hidden colour
// picker on each handle.
//
// Used by:  the Gradient Map filter, the Vector properties panel.
//
// Returns the root element. Stops are a sorted-by-at-after-changes array.

export function createGradientEditor({ stops, onChange, hint = true }) {
  const wrap = document.createElement('div');
  wrap.className = 'gradient-editor';

  let local = (stops || defaultStops()).slice();

  function rebuild() {
    wrap.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'gradient-bar';
    bar.style.background = stopsToCss(local);
    wrap.appendChild(bar);
    const handlesEl = document.createElement('div');
    handlesEl.className = 'gradient-handles';
    wrap.appendChild(handlesEl);
    if (hint) {
      const h = document.createElement('div');
      h.className = 'gradient-hint';
      h.textContent = 'Click bar to add · drag to move · dbl-click to remove';
      wrap.appendChild(h);
    }

    const refreshBar = () => { bar.style.background = stopsToCss(local); };

    function placeHandle(idx) {
      const stop = local[idx];
      const h = document.createElement('div');
      h.className = 'gradient-handle';
      h.style.background = stop.color;
      h.style.left = `${stop.at * 100}%`;
      h.title = `${stop.color} @ ${(stop.at * 100).toFixed(0)}%`;

      const colorInp = document.createElement('input');
      colorInp.type = 'color';
      colorInp.value = stop.color;
      colorInp.className = 'gradient-handle-color';
      h.appendChild(colorInp);
      colorInp.addEventListener('input', (e) => {
        local[idx] = { ...local[idx], color: e.target.value };
        h.style.background = e.target.value;
        refreshBar();
        onChange(local.slice());
      });

      let dragging = false;
      let moved = false;
      h.addEventListener('mousedown', (e) => {
        if (e.target === colorInp) return;
        e.preventDefault();
        dragging = true;
        moved = false;
      });
      const onMove = (e) => {
        if (!dragging) return;
        const rect = bar.getBoundingClientRect();
        const at = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        if (Math.abs(at - local[idx].at) > 0.001) moved = true;
        local[idx] = { ...local[idx], at };
        h.style.left = `${at * 100}%`;
        h.title = `${local[idx].color} @ ${(at * 100).toFixed(0)}%`;
        refreshBar();
        onChange(local.slice());
      };
      const onUp = () => { dragging = false; };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      h.addEventListener('click', (e) => { if (moved) e.stopPropagation(); });
      h.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (local.length <= 2) return;
        local.splice(idx, 1);
        onChange(local.slice());
        rebuild();
      });
      handlesEl.appendChild(h);
    }
    local.forEach((_, i) => placeHandle(i));

    bar.addEventListener('click', (e) => {
      if (local.length >= 8) return;
      const rect = bar.getBoundingClientRect();
      const at = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const sorted = local.slice().sort((a, b) => a.at - b.at);
      const color = sampleStops(sorted, at);
      local.push({ at, color });
      onChange(local.slice());
      rebuild();
    });
  }
  rebuild();

  return {
    root: wrap,
    setStops(next) { local = (next || defaultStops()).slice(); rebuild(); },
  };
}

function defaultStops() {
  return [{ at: 0, color: '#ffffff' }, { at: 1, color: '#000000' }];
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function stopsToCss(stops) {
  const sorted = stops.slice().sort((a, b) => a.at - b.at);
  const parts = sorted.map((s) => `${s.color} ${(s.at * 100).toFixed(2)}%`);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

function sampleStops(sorted, at) {
  if (!sorted.length) return '#000000';
  if (at <= sorted[0].at) return sorted[0].color;
  if (at >= sorted[sorted.length - 1].at) return sorted[sorted.length - 1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (at >= a.at && at <= b.at) {
      const t = (at - a.at) / (b.at - a.at || 1);
      return mixHex(a.color, b.color, t);
    }
  }
  return sorted[0].color;
}

function mixHex(a, b, t) {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}
