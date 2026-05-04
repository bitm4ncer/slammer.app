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
        <div class="project-card-thumb" style="background-image:url('${p.thumbnail || ''}')"></div>
        <div class="project-card-meta">${escape(p.name)}</div>
        <div class="project-card-actions">
          <button data-act="open">Open</button>
          <button data-act="rename">Rename</button>
          <button data-act="dup">Dup</button>
          <button data-act="del">Del</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.project-card').forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('[data-act=open]').addEventListener('click', async () => {
        const projDoc = await projectStore.loadProject(id);
        if (projDoc) {
          // Convert any data-URL sources back to Blobs so the renderer treats them uniformly.
          for (const l of projDoc.layers || []) {
            if (typeof l.source === 'string' && l.source.startsWith('data:')) {
              l.source = await dataURLtoBlob(l.source);
            }
          }
          doc.load(projDoc);
          projectStore.setCurrent(id);
          showNotification(`Opened "${projDoc.name}"`);
          close();
        }
      });
      card.querySelector('[data-act=rename]').addEventListener('click', async () => {
        const next = prompt('New name?');
        if (next) {
          await projectStore.renameProject(id, next);
          if (projectStore.getCurrent() === id) doc.setName(next);
          open(); // refresh
        }
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

  return { open, close };
}

async function dataURLtoBlob(url) {
  const res = await fetch(url);
  return await res.blob();
}
