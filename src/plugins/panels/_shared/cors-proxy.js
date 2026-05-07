// cors-proxy — shared multi-proxy fallback chain for fetching resources
// from CDNs that don't send Access-Control-Allow-Origin headers.
//
// Background: the Met museum image CDN (images.metmuseum.org), Wikimedia
// thumbnails, and a handful of other museum / archive CDNs return raw
// bytes without CORS. <img src=…> works for display (the browser just
// won't expose pixels), but fetch().blob() — needed to import the image
// as a layer — fails. We tunnel through a chain of CORS-friendly proxies.
//
// Proxy ladder (first 2xx wins):
//   0. User-supplied custom proxy from Settings → Plugins (when set)
//      Use this for production: deploy the Cloudflare Worker in
//      infra/cors-proxy-worker/ and paste its URL.
//   1. images.weserv.nl  — purpose-built image proxy, free, aggressive
//                          edge caching, no host blocklist. Most reliable
//                          public option. URL form differs from generic
//                          proxies (?url= takes URL WITHOUT scheme).
//   2. corsproxy.io      — generic, fast when it works but increasingly
//                          403's museum CDNs (rate limiting / host blocks).
//   3. allorigins.win    — slower, can 522 on slow upstreams but a useful
//                          last public fallback.

const PROXIES = [
  // wsrv.nl: image-specific, most reliable for free use. Strips the
  // protocol from the URL when proxying.
  (url) => `https://wsrv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&n=-1`,
  // corsproxy.io: generic, currently flaky for Met but kept because it's
  // fast for hosts it doesn't block.
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  // allorigins: slower, more permissive. Path is /raw for binary.
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const CUSTOM_PROXY_KEY = 'corsProxyUrl';

/**
 * Read the custom proxy template from Settings, if set. Format mirrors
 * the public ones — a function returning the proxied URL — but stored
 * as a string with `{url}` placeholder OR a `?url=`-style suffix that
 * we auto-encode against. Returns null if unset / invalid.
 */
function getCustomProxy() {
  try {
    const raw = JSON.parse(localStorage.getItem('slammer:settings') || '{}');
    const tmpl = raw[CUSTOM_PROXY_KEY];
    if (!tmpl || typeof tmpl !== 'string') return null;
    if (tmpl.includes('{url}')) {
      return (url) => tmpl.replace('{url}', encodeURIComponent(url));
    }
    // Bare URL — append ?url= or &url= as appropriate.
    return (url) => {
      const sep = tmpl.includes('?') ? '&' : '?';
      return `${tmpl}${sep}url=${encodeURIComponent(url)}`;
    };
  } catch { return null; }
}

async function tryFetch(target, init) {
  const r = await fetch(target, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

// In-memory cache of hosts known to need the proxy. Once we've seen a
// host fail the direct attempt, every subsequent fetch for that host
// skips the direct call and goes straight to the proxy chain. Saves
// the user from seeing two CORS errors in the console for every
// imported image. Cleared on page reload (intentional — host might
// have added CORS headers since last visit).
const _proxyOnlyHosts = new Set();

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

/**
 * Fetch a URL, automatically falling back through the proxy chain on
 * failure. Returns the Response object (call .blob() / .json() on it).
 *
 * @param {string} url        — original URL
 * @param {object} [opts]
 * @param {RequestInit} [opts.init]    — fetch init for direct attempt
 * @param {boolean}     [opts.skipDirect]  — true: bypass direct attempt
 *                                            (use when caller already knows direct fails)
 * @param {function(string, Error): void} [opts.onProxyFallback]  — debug hook,
 *                                            invoked once with the proxy URL when
 *                                            direct fails and we move to a proxy.
 */
export async function fetchWithProxy(url, opts = {}) {
  const init = { referrerPolicy: 'no-referrer', ...(opts.init || {}) };
  const errors = [];
  let firstProxyHit = false;

  // Skip direct if the caller forced it OR if we've previously seen
  // this host need the proxy in this session. Cuts console-noise
  // dramatically when importing many images from the same source
  // (Met, Wikimedia, …): the user sees the CORS error ONCE per host
  // per session instead of once per image.
  const host = hostOf(url);
  const skipDirect = opts.skipDirect || _proxyOnlyHosts.has(host);

  if (!skipDirect) {
    try {
      return await tryFetch(url, init);
    } catch (err) {
      errors.push({ source: 'direct', err });
      // Remember this host so future fetches skip direct.
      if (host) _proxyOnlyHosts.add(host);
    }
  }

  // Build the ordered chain: custom proxy (if set) first, then publics.
  const chain = [];
  const custom = getCustomProxy();
  if (custom) chain.push({ name: 'custom', build: custom });
  for (let i = 0; i < PROXIES.length; i++) {
    chain.push({ name: `public:${i}`, build: PROXIES[i] });
  }

  for (const { name, build } of chain) {
    const proxied = build(url);
    try {
      const r = await tryFetch(proxied, init);
      if (!firstProxyHit && opts.onProxyFallback) {
        firstProxyHit = true;
        try { opts.onProxyFallback(proxied, errors[0]?.err); } catch (_) {}
      }
      return r;
    } catch (err) {
      errors.push({ source: name, err });
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
  if (!blob.type.startsWith('image/') && !blob.type.startsWith('application/octet-stream') && blob.type !== '') {
    // application/octet-stream is acceptable; a few proxies strip the
    // image/* type when re-streaming binary. Empty MIME is also OK
    // (wsrv.nl sometimes returns no Content-Type on cached hits).
    throw new Error(`Not an image (${blob.type})`);
  }
  return blob;
}
