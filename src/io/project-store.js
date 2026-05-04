// IndexedDB-backed project store + localStorage index.
// Index entries: { id, name, thumbnail, updatedAt }.
// Full project document lives under projects.<id>.

const DB_NAME = 'crush';
const STORE = 'projects';
const INDEX_KEY = 'crush:projects';
const CURRENT_KEY = 'crush:current';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putProject(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function delProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch { return []; }
}
function writeIndex(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

async function makeThumbnail(doc) {
  // Use the active layer's offscreen canvas if available, otherwise no thumbnail.
  // The renderer maintains layer dstCanvases — but we don't have access here. Caller
  // can pass in renderer to get one; we keep this lazy and fall back to empty.
  return null;
}

export function initProjectStore() {
  async function listProjects() {
    return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function loadProject(id) {
    const rec = await getProject(id);
    if (!rec) return null;
    return rec.document;
  }

  async function saveCurrent({ document: doc, view, name }) {
    let id = localStorage.getItem(CURRENT_KEY);
    if (!id || name) id = crypto.randomUUID();
    if (name) doc.setName(name);

    // Convert image-layer Blob sources to Blobs (already Blobs typically).
    // For .crushproj export we'll convert to data URLs; here we store binary as-is.
    const docCopy = JSON.parse(JSON.stringify(doc.serialize(), (k, v) => {
      if (v && typeof v === 'object' && v.__isFile) return undefined; // safety
      return v;
    }));

    // Re-attach Blob refs since JSON.stringify drops them.
    for (let i = 0; i < doc.layers.length; i++) {
      const src = doc.layers[i].source;
      if (src instanceof Blob) {
        docCopy.layers[i].source = await blobToDataURL(src);
      } else {
        docCopy.layers[i].source = src;
      }
    }

    const thumbnail = await captureThumbnail(view);

    const rec = { id, document: docCopy, updatedAt: Date.now() };
    await putProject(rec);

    const list = readIndex();
    const idx = list.findIndex((p) => p.id === id);
    const entry = { id, name: doc.state.name, thumbnail, updatedAt: rec.updatedAt };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    writeIndex(list);

    localStorage.setItem(CURRENT_KEY, id);
    return id;
  }

  async function autosave({ document: doc }) {
    if (!doc.layers.length) return;
    let id = localStorage.getItem(CURRENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CURRENT_KEY, id);
    }
    const docCopy = JSON.parse(JSON.stringify(doc.serialize()));
    for (let i = 0; i < doc.layers.length; i++) {
      const src = doc.layers[i].source;
      if (src instanceof Blob) docCopy.layers[i].source = await blobToDataURL(src);
      else docCopy.layers[i].source = src;
    }
    await putProject({ id, document: docCopy, updatedAt: Date.now() });
    const list = readIndex();
    const idx = list.findIndex((p) => p.id === id);
    const entry = { id, name: doc.state.name || 'Untitled', thumbnail: list[idx]?.thumbnail || null, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = entry; else list.push(entry);
    writeIndex(list);
  }

  async function deleteProject(id) {
    await delProject(id);
    const list = readIndex().filter((p) => p.id !== id);
    writeIndex(list);
    if (localStorage.getItem(CURRENT_KEY) === id) localStorage.removeItem(CURRENT_KEY);
  }

  async function renameProject(id, newName) {
    const rec = await getProject(id);
    if (rec) {
      rec.document.name = newName;
      rec.updatedAt = Date.now();
      await putProject(rec);
    }
    const list = readIndex();
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) {
      list[idx].name = newName;
      list[idx].updatedAt = Date.now();
      writeIndex(list);
    }
  }

  async function duplicateProject(id) {
    const rec = await getProject(id);
    if (!rec) return null;
    const newId = crypto.randomUUID();
    const newRec = {
      id: newId,
      document: { ...rec.document, name: rec.document.name + ' copy' },
      updatedAt: Date.now(),
    };
    await putProject(newRec);
    const list = readIndex();
    const meta = list.find((p) => p.id === id);
    list.push({ id: newId, name: newRec.document.name, thumbnail: meta?.thumbnail, updatedAt: newRec.updatedAt });
    writeIndex(list);
    return newId;
  }

  return {
    listProjects, loadProject, saveCurrent, autosave,
    deleteProject, renameProject, duplicateProject,
    setCurrent: (id) => localStorage.setItem(CURRENT_KEY, id),
    getCurrent: () => localStorage.getItem(CURRENT_KEY),
  };
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function captureThumbnail(view) {
  if (!view) return null;
  try {
    const canvas = view.stage.toCanvas({ pixelRatio: 0.4 });
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}
