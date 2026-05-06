// In-app confirm + prompt dialogs. Reuses the existing `.confirm-backdrop` /
// `.confirm-modal` chrome (project-menu.js owned the originals; this is the
// shared, reusable copy).
//
// Both dialogs return a Promise so callers can `await`. Native browser
// `prompt()` / `confirm()` are NEVER acceptable in slammer — they break the
// VHS aesthetic and steal focus.

export function showConfirm({ title, message, confirmText = 'Delete', kind = 'danger' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'confirm-backdrop';
    wrap.innerHTML = `
      <div class="confirm-modal" role="dialog">
        <div class="confirm-title">${escapeHtml(title)}</div>
        <div class="confirm-message">${escapeHtml(message)}</div>
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn--secondary" data-act="cancel">Cancel</button>
          <button class="confirm-btn confirm-btn--${kind === 'danger' ? 'danger' : 'primary'}" data-act="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const close = (result) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-act=cancel]')) close(false);
      if (e.target.closest('[data-act=confirm]')) close(true);
    });
  });
}

export function showPrompt({ title, message = '', defaultValue = '', confirmText = 'Save' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'confirm-backdrop';
    wrap.innerHTML = `
      <div class="confirm-modal" role="dialog">
        <div class="confirm-title">${escapeHtml(title)}</div>
        ${message ? `<div class="confirm-message">${escapeHtml(message)}</div>` : ''}
        <input type="text" class="confirm-input" value="${escapeHtml(defaultValue)}" />
        <div class="confirm-actions">
          <button class="confirm-btn confirm-btn--secondary" data-act="cancel">Cancel</button>
          <button class="confirm-btn confirm-btn--primary" data-act="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('.confirm-input');
    requestAnimationFrame(() => { input.focus(); input.select(); });

    const close = (result) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') close(input.value.trim() || null);
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-act=cancel]')) close(null);
      if (e.target.closest('[data-act=confirm]')) close(input.value.trim() || null);
    });
  });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
