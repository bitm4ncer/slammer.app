// Cross-plugin active-generation registry.
//
// The contract: any panel plugin that kicks off async work that should
// survive the user closing the plugin window (fal.ai today; future
// inpainting / background-removal / queued-API plugins) routes the job
// through this module. Closing the window does NOT cancel — only an
// explicit cancel call does. The result lands as a layer regardless of
// whether the originating window is still open, because the success path
// calls `window.__slammer.importImage(...)` directly (which is global,
// not panel-scoped).
//
// API surface (also exposed as `window.__slammer.activeGenerations`):
//
//   start({ pluginId, modelId?, modelName?, label, abort, onCancel? }) → id
//   update(id, patch)                  // patch keys: status / queuePos / message
//   end(id)                            // remove from registry — call from finally
//   list(pluginId?)                    // → JobRecord[]; filter by plugin if given
//   get(id)                            // → JobRecord | null
//   subscribe(fn)                      // fn(jobs[]) on every change; returns unsub
//
// JobRecord shape:
//   { id, pluginId, modelId, modelName, label, abort, status, queuePos,
//     message, startedAt }
//   status: 'starting' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'
//   abort:  () => void  // user clicks Cancel anywhere → call this
//
// The footer chip (init via `initFooterChip()` from main.js) subscribes
// to the registry and renders one row per active job, with queue position
// when known. Click → reopens the originating plugin's window.

const jobs = new Map();
const subscribers = new Set();
let nextId = 1;

export function start({ pluginId, modelId = null, modelName = null, label = null, abort = null }) {
  const id = `${pluginId}-${nextId++}`;
  jobs.set(id, {
    id, pluginId, modelId, modelName,
    label: label || modelName || pluginId,
    abort, status: 'starting', queuePos: null, message: null,
    startedAt: Date.now(),
  });
  notify();
  return id;
}

export function update(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
  notify();
}

export function end(id) {
  if (!jobs.has(id)) return;
  jobs.delete(id);
  notify();
}

export function list(pluginId) {
  if (pluginId) {
    return Array.from(jobs.values()).filter((j) => j.pluginId === pluginId);
  }
  return Array.from(jobs.values());
}

export function get(id) {
  return jobs.get(id) || null;
}

export function subscribe(fn) {
  subscribers.add(fn);
  // Fire once with the current state so subscribers can hydrate.
  try { fn(list()); } catch (err) { console.error('[active-generations]', err); }
  return () => subscribers.delete(fn);
}

function notify() {
  const arr = list();
  for (const s of subscribers) {
    try { s(arr); } catch (err) { console.error('[active-generations]', err); }
  }
}

// ---------- Footer chip ----------
// Single chip in the footer that summarises every active job. Hidden when
// the registry is empty. Click → reopens the originating plugin's window.

export function initFooterChip() {
  // Try the footer-right slot first, then footer-center, then the footer
  // itself — slammer's footer layout has shifted around enough that we
  // prefer flexibility over hard-coding one container.
  const host = document.querySelector('.app-footer .footer-right')
            || document.querySelector('.app-footer .footer-center')
            || document.querySelector('.app-footer');
  if (!host) {
    console.warn('[active-generations] no footer host — chip not mounted');
    return;
  }
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'active-gen-chip';
  chip.hidden = true;
  chip.title = 'Active generation — click to open the plugin window';
  chip.innerHTML = `
    <i class="fas fa-circle-notch fa-spin active-gen-chip-spinner"></i>
    <span class="active-gen-chip-label">Generating…</span>
    <span class="active-gen-chip-count" hidden></span>
  `;
  // Insert as the FIRST child so the chip sits at the start of the footer
  // slot — keeps the existing right-aligned controls in their original spots.
  host.insertBefore(chip, host.firstChild);

  chip.addEventListener('click', async () => {
    const all = list();
    if (!all.length) return;
    // Open the originating plugin's window. If multiple jobs run, just
    // open the FIRST one's plugin — covers the 99 % single-job case.
    try {
      const { openPluginWindow } = await import('./plugin-host.js');
      openPluginWindow(all[0].pluginId);
    } catch (err) {
      console.error('[active-generations] could not open plugin', err);
    }
  });

  subscribe((arr) => {
    chip.hidden = arr.length === 0;
    if (!arr.length) return;
    const labelEl = chip.querySelector('.active-gen-chip-label');
    const countEl = chip.querySelector('.active-gen-chip-count');
    if (arr.length === 1) {
      const j = arr[0];
      labelEl.textContent = j.message || statusToLabel(j);
      countEl.hidden = true;
    } else {
      labelEl.textContent = 'Generating…';
      countEl.hidden = false;
      countEl.textContent = `×${arr.length}`;
    }
  });
}

function statusToLabel(j) {
  switch (j.status) {
    case 'queued':   return j.queuePos != null ? `Queued · ${j.queuePos} ahead` : 'Queued…';
    case 'running':  return `${j.label} · generating`;
    case 'starting': return `${j.label} · starting`;
    case 'done':     return `${j.label} · done`;
    case 'error':    return `${j.label} · failed`;
    case 'cancelled':return `${j.label} · cancelled`;
    default:         return j.label;
  }
}
