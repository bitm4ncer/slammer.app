// cors-proxy — shared multi-proxy fallback chain for fetching resources
// from CDNs that don't send Access-Control-Allow-Origin headers.
//
// Background: the Met museum image CDN (images.metmuseum.org), Wikimedia
// thumbnails, and a handful of other museum / archive CDNs return raw
// bytes without CORS. <img src=…> works for display (the browser just
// won't expose pixels), but fetch().blob() — needed to import the image
// as a layer — fails. We therefore tunnel through one of the public
// CORS proxies. Single-proxy was fragile: corsproxy.io started 403'ing
// Met URLs (rate limiting / host blocklist) at some point, breaking all
// import paths. Multi-proxy keeps the door open.
//
// Order: try direct first (fastest, only succeeds for CORS-friendly
// hosts). Then walk a small list of free public proxies. The first one
// that returns a valid 2xx body wins.

const PROXIES = [
  // corsproxy.io — historically the fastest, but flaky for Met / Wikimedia.
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  // allorigins — slower but more permissive. Path is /raw for binary.
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  // codetabs — small monthly quota but a good last-chance fallback.
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function tryFetch(target, init) {
  const r = await fetch(target, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

/**
 * Fetch a URL, automatically falling back through the public-proxy chain
 * on failure. Returns the Response object (call .blob() / .json() on it).
 *
 * @param {string} url        — original URL
 * @param {object} [opts]
 * @param {RequestInit} [opts.init]    — fetch init for direct attempt
 * @param {boolean}     [opts.skipDirect]  — true: bypass direct attempt entirely
 *                                            (use when caller already knows direct fails)
 * @param {function(string, Error): void} [opts.onProxyFallback]  — debug hook,
 *                                            invoked once with the proxy URL when
 *                                            direct fails and we move to proxy.
 */
export async function fetchWithProxy(url, opts = {}) {
  const init = { referrerPolicy: 'no-referrer', ...(opts.init || {}) };
  const errors = [];

  if (!opts.skipDirect) {
    try {
      return await tryFetch(url, init);
    } catch (err) {
      errors.push({ source: 'direct', err });
    }
  }

  for (let i = 0; i < PROXIES.length; i++) {
    const proxied = PROXIES[i](url);
    try {
      const r = await tryFetch(proxied, init);
      if (i === 0 && opts.onProxyFallback) {
        try { opts.onProxyFallback(proxied, errors[0]?.err); } catch (_) {}
      }
      return r;
    } catch (err) {
      errors.push({ source: `proxy:${i}`, err });
    }
  }

  // Build a meaningful error message — caller's catch() needs to know
  // the chain exhausted, not just a generic "Failed to fetch".
  const msg = errors.map((e) => `${e.source}: ${e.err?.message || e.err}`).join(' | ');
  throw new Error(`All fetch attempts failed for ${url} — ${msg}`);
}

/**
 * Convenience wrapper: fetchWithProxy + .blob() with the standard image
 * sanity checks. Returns a Blob ready to hand to importImage().
 *
 * @param {string} url
 * @param {object} [opts]   — forwarded to fetchWithProxy
 */
export async function fetchImageBlob(url, opts = {}) {
  const r = await fetchWithProxy(url, opts);
  const blob = await r.blob();
  if (!blob.size) throw new Error('Empty response');
  // Some proxies forward HTML error pages with type text/html — guard.
  if (!blob.type.startsWith('image/') && !blob.type.startsWith('application/octet-stream')) {
    // application/octet-stream is acceptable; a few proxies strip the
    // image/* type when re-streaming binary.
    throw new Error(`Not an image (${blob.type || 'unknown'})`);
  }
  return blob;
}
