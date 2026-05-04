// Tiny numeric input — pairs with Knob. Direct keyboard entry, Enter commits, Escape reverts.

export function createNumericInput({ min, max, step = 1, value, suffix, onChange }) {
  const wrap = document.createElement('span');
  wrap.className = 'effect-num-wrap';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'effect-num';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  wrap.appendChild(input);

  if (suffix) {
    const suf = document.createElement('span');
    suf.className = 'effect-num-suffix';
    suf.textContent = suffix;
    wrap.appendChild(suf);
  }

  let current = value;

  function commit() {
    let v = parseFloat(input.value);
    if (Number.isNaN(v)) {
      input.value = format(current);
      return;
    }
    v = clamp(v, min, max);
    v = roundForStep(v, step);
    input.value = format(v);
    if (v !== current) {
      current = v;
      onChange(v);
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = format(current);
      input.blur();
    }
  });

  input.addEventListener('blur', commit);

  // Prevent wheel on the input from scrolling the page
  input.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    let delta = step * dir;
    if (e.shiftKey) delta *= 0.1;
    let next = roundForStep(clamp(current + delta, min, max), step);
    if (next !== current) {
      current = next;
      input.value = format(next);
      onChange(next);
    }
  }, { passive: false });

  wrap.setValue = (v) => {
    current = v;
    input.value = format(v);
  };

  return wrap;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function roundForStep(v, step) {
  if (!step || step <= 0) return v;
  const stepped = Math.round(v / step) * step;
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const mult = Math.pow(10, decimals);
  return Math.round(stepped * mult) / mult;
}

function format(v) {
  // Strip trailing zeros after decimal, but keep at least one decimal if needed
  const s = String(v);
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}
