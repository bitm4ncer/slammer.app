// The Metropolitan Museum of Art — public collection API.
// No auth. Met API is rate-limited (~80 req/sec); when we exceed it, the API
// can return rejections WITHOUT CORS headers, which the browser surfaces as a
// generic CORS error. Three resilience layers:
//   A. Self-throttle: a small concurrency limiter caps in-flight Met requests
//      so we never spike past the rate limit (default 6 parallel).
//   B. Retry-once + CORS-proxy fallback: a failed direct request is retried
//      with a short backoff; if it still fails, we transparently route it
//      through corsproxy.io so the user always gets a result.
//   C. IndexedDB cache: object detail responses (the dominant N+1 pattern,
//      24 fetches per page) are cached forever. Re-visiting an image is free.
//
// Endpoints:
//   GET  /public/collection/v1/search?q=<q>&hasImages=true  → { total, objectIDs }
//   GET  /public/collection/v1/objects/<id>                 → { primaryImage, primaryImageSmall, title, artistDisplayName, ... }

import { createBrowsable } from '../_shared/browsable.js';
import { cacheGetMany, cachePut } from '../../../io/plugin-store.js';
import './met.css';

const PLUGIN_ID = 'met';
const SEARCH = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
const OBJECT = 'https://collectionapi.metmuseum.org/public/collection/v1/objects';
const PAGE_SIZE = 24;
const MAX_PARALLEL = 6;
const RETRY_BACKOFF_MS = 220;
const CORS_PROXY = 'https://corsproxy.io/?url=';

// Per-search cache so pagination doesn't re-search every time. Keyed by the
// (lowercased) query string. Reset whenever the user starts a fresh query.
let _cachedQuery = null;
let _cachedIds = [];

// ---------- A. Concurrency limiter ----------
// Tiny semaphore so at most MAX_PARALLEL fetches sit in-flight against Met.
let _inFlight = 0;
const _waitQueue = [];
async function acquire() {
  if (_inFlight < MAX_PARALLEL) { _inFlight++; return; }
  await new Promise((res) => _waitQueue.push(res));
  _inFlight++;
}
function release() {
  _inFlight--;
  const next = _waitQueue.shift();
  if (next) next();
}

// ---------- B. Resilient fetch ----------
// Try direct → wait + retry direct once → fall back to corsproxy.io.
// We treat ANY thrown TypeError (browser CORS / network rejection) and any
// non-2xx response as a soft failure that triggers the next stage.
async function resilientFetchJson(url) {
  await acquire();
  try {
    const direct = await tryFetchJson(url);
    if (direct.ok) return direct.body;
    if (direct.transient) {
      await sleep(RETRY_BACKOFF_MS);
      const retry = await tryFetchJson(url);
      if (retry.ok) return retry.body;
    }
    // Final fallback: CORS proxy. Slower + third-party but keeps the plugin
    // alive when Met is rate-limiting us hard.
    const proxied = await tryFetchJson(CORS_PROXY + encodeURIComponent(url));
    if (proxied.ok) return proxied.body;
    throw new Error(proxied.errorText || 'Met fetch failed (direct + proxy)');
  } finally {
    release();
  }
}

async function tryFetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // 429 / 5xx are transient — worth retrying. 4xx (other) is permanent.
      const transient = res.status === 429 || res.status >= 500;
      return { ok: false, transient, errorText: `HTTP ${res.status}` };
    }
    const body = await res.json();
    return { ok: true, body };
  } catch (err) {
    // TypeError typically means CORS rejection or network failure — both transient.
    return { ok: false, transient: true, errorText: err?.message || 'fetch failed' };
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------- Met-specific ----------
async function fetchIds(query) {
  const key = query.toLowerCase();
  if (_cachedQuery === key && _cachedIds.length) return _cachedIds;
  const url = `${SEARCH}?hasImages=true&q=${encodeURIComponent(query)}`;
  const data = await resilientFetchJson(url);
  _cachedQuery = key;
  _cachedIds = Array.isArray(data.objectIDs) ? data.objectIDs : [];
  return _cachedIds;
}

async function fetchObject(id) {
  return await resilientFetchJson(`${OBJECT}/${id}`);
}

export default {
  id: PLUGIN_ID,
  name: 'Met Museum',
  type: 'panel',
  iconHTML: '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 40 40"><path fill="currentColor" d="M39.74 27.009a11.6 11.6 0 0 0-.88-1.861 10 10 0 0 0-1.33-1.824 7.6 7.6 0 0 0-1.72-1.387 4 4 0 0 0-2.04-.55v15.4A3 3 0 0 0 34 38a2.65 2.65 0 0 0 .64.883 2.8 2.8 0 0 0 .95.55 3.5 3.5 0 0 0 1.17.19V40h-6.13V21.577a4.9 4.9 0 0 0-2.08.4 4.2 4.2 0 0 0-1.47 1.111 5.3 5.3 0 0 0-.94 1.709 11.5 11.5 0 0 0-.54 2.213h-.26a11.5 11.5 0 0 0-.54-2.194 5.5 5.5 0 0 0-.97-1.718 4.3 4.3 0 0 0-1.54-1.121 5.6 5.6 0 0 0-2.21-.4h-1.36V30h1.24a4 4 0 0 0 .57-.133 2.83 2.83 0 0 0 1.22-.788 3.2 3.2 0 0 0 .68-1.339 7.6 7.6 0 0 0 .21-1.909h.29L24 34.947h-.29a5.83 5.83 0 0 0-1.62-3.228A3.8 3.8 0 0 0 20.84 31h-2.12v8.43h2.19a5.15 5.15 0 0 0 2.17-.456 6.5 6.5 0 0 0 1.79-1.216 8 8 0 0 0 1.39-1.737 10.2 10.2 0 0 0 .96-2.023h.26l-.77 6H12.57v-.38a3.5 3.5 0 0 0 1.17-.19 2.8 2.8 0 0 0 .95-.55 2.5 2.5 0 0 0 .63-.893 2.1 2.1 0 0 0 .18-.987V24.5L10 38h-.5L4 25.593V36.5a4.7 4.7 0 0 0 .37 1.487 2.6 2.6 0 0 0 .64.893 2.7 2.7 0 0 0 .95.55 3.5 3.5 0 0 0 1.16.19V40H0v-.38a3.6 3.6 0 0 0 1.17-.19 2.7 2.7 0 0 0 .94-.55 2.5 2.5 0 0 0 .64-.893 3.05 3.05 0 0 0 .23-1.2V23.362A3.1 3.1 0 0 0 0 21.387v-.379h3.07a4.6 4.6 0 0 1 1.94.37 2.69 2.69 0 0 1 1.28 1.472L11 33.5l4.5-11a2.05 2.05 0 0 1 1.17-1.113 4 4 0 0 1 1.7-.379h20.94l.69 6h-.26Zm-15.93-8.017v-.38a2.17 2.17 0 0 0 2.49-2.525V10h-6.82v6.087a2.17 2.17 0 0 0 2.49 2.525v.38h-8.63v-.38a3.5 3.5 0 0 0 1.17-.189 2.8 2.8 0 0 0 .95-.551 2.6 2.6 0 0 0 .64-.892 3.05 3.05 0 0 0 .23-1.2V5.7a6.8 6.8 0 0 0-.41-2.5 4.04 4.04 0 0 0-1.15-1.644 4.6 4.6 0 0 0-1.8-.9 9.2 9.2 0 0 0-2.34-.275v18.612H4.49v-.38a3.5 3.5 0 0 0 1.17-.189 2.8 2.8 0 0 0 .95-.551 2.6 2.6 0 0 0 .64-.883 3 3 0 0 0 .23-1.206V.384a3.94 3.94 0 0 0-1.98.56 8.3 8.3 0 0 0-1.82 1.4 12 12 0 0 0-1.47 1.814 8.7 8.7 0 0 0-.94 1.851h-.26l.77-6h20.19v.38a2.217 2.217 0 0 0-2.49 2.526V9h6.82V2.906A2.22 2.22 0 0 0 23.81.38V0h13.67l.77 6h-.26a10.3 10.3 0 0 0-.96-2.022 8 8 0 0 0-1.39-1.738 6.4 6.4 0 0 0-1.8-1.215 5.15 5.15 0 0 0-2.17-.456h-2.21V9h1.32a3.84 3.84 0 0 0 1.98-.861 4.34 4.34 0 0 0 1.03-3.315h.29l1.18 9.117h-.29a5.9 5.9 0 0 0-.72-1.89A4.64 4.64 0 0 0 31.64 10h-2.18v8.423h2.95a5.15 5.15 0 0 0 2.17-.456 6.7 6.7 0 0 0 1.8-1.216 8.3 8.3 0 0 0 1.39-1.737 11.5 11.5 0 0 0 .96-2.023h.26l-.78 6h-14.4Z"/></svg>',
  accent: '#e30613',
  description: 'Search 470k+ public-domain works from The Metropolitan Museum of Art.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus() { return null; },

  renderUI(container, ctx) {
    container.classList.add('met-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: '',
      apiKeyConfigured: () => true,
      landingHeadline: "Search The Met's public collection",
      landingPlaceholder: 'e.g. monet, ukiyo-e, ancient egyptian…',
      landingTags: ['Egyptian sculpture', 'Persian carpet', 'Japanese woodblock', 'Medieval armor', 'Greek pottery', 'Renaissance painting', 'Islamic tile', 'Chinese jade', 'Roman mosaic', 'Art Nouveau', 'African mask', 'Samurai sword'],
      landingQueries: ['sunflower', 'marble sculpture', 'gold ornament', 'silk tapestry', 'ancient egypt', 'japanese prints', 'stained glass'],
      searchFn: async (query, page = 1) => {
        const ids = await fetchIds(query);
        const start = (page - 1) * PAGE_SIZE;
        const slice = ids.slice(start, start + PAGE_SIZE);
        if (!slice.length) return { results: [], hasMore: false };
        // C. IndexedDB cache: pull every record we already have, fetch the
        // rest. Met data is effectively immutable, so no TTL.
        const cached = await cacheGetMany(PLUGIN_ID, slice);
        const missing = slice.filter((id) => !cached.has(id));
        if (missing.length) {
          const settled = await Promise.allSettled(missing.map((id) => fetchObject(id)));
          for (let i = 0; i < missing.length; i++) {
            const s = settled[i];
            if (s.status !== 'fulfilled' || !s.value) continue;
            cached.set(missing[i], s.value);
            // Persist for future sessions; fire-and-forget.
            cachePut(PLUGIN_ID, missing[i], s.value).catch(() => {});
          }
        }
        // Preserve original order; drop entries with no usable image.
        const results = slice
          .map((id) => cached.get(id))
          .filter((obj) => obj && (obj.primaryImage || obj.primaryImageSmall));
        const hasMore = (start + PAGE_SIZE) < ids.length;
        return { results, hasMore };
      },
      mapResult: (raw) => {
        const artist = raw.artistDisplayName || raw.culture || '';
        const date = raw.objectDate ? ` (${raw.objectDate})` : '';
        return {
          id: `met:${raw.objectID}`,
          thumbUrl: raw.primaryImageSmall || raw.primaryImage,
          fullUrl: raw.primaryImage || raw.primaryImageSmall,
          attribution: artist ? `by ${artist}${date}` : (raw.title || ''),
          name: `Met · ${raw.title || raw.objectID}`,
        };
      },
    });
  },
};
