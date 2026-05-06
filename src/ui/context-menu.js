// Lightweight portaled context menu — used by the layer panel + canvas
// for right-click actions (Group, Ungroup, Lock, Duplicate, etc.).
// One menu instance is reused; closes on outside click / Esc / scroll.

let _menu = null;

function close() {
  if (!_menu) return;
  _menu.remove();
  _menu = null;
  document.removeEventListener('mousedown', onAnyDown, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('scroll', close, true);
  window.removeEventListener('blur', close);
}

function onAnyDown(e) {
  if (!_menu) return;
  if (_menu.contains(e.target)) return;
  close();
}
function onKey(e) {
  if (e.key === 'Escape') { close(); e.preventDefault(); }
}

// items: [{ label, icon, onClick, disabled?, danger?, separator? }, ...]
export function openContextMenu({ x, y, items }) {
  close();
  if (!Array.isArray(items) || !items.length) return;
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.position = 'fixed';
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;
  menu.style.zIndex = '9999';
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'context-menu-item' + (item.disabled ? ' is-disabled' : '') + (item.danger ? ' is-danger' : '');
    b.disabled = !!item.disabled;
    b.innerHTML = `${item.icon ? `<i class="fas fa-${item.icon}"></i>` : ''}<span>${item.label}</span>${item.shortcut ? `<kbd>${item.shortcut}</kbd>` : ''}`;
    b.addEventListener('click', () => {
      try { item.onClick?.(); } catch (e) { console.error('[context-menu]', e); }
      close();
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  // Clamp to viewport.
  const rect = menu.getBoundingClientRect();
  const ww = window.innerWidth, wh = window.innerHeight;
  if (rect.right > ww)  menu.style.left = `${Math.max(4, ww - rect.width - 4)}px`;
  if (rect.bottom > wh) menu.style.top  = `${Math.max(4, wh - rect.height - 4)}px`;
  _menu = menu;
  // Defer the global listeners so the right-click that opened the menu
  // doesn't immediately trigger close.
  setTimeout(() => {
    document.addEventListener('mousedown', onAnyDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('blur', close);
  }, 0);
}

export function closeContextMenu() { close(); }
