// Advanced project file browser — Browse / Open / Rename / Duplicate / Delete / Folders.

import { showNotification } from './notifications.js';
import { exportSlmr } from '../io/project-file.js';

export function initProjectMenu({ document: doc, projectStore, view }) {
  let backdrop = null;
  let currentFolderId = 'all'; // 'all' | 'uncategorized' | folder UUID
  let viewMode = 'grid'; // 'grid' | 'list'
  let searchQuery = '';
  let dragProjectId = null;
  let projects = [];
  let folders = [];

  async function open() {
    if (backdrop) return;
    currentFolderId = 'all';
    searchQuery = '';
    viewMode = 'grid';
    projects = await projectStore.listProjects();
    folders = await projectStore.listFolders();
    buildDOM();
  }

  function close() {
    if (backdrop) {
      if (backdrop._onKey) document.removeEventListener('keydown', backdrop._onKey);
      backdrop.remove();
    }
    backdrop = null;
    dragProjectId = null;
    closeFolderMenu();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function selectAll(el) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function showConfirm({ title, message, confirmText = 'Delete', onConfirm }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'confirm-backdrop';
      wrap.innerHTML = `
        <div class="confirm-modal" role="dialog">
          <div class="confirm-title">${escapeHtml(title)}</div>
          <div class="confirm-message">${escapeHtml(message)}</div>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--secondary" data-act="cancel">Cancel</button>
            <button class="confirm-btn confirm-btn--danger" data-act="confirm">${escapeHtml(confirmText)}</button>
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
    }).then((confirmed) => {
      if (confirmed) onConfirm();
    });
  }

  function showPrompt({ title, message, defaultValue = '', confirmText = 'Save', onConfirm }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'confirm-backdrop';
      wrap.innerHTML = `
        <div class="confirm-modal" role="dialog">
          <div class="confirm-title">${escapeHtml(title)}</div>
          <div class="confirm-message">${escapeHtml(message)}</div>
          <input type="text" class="confirm-input" value="${escapeHtml(defaultValue)}" />
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--secondary" data-act="cancel">Cancel</button>
            <button class="confirm-btn confirm-btn--primary" data-act="confirm">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
      const input = wrap.querySelector('.confirm-input');
      input.focus();
      input.select();

      const close = (result) => {
        wrap.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      const onKey = (e) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input.value.trim());
      };
      document.addEventListener('keydown', onKey);

      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-act=cancel]')) close(null);
        if (e.target.closest('[data-act=confirm]')) close(input.value.trim());
      });
    }).then((value) => {
      if (value) onConfirm(value);
    });
  }

  function buildDOM() {
    backdrop = document.createElement('div');
    backdrop.className = 'project-browser-backdrop';
    backdrop.innerHTML = `
      <div class="project-browser" role="dialog" aria-label="Project Browser">
        <div class="project-browser-header">
          <div class="project-browser-header-left">
            <span class="project-browser-title">Projects</span>
            <span class="project-browser-count" id="pbTotalCount">${projects.length} total</span>
          </div>
          <div class="project-browser-header-center">
            <div class="project-browser-search">
              <i class="fas fa-search"></i>
              <input type="text" placeholder="Search projects…" id="pbSearch" value="" />
              <button class="project-browser-search-clear" id="pbSearchClear" style="display:none"><i class="fas fa-times"></i></button>
            </div>
          </div>
          <div class="project-browser-header-right">
            <button class="project-browser-btn" id="pbImport" title="Import .slmr"><i class="fas fa-file-import"></i></button>
            <button class="project-browser-btn" id="pbSaveAs" title="Save As"><i class="fas fa-save"></i></button>
            <button class="project-browser-btn" id="pbNewFolder" title="New Folder"><i class="fas fa-folder-plus"></i></button>
            <button class="project-browser-btn" id="pbToggleView" title="Toggle View"><i class="fas fa-list"></i></button>
            <button class="project-browser-btn project-browser-btn--close" data-act="close" title="Close"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="project-browser-body">
          <div class="project-browser-sidebar" id="pbSidebar"></div>
          <div class="project-browser-content" id="pbContent"></div>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    // Close on backdrop click or close button
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-act=close]')) close();
    });

    // Escape to close
    const onKey = (e) => { if (e.key === 'Escape') { closeFolderMenu(); close(); } };
    document.addEventListener('keydown', onKey);
    backdrop._onKey = onKey;

    // Search
    const searchInput = backdrop.querySelector('#pbSearch');
    const searchClear = backdrop.querySelector('#pbSearchClear');
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      searchClear.style.display = searchQuery ? 'flex' : 'none';
      renderContent();
    });
    searchClear.addEventListener('click', () => {
      searchQuery = '';
      searchInput.value = '';
      searchClear.style.display = 'none';
      searchInput.focus();
      renderContent();
    });
    searchInput.focus();

    // View toggle
    backdrop.querySelector('#pbToggleView').addEventListener('click', () => {
      viewMode = viewMode === 'grid' ? 'list' : 'grid';
      const icon = backdrop.querySelector('#pbToggleView i');
      icon.className = viewMode === 'grid' ? 'fas fa-list' : 'fas fa-th-large';
      renderContent();
    });

    // Import .slmr
    backdrop.querySelector('#pbImport').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.slmr';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const { importSlmr } = await import('../io/project-file.js');
          await importSlmr(file, doc);
          showNotification(`Loaded "${doc.state.name}"`);
          // Refresh the browser to show the newly imported project
          projects = await projectStore.listProjects();
          folders = await projectStore.listFolders();
          renderSidebar();
          renderContent();
        } catch (err) {
          console.error('Import failed:', err);
          showNotification('Import failed');
        }
      };
      input.click();
    });

    // Save As
    backdrop.querySelector('#pbSaveAs').addEventListener('click', async () => {
      showPrompt({
        title: 'Save As',
        message: 'Save a copy of the current project with a new name.',
        defaultValue: doc.state.name || 'Untitled',
        confirmText: 'Save',
        onConfirm: async (name) => {
          try {
            await projectStore.saveAs({ document: doc, view, name });
            projects = await projectStore.listProjects();
            folders = await projectStore.listFolders();
            renderSidebar();
            renderContent();
            showNotification(`Saved as "${name}"`);
          } catch (err) {
            console.error('Save As failed:', err);
            showNotification('Save As failed');
          }
        },
      });
    });

    // New folder
    backdrop.querySelector('#pbNewFolder').addEventListener('click', async () => {
      const folder = await projectStore.createFolder('New Folder');
      folders.push(folder);
      renderSidebar();
      // Find the new folder element and start inline rename
      const nameEl = backdrop.querySelector(`.project-browser-folder-item[data-folder="${folder.id}"] .project-browser-folder-name`);
      if (nameEl) beginFolderRename(nameEl, folder.id);
    });

    renderSidebar();
    renderContent();
  }

  function updateTotalCount() {
    const el = backdrop.querySelector('#pbTotalCount');
    if (el) el.textContent = `${projects.length} total`;
  }

  function renderSidebar() {
    const sidebar = backdrop.querySelector('#pbSidebar');
    if (!sidebar) return;
    updateTotalCount();
    sidebar.innerHTML = `
      <div class="project-browser-nav">
        <div class="project-browser-nav-item ${currentFolderId === 'all' ? 'active' : ''}" data-folder="all">
          <i class="fas fa-layer-group"></i>
          <span>All Projects</span>
          <span class="project-browser-nav-count">${projects.length}</span>
        </div>
        <div class="project-browser-nav-item ${currentFolderId === 'uncategorized' ? 'active' : ''}" data-folder="uncategorized">
          <i class="fas fa-folder-open"></i>
          <span>Uncategorized</span>
          <span class="project-browser-nav-count">${projects.filter((p) => !p.folderId).length}</span>
        </div>
      </div>
      <div class="project-browser-sidebar-divider"></div>
      <div class="project-browser-sidebar-label">Folders</div>
      <div class="project-browser-folder-list">
        ${folders.length === 0 ? '<div class="project-browser-empty-folders">No folders yet</div>' : ''}
        ${folders.sort((a, b) => a.name.localeCompare(b.name)).map((f) => `
          <div class="project-browser-folder-item ${currentFolderId === f.id ? 'active' : ''}" data-folder="${f.id}">
            <i class="fas fa-folder"></i>
            <span class="project-browser-folder-name">${escapeHtml(f.name)}</span>
            <span class="project-browser-nav-count">${projects.filter((p) => p.folderId === f.id).length}</span>
            <button class="project-browser-folder-menu" data-folder-menu="${f.id}" title="Folder actions"><i class="fas fa-ellipsis-h"></i></button>
          </div>
        `).join('')}
      </div>
    `;

    // Sidebar nav clicks
    sidebar.querySelectorAll('[data-folder]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-folder-menu]')) return;
        currentFolderId = el.dataset.folder;
        renderSidebar();
        renderContent();
      });
    });

    // Folder actions menu
    sidebar.querySelectorAll('[data-folder-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = btn.dataset.folderMenu;
        const folder = folders.find((f) => f.id === folderId);
        if (!folder) return;
        openFolderMenu(btn, folderId, folder.name);
      });
    });

    // Drag-and-drop for folders (drop targets)
    setupFolderDropTargets();
  }

  function getFilteredProjects() {
    let list = projects;
    if (currentFolderId === 'uncategorized') {
      list = list.filter((p) => !p.folderId);
    } else if (currentFolderId !== 'all') {
      list = list.filter((p) => p.folderId === currentFolderId);
    }
    if (searchQuery) {
      list = list.filter((p) => p.name.toLowerCase().includes(searchQuery));
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function renderContent() {
    const content = backdrop.querySelector('#pbContent');
    if (!content) return;
    const list = getFilteredProjects();

    if (!list.length) {
      content.innerHTML = `
        <div class="project-browser-empty">
          <i class="fas fa-box-open"></i>
          <p>${searchQuery ? 'No projects match your search.' : 'No projects in this folder.'}</p>
        </div>
      `;
      return;
    }

    if (viewMode === 'grid') {
      content.innerHTML = `
        <div class="project-browser-grid">
          ${list.map((p) => `
            <div class="project-browser-card" data-id="${p.id}" draggable="true">
              <div class="project-browser-card-thumb" style="background-image:url('${p.thumbnail || ''}')">
                ${!p.thumbnail ? '<i class="fas fa-image"></i>' : ''}
                <button class="project-browser-card-download" data-act="download" title="Download .slmr">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 1v6M6 7l-2.5-2.5M6 7l2.5-2.5M1.5 8.5v1a1 1 0 001 1h7a1 1 0 001-1v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
              <div class="project-browser-card-meta">
                <div class="project-browser-card-name">${escapeHtml(p.name)}</div>
                <div class="project-browser-card-date">${formatDate(p.updatedAt)}</div>
              </div>
              <div class="project-browser-card-actions">
                <button class="project-browser-card-btn" data-act="open" title="Open"><i class="fas fa-folder-open"></i></button>
                <button class="project-browser-card-btn" data-act="rename" title="Rename"><i class="fas fa-pen"></i></button>
                <button class="project-browser-card-btn" data-act="dup" title="Duplicate"><i class="fas fa-copy"></i></button>
                <button class="project-browser-card-btn" data-act="del" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="project-browser-list">
          <div class="project-browser-list-header">
            <span class="project-browser-list-col project-browser-list-col--name">Name</span>
            <span class="project-browser-list-col project-browser-list-col--folder">Folder</span>
            <span class="project-browser-list-col project-browser-list-col--date">Modified</span>
            <span class="project-browser-list-col project-browser-list-col--actions"></span>
          </div>
          ${list.map((p) => {
            const folder = folders.find((f) => f.id === p.folderId);
            return `
            <div class="project-browser-list-row" data-id="${p.id}" draggable="true">
              <div class="project-browser-list-col project-browser-list-col--name">
                <div class="project-browser-list-thumb" style="background-image:url('${p.thumbnail || ''}')">
                  ${!p.thumbnail ? '<i class="fas fa-image"></i>' : ''}
                </div>
                <span class="project-browser-list-name">${escapeHtml(p.name)}</span>
              </div>
              <span class="project-browser-list-col project-browser-list-col--folder">${folder ? escapeHtml(folder.name) : '—'}</span>
              <span class="project-browser-list-col project-browser-list-col--date">${formatDate(p.updatedAt)}</span>
              <div class="project-browser-list-col project-browser-list-col--actions">
                <button class="project-browser-card-btn" data-act="download" title="Download .slmr"><i class="fas fa-download"></i></button>
                <button class="project-browser-card-btn" data-act="open" title="Open"><i class="fas fa-folder-open"></i></button>
                <button class="project-browser-card-btn" data-act="rename" title="Rename"><i class="fas fa-pen"></i></button>
                <button class="project-browser-card-btn" data-act="dup" title="Duplicate"><i class="fas fa-copy"></i></button>
                <button class="project-browser-card-btn" data-act="del" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          `;}).join('')}
        </div>
      `;
    }

    // Wire up project cards / rows
    content.querySelectorAll('[data-id]').forEach((el) => {
      const id = el.dataset.id;

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

      el.querySelectorAll('[data-act=open]').forEach((b) => b.addEventListener('click', doOpen));

      const renameBtn = el.querySelector('[data-act=rename]');
      if (renameBtn) {
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const nameEl = el.querySelector('.project-browser-card-name, .project-browser-list-name');
          beginProjectRename(nameEl, id);
        });
      }
      const nameEl = el.querySelector('.project-browser-card-name, .project-browser-list-name');
      if (nameEl) {
        nameEl.addEventListener('click', (e) => {
          if (!nameEl.classList.contains('renaming')) beginProjectRename(nameEl, id);
        });
      }

      const downloadBtn = el.querySelector('[data-act=download]');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const projDoc = await projectStore.loadProject(id);
            if (!projDoc) {
              showNotification('Failed to load project');
              return;
            }
            await exportSlmr({ document: projDoc, name: projDoc.name });
            showNotification(`Exported "${projDoc.name}.slmr"`);
          } catch (err) {
            console.error('Export failed:', err);
            showNotification('Export failed');
          }
        });
      }

      const dupBtn = el.querySelector('[data-act=dup]');
      if (dupBtn) {
        dupBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const newId = await projectStore.duplicateProject(id);
            if (!newId) {
              showNotification('Duplicate failed');
              return;
            }
            projects = await projectStore.listProjects();
            folders = await projectStore.listFolders();
            renderSidebar();
            renderContent();
            showNotification('Project duplicated');
          } catch (err) {
            console.error('Duplicate failed:', err);
            showNotification('Duplicate failed');
          }
        });
      }

      const delBtn = el.querySelector('[data-act=del]');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const p = projects.find((x) => x.id === id);
          showConfirm({
            title: 'Delete Project?',
            message: `Are you sure you want to delete "${p?.name || 'this project'}"? This cannot be undone.`,
            confirmText: 'Delete',
            onConfirm: async () => {
              await projectStore.deleteProject(id);
              projects = projects.filter((p) => p.id !== id);
              renderSidebar();
              renderContent();
              showNotification('Project deleted');
            },
          });
        });
      }

      // Drag start
      el.addEventListener('dragstart', (e) => {
        dragProjectId = id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => {
        dragProjectId = null;
        el.classList.remove('dragging');
        backdrop.querySelectorAll('.project-browser-folder-item, .project-browser-nav-item').forEach((f) => f.classList.remove('drop-target'));
      });
    });
  }

  function setupFolderDropTargets() {
    if (!backdrop) return;
    backdrop.querySelectorAll('.project-browser-folder-item').forEach((el) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drop-target');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('drop-target');
      });
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('drop-target');
        const folderId = el.dataset.folder;
        const pid = e.dataTransfer.getData('text/plain') || dragProjectId;
        if (pid && folderId) {
          await projectStore.moveProjectToFolder(pid, folderId);
          const p = projects.find((x) => x.id === pid);
          if (p) p.folderId = folderId;
          renderSidebar();
          renderContent();
          showNotification('Project moved to folder');
        }
      });
    });

    const uncategorizedEl = backdrop.querySelector('[data-folder="uncategorized"]');
    if (uncategorizedEl) {
      uncategorizedEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        uncategorizedEl.classList.add('drop-target');
      });
      uncategorizedEl.addEventListener('dragleave', () => {
        uncategorizedEl.classList.remove('drop-target');
      });
      uncategorizedEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        uncategorizedEl.classList.remove('drop-target');
        const pid = e.dataTransfer.getData('text/plain') || dragProjectId;
        if (pid) {
          await projectStore.moveProjectToFolder(pid, null);
          const p = projects.find((x) => x.id === pid);
          if (p) delete p.folderId;
          renderSidebar();
          renderContent();
          showNotification('Project moved to Uncategorized');
        }
      });
    }
  }

  function openFolderMenu(anchorBtn, folderId, folderName) {
    closeFolderMenu();
    const menu = document.createElement('div');
    menu.className = 'project-browser-folder-actions open';
    menu.innerHTML = `
      <button class="project-browser-folder-action" data-act="rename"><i class="fas fa-pen"></i> Rename</button>
      <button class="project-browser-folder-action" data-act="delete"><i class="fas fa-trash"></i> Delete</button>
    `;
    const rect = anchorBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 160)}px`;
    menu.style.zIndex = '600';
    document.body.appendChild(menu);

    menu.querySelector('[data-act=rename]').addEventListener('click', () => {
      closeFolderMenu();
      const nameEl = backdrop.querySelector(`.project-browser-folder-item[data-folder="${folderId}"] .project-browser-folder-name`);
      if (nameEl) beginFolderRename(nameEl, folderId);
    });

    menu.querySelector('[data-act=delete]').addEventListener('click', () => {
      closeFolderMenu();
      showConfirm({
        title: 'Delete Folder?',
        message: `Delete folder "${folderName}"? Projects inside will become uncategorized.`,
        confirmText: 'Delete',
        onConfirm: async () => {
          await projectStore.deleteFolder(folderId);
          folders = folders.filter((f) => f.id !== folderId);
          if (currentFolderId === folderId) currentFolderId = 'all';
          projects.forEach((p) => { if (p.folderId === folderId) delete p.folderId; });
          renderSidebar();
          renderContent();
          showNotification('Folder deleted');
        },
      });
    });

    setTimeout(() => {
      const outsideHandler = (e) => {
        if (e.target.closest('.project-browser-folder-actions')) return;
        closeFolderMenu();
        document.removeEventListener('mousedown', outsideHandler, true);
      };
      document.addEventListener('mousedown', outsideHandler, true);
    });
  }

  function closeFolderMenu() {
    document.querySelectorAll('.project-browser-folder-actions').forEach((el) => el.remove());
  }

  function beginProjectRename(el, id) {
    if (el.classList.contains('renaming')) return;
    el.classList.add('renaming');
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    selectAll(el);
    const original = el.textContent;
    const finish = (commit) => {
      el.removeAttribute('contenteditable');
      el.classList.remove('renaming');
      const next = el.textContent.trim();
      if (commit && next && next !== original) {
        const p = projects.find((x) => x.id === id);
        if (p) p.name = next;
        if (projectStore.getCurrent() === id) doc.setName(next);
        projectStore.renameProject(id, next).catch((err) => {
          console.error('Rename failed:', err);
          if (p) p.name = original;
          el.textContent = original;
        });
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

  function beginFolderRename(el, folderId) {
    if (el.classList.contains('renaming')) return;
    el.classList.add('renaming');
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    selectAll(el);
    const original = el.textContent;
    const finish = (commit) => {
      el.removeAttribute('contenteditable');
      el.classList.remove('renaming');
      const next = el.textContent.trim();
      if (commit && next && next !== original) {
        const f = folders.find((x) => x.id === folderId);
        if (f) f.name = next;
        projectStore.renameFolder(folderId, next).catch((err) => {
          console.error('Folder rename failed:', err);
          if (f) f.name = original;
          el.textContent = original;
        });
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
