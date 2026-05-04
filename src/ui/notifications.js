let hideTimer = null;

export function showNotification(message, duration = 2200) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('show'), duration);
}
