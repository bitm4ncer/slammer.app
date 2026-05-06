// Plugin favorites + folders. IndexedDB stores live in the shared 'slammer' DB
// (v3 schema, see project-store.js). All records carry pluginId so multiple
// plugins can share these stores without colliding.

const DB_NAME = 'slammer';
const FAV_STORE = 'plugin-favorites';
const FOL_STORE = 'plugin-folders';

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      // The actual schema is created in project-store.js. Mirror the same
      // create-if-missing logic here so a direct first-load through plugin-store
      // doesn't fail with a missing-store error.
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('datamosh-cache')) {
        db.createObjectStore('datamosh-cache');
      }
      if (!db.objectStoreNames.contains(FAV_STORE)) {
        const fav = db.createObjectStore(FAV_STORE, { keyPath: 'id' });
        fav.createIndex('byPlugin', 'pluginId');
        fav.createIndex('byFolder', 'folderId');
      }
      if (!db.objectStoreNames.contains(FOL_STORE)) {
        const fol = db.createObjectStore(FOL_STORE, { keyPath: 'id' });
        fol.createIndex('byPlugin', 'pluginId');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch {} _dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { _dbPromise = null; reject(req.error || new Error('IndexedDB open failed')); };
    req.onblocked = () => console.warn('[plugin-store] IndexedDB upgrade blocked — close other tabs');
  });
  return _dbPromise;
}

function tx(store, mode = 'readonly') {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Favorites ----------

export async function addFavorite({ pluginId, payload, folderId = null }) {
  const id = crypto.randomUUID();
  const rec = { id, pluginId, payload, folderId, addedAt: Date.now() };
  const store = await tx(FAV_STORE, 'readwrite');
  await reqAsPromise(store.put(rec));
  return rec;
}

export async function removeFavorite(id) {
  const store = await tx(FAV_STORE, 'readwrite');
  await reqAsPromise(store.delete(id));
}

export async function listFavorites(pluginId, { folderId } = {}) {
  const store = await tx(FAV_STORE);
  const idx = store.index('byPlugin');
  const all = await reqAsPromise(idx.getAll(pluginId));
  const filtered = (folderId === undefined) ? all : all.filter((r) => (r.folderId || null) === (folderId || null));
  return filtered.sort((a, b) => b.addedAt - a.addedAt);
}

export async function moveFavoriteToFolder(id, folderId) {
  const store = await tx(FAV_STORE, 'readwrite');
  const rec = await reqAsPromise(store.get(id));
  if (!rec) return;
  rec.folderId = folderId || null;
  await reqAsPromise(store.put(rec));
}

export async function isFavorited(pluginId, predicate) {
  const all = await listFavorites(pluginId);
  return all.find(predicate) || null;
}

// ---------- Folders ----------

export async function createFolder({ pluginId, name }) {
  const id = crypto.randomUUID();
  const rec = { id, pluginId, name: (name || 'New folder').trim(), createdAt: Date.now() };
  const store = await tx(FOL_STORE, 'readwrite');
  await reqAsPromise(store.put(rec));
  return rec;
}

export async function listFolders(pluginId) {
  const store = await tx(FOL_STORE);
  const idx = store.index('byPlugin');
  const all = await reqAsPromise(idx.getAll(pluginId));
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function renameFolder(id, name) {
  const store = await tx(FOL_STORE, 'readwrite');
  const rec = await reqAsPromise(store.get(id));
  if (!rec) return;
  rec.name = (name || rec.name).trim();
  await reqAsPromise(store.put(rec));
}

export async function deleteFolder(id) {
  // Move favorites out of this folder, then delete the folder.
  const favStore = await tx(FAV_STORE, 'readwrite');
  const idx = favStore.index('byFolder');
  const inFolder = await reqAsPromise(idx.getAll(id));
  for (const rec of inFolder) {
    rec.folderId = null;
    await reqAsPromise(favStore.put(rec));
  }
  const folStore = await tx(FOL_STORE, 'readwrite');
  await reqAsPromise(folStore.delete(id));
}
