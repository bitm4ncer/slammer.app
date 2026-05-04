// Project menu modal — Browse / Open / Rename / Duplicate / Delete.

import { showNotification } from './notifications.js';

export function initProjectMenu({ document: doc, projectStore, view }) {
  let backdrop = null;

  async function open() {
    if (backdrop) return;
    const list = await projectStore.listProjects();
    backdrop = document.createElement('div');
    backdrop.className = 'project-modal-backdrop';
    backdrop.innerHTML = `
      <div class="project-modal" role="dialog">
        <div class="project-modal-header">
          <span>Projects</span>
          <button class="effect-icon-btn" data-act="close"><i class="fas fa-times"></i></button>
        </div>
        <div class="project-modal-body" id="projectGrid"></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
    });

    const grid = backdrop.querySelector('#projectGrid');
    if (!list.length) {
      grid.innerHTML = '<div class="effect-empty">No saved projects yet</div>';
      return;
    }
    grid.innerHTML = list.map((p) => `
      <div class="project-card" data-id="${p.id}">
        <div class="project-card-thumb" data-act="open" title="Open" style="background-image:url('${p.thumbnail || ''}')"></div>
        <div class="project-card-meta" title="Click to rename"><span class="project-card-name" tabindex="0">${escape(p.name)}</span></div>
        <div class="project-card-actions">
          <button class="project-card-btn" data-act="open" title="Open"><i class="fas fa-folder-open"></i></button>
          <button class="project-card-btn" data-act="rename" title="Rename"><i class="fas fa-pen"></i></button>
          <button class="project-card-btn" data-act="dup" title="Duplicate"><i class="fas fa-copy"></i></button>
          <button class="project-card-btn" data-act="del" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.project-card').forEach((card) => {
      const id = card.dataset.id;
      const doOpen = async () => {
        const projDoc = await projectStore.loadProject(id);
        if (!projDoc) return;
        for (const l of projDoc.layers || []) {
          if (typeof l.source === 'string' && l.source.startsWith('data:')) {
            l.source = await dataURLtoBlob(l.source);
          }
        }
        doc.load(projDoc);
        projectStore.setCurrent(id);
        showNotification(`Opened "${projDoc.name}"`);
        close();
      };
      const doRename = async (next) => {
        if (!next || next === card.querySelector('.project-card-name').textContent) return;
        await projectStore.renameProject(id, next);
        if (projectStore.getCurrent() === id) doc.setName(next);
      };

      card.querySelectorAll('[data-act=open]').forEach((el) => el.addEventListener('click', doOpen));

      card.querySelector('[data-act=rename]').addEventListener('click', () => {
        beginRename(card.querySelector('.project-card-name'), doRename);
      });
      card.querySelector('.project-card-name').addEventListener('click', (e) => {
        beginRename(e.currentTarget, doRename);
      });

      card.querySelector('[data-act=dup]').addEventListener('click', async () => {
        await projectStore.duplicateProject(id);
        close(); open();
      });
      card.querySelector('[data-act=del]').addEventListener('click', async () => {
        if (confirm('Delete this project?')) {
          await projectStore.deleteProject(id);
          close(); open();
        }
      });
    });
  }

  function close() {
    if (backdrop) backdrop.remove();
    backdrop = null;
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function beginRename(el, commitFn) {
    if (el.classList.contains('renaming')) return;
    el.classList.add('renaming');
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    const original = el.textContent;
    const finish = async (commit) => {
      el.removeAttribute('contenteditable');
      el.classList.remove('renaming');
      const next = el.textContent.trim();
      if (commit && next && next !== original) {
        await commitFn(next);
        open(); // refresh list with new name
      } else {
        el.textContent = original;
      }
    };
    el.addEventListener('blur', () => finish(true), { once: true });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); el.blur(); }
    });
  }

  return { open, close };
}

async function dataURLtoBlob(url) {
  const res = await fetch(url);
  return await res.blob();
}
