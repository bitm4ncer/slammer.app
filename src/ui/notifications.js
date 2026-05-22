let hideTimer = null;

export function showNotification(message, duration = 2200) {
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = message;
  // Re-trigger the slide-in animation if .show was already on the element
  // (back-to-back notifications). Removing and re-adding inside an rAF
  // forces the browser to acknowledge the class flip.
  el.classList.remove('show');
  void el.offsetHeight;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('show'), duration);
}
