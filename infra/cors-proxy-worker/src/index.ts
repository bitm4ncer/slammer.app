/**
 * slammer.app CORS proxy — Cloudflare Worker.
 *
 * Tunnels image fetches from museum / archive CDNs that don't send
 * Access-Control-Allow-Origin headers (Met, Wikimedia, …) so the
 * browser can read the bytes via fetch().blob().
 *
 * Endpoint: GET /cors?url=<encoded-source-url>
 *           GET /cors/{source-url-without-scheme}     (alt form, simpler)
 *
 * Hardening:
 *   - Allowlist of museum / archive hosts only — NOT an open relay.
 *     Refuse any other host with 403. This keeps the Worker from being
 *     hijacked as a generic proxy by random internet users.
 *   - Aggressive edge caching (24 h) — popular Met images become free
 *     after the first fetch.
 *   - Stripped referrer + spoofed UA — some CDNs reject third-party
 *     Referers; a normal-looking UA reduces the chance of getting
 *     bot-blocked.
 *   - CORS headers on every response — the whole point of this proxy.
 *
 * Deployment:
 *   See ../README.md for the 3-command deploy.
 */

interface Env {
  // Optional: comma-separated extra hosts to allowlist via wrangler vars.
  EXTRA_HOSTS?: string;
}

const BASE_ALLOWLIST = new Set<string>([
  // Met museum
  'images.metmuseum.org',
  'collectionapi.metmuseum.org',
  // Wikimedia Commons + thumbnails
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  // Smithsonian Open Access
  'ids.si.edu',
  'edan.si.edu',
  'api.si.edu',
  // Rijksmuseum
  'lh3.googleusercontent.com', // Rijksmuseum CDN goes through Google's CDN
  'www.rijksmuseum.nl',
  'data.rijksmuseum.nl',
  // V&A
  'framemark.vam.ac.uk',
  'media.vam.ac.uk',
  'api.vam.ac.uk',
  // MoMA
  'www.moma.org',
  // Openverse (some sources upstream)
  'live.staticflickr.com',
  'farm1.staticflickr.com',
  'farm2.staticflickr.com',
  'farm3.staticflickr.com',
  'farm4.staticflickr.com',
  'farm5.staticflickr.com',
  'farm6.staticflickr.com',
  'farm7.staticflickr.com',
  'farm8.staticflickr.com',
  'farm9.staticflickr.com',
]);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function allowed(host: string, env: Env): boolean {
  if (BASE_ALLOWLIST.has(host)) return true;
  if (!env.EXTRA_HOSTS) return false;
  return env.EXTRA_HOSTS.split(',').map((s) => s.trim()).some((h) => h === host);
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function extractTarget(req: Request): string | null {
  const u = new URL(req.url);
  // Form 1: /cors?url=<encoded>
  const fromQuery = u.searchParams.get('url');
  if (fromQuery) return fromQuery;
  // Form 2: /cors/<full-url-without-scheme>
  // e.g. /cors/images.metmuseum.org/CRDImages/.../X.jpg
  const m = u.pathname.match(/^\/cors\/(.+)$/);
  if (m) {
    const rest = decodeURIComponent(m[1]);
    return rest.startsWith('http') ? rest : `https://${rest}`;
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'GET') {
      return jsonError(405, 'GET only');
    }

    const target = extractTarget(req);
    if (!target) {
      return jsonError(400, 'Missing ?url= parameter');
    }

    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(target);
    } catch {
      return jsonError(400, 'Invalid url parameter');
    }

    if (upstreamUrl.protocol !== 'https:' && upstreamUrl.protocol !== 'http:') {
      return jsonError(400, 'Only http(s) URLs allowed');
    }

    if (!allowed(upstreamUrl.hostname, env)) {
      return jsonError(403, `Host not allowlisted: ${upstreamUrl.hostname}`);
    }

    // Use the Cloudflare cache so popular images become free after first
    // fetch. Cache key includes the upstream URL only; method is GET so
    // the URL fully identifies the resource.
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.slammer.app/${upstreamUrl.hostname}${upstreamUrl.pathname}${upstreamUrl.search}`, req);
    const cached = await cache.match(cacheKey);
    if (cached) {
      // Tag the response so we can see cache hits in CF logs.
      const r = new Response(cached.body, cached);
      r.headers.set('X-Slammer-Proxy-Cache', 'HIT');
      return r;
    }

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl.toString(), {
        cf: {
          // Edge-cache for 24 h regardless of the upstream's cache headers.
          cacheTtl: 86400,
          cacheEverything: true,
        },
        headers: {
          // Spoof a normal browser UA — bare worker UAs sometimes get
          // blocked by museum CDNs. Drop Referer for the same reason.
          'User-Agent': 'Mozilla/5.0 (compatible; slammer.app/1.0; +https://slammer.app)',
        },
        redirect: 'follow',
      });
    } catch (err) {
      return jsonError(502, `Upstream fetch failed: ${(err as Error).message}`);
    }

    if (!upstream.ok) {
      return jsonError(upstream.status, `Upstream HTTP ${upstream.status}`);
    }

    // Strip cookies / Set-Cookie / auth headers from the upstream response.
    // Pass through the body + content type only.
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
    const len = upstream.headers.get('Content-Length');
    if (len) headers.set('Content-Length', len);
    headers.set('Cache-Control', 'public, max-age=86400, immutable');
    headers.set('X-Slammer-Proxy-Cache', 'MISS');
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);

    const body = await upstream.arrayBuffer();
    const response = new Response(body, { status: 200, headers });

    // Stash in CF cache for next time. waitUntil so the response goes out
    // immediately while caching happens in the background.
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};
