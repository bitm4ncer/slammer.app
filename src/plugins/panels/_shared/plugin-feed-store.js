// Tiny localStorage wrapper for panel-plugin session state.
// Used by createBrowsable + falai to persist what the user was doing
// across close/reopen so the next open lands them where they left off.
//
// Keys: slammer:plugin:<pluginId>:feed
// Schema: { v: 1, ts: <epoch ms>, data: <plugin-defined> }
// Entries older than TTL_MS are dropped on read so stale items don't linger.

const KEY_PREFIX = 'slammer:plugin:';
const KEY_SUFFIX = ':feed';
const TTL_MS = 14 * 86400_000; // 14 days
const ITEMS_CAP = 120;          // 5 pages × 24 results — bounds worst-case payload

function key(pluginId) { return `${KEY_PREFIX}${pluginId}${KEY_SUFFIX}`; }

export function save(pluginId, data) {
  if (!pluginId || !data) return;
  try {
    const safe = { ...data };
    if (Array.isArray(safe.items) && safe.items.length > ITEMS_CAP) {
      safe.items = safe.items.slice(-ITEMS_CAP);
    }
    const wrapped = { v: 1, ts: Date.now(), data: safe };
    localStorage.setItem(key(pluginId), JSON.stringify(wrapped));
  } catch {}
}

export function load(pluginId) {
  if (!pluginId) return null;
  try {
    const raw = localStorage.getItem(key(pluginId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > TTL_MS) {
      try { localStorage.removeItem(key(pluginId)); } catch {}
      return null;
    }
    return parsed.data || null;
  } catch { return null; }
}

export function clear(pluginId) {
  try { localStorage.removeItem(key(pluginId)); } catch {}
}
