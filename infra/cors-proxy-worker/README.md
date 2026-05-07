# slammer.app CORS proxy — Cloudflare Worker

Tunnels image fetches from museum / archive CDNs that don't send `Access-Control-Allow-Origin` headers (Met, Wikimedia, …) so the browser can read the bytes via `fetch().blob()`.

**Free-tier ceiling:** 100,000 requests/day. Generous for an alpha-stage app, especially with edge caching turned on (popular Met images become 1 origin fetch ever).

---

## Why deploy this?

Public CORS proxies (`corsproxy.io`, `allorigins`, `wsrv.nl`) work but:

- Share rate limits across all slammer.app users. One user storming the proxy = everyone gets throttled.
- Get host-blocked by museum CDNs without warning (corsproxy.io currently 403's all `images.metmuseum.org` URLs).
- Add 200–500 ms latency.
- Privacy: every Met image URL flows through a third-party server.

This Worker fixes all of that:

- Sub-50 ms latency (CF edge).
- 24 h CDN cache: same image fetched twice = 1 origin call ever.
- Allowlisted to museum hosts only — not an open relay.
- Spoofs a normal UA so the upstream CDN doesn't bot-block us.
- Privacy: traffic flows through your own zone, not a third party.

slammer.app reads `Settings → Plugins → CORS proxy → Custom proxy URL` and uses your Worker BEFORE any public proxy. Public proxies remain as fallback.

---

## Three-step deploy

You need a Cloudflare account (free) and `node` >= 18.

```bash
# 1. From the slammer.app repo root:
cd infra/cors-proxy-worker
npm install

# 2. One-time login. Opens a browser for OAuth.
npx wrangler login

# 3. Deploy. Outputs a *.workers.dev URL on success.
npx wrangler deploy
```

The deploy output ends with something like:

```
Deployed slammer-cors-proxy
  https://slammer-cors-proxy.<your-account>.workers.dev
```

Open slammer.app → `Settings → Plugins → CORS proxy → Custom proxy URL` and paste:

```
https://slammer-cors-proxy.<your-account>.workers.dev/cors
```

That's it. Try importing a Met image — the Worker now serves it.

---

## Optional: custom domain

To use `api.slammer.app/cors` instead of the workers.dev subdomain:

1. Add `slammer.app` as a Cloudflare-managed zone if you haven't already.
2. Uncomment the `routes = …` block in `wrangler.toml` (adjust the host).
3. `npx wrangler deploy` again.
4. Update the URL in slammer's settings to the new domain.

---

## Endpoints

| | |
|---|---|
| `GET /cors?url=<encoded>`             | Standard form. Slammer uses this. |
| `GET /cors/<full-url-without-scheme>` | Alt form for testing in a URL bar. |

Both return the upstream image with `Access-Control-Allow-Origin: *` and a 24 h `Cache-Control`. The header `X-Slammer-Proxy-Cache: HIT/MISS` shows cache status.

---

## Allowlisted hosts

Baked into `src/index.ts#BASE_ALLOWLIST`. Currently: Met museum, Wikimedia Commons, Smithsonian, Rijksmuseum (via Google CDN), V&A, MoMA, Flickr (Openverse upstream).

To add a host without redeploying, set the `EXTRA_HOSTS` var in `wrangler.toml`:

```toml
[vars]
EXTRA_HOSTS = "example.com,cdn.example.com"
```

Then `wrangler deploy` again. Or add it to `BASE_ALLOWLIST` directly and commit.

The Worker REFUSES requests for non-allowlisted hosts with `403`. This keeps it from being hijacked as a generic public proxy.

---

## Local development

```bash
npx wrangler dev    # http://localhost:8787
```

Test:

```bash
curl -i 'http://localhost:8787/cors?url=https://images.metmuseum.org/CRDImages/es/original/DT8910.jpg'
```

---

## Operations

- **Logs:** `npx wrangler tail`
- **Free-tier monitoring:** the Cloudflare dashboard's Worker analytics tab.
- **Quota check:** if you start hitting 100k/day consistently, either tune your caching or upgrade to the $5/mo Workers paid plan (10 million req/month).

---

## Cost projection

| Daily requests | Cache hit ratio | Origin fetches/day | CPU time/day | Plan |
|---:|---:|---:|---:|---|
| 1,000          | 80% | 200    | <30 s   | Free |
| 10,000         | 90% | 1,000  | <2 min  | Free |
| 50,000         | 95% | 2,500  | <8 min  | Free |
| 200,000        | 95% | 10,000 | <30 min | Paid ($5/mo) |

Cached responses don't count as origin requests but DO count toward the request total. The free tier's 100k/day limit is *all* requests, hit or miss.

---

## Security notes

- **No secrets stored.** The Worker is stateless apart from the cache.
- **No auth required.** It's an open allowlist proxy by design — anyone on the internet can use your deployed Worker to fetch images from the listed hosts. That's deliberate (no friction for slammer.app users) and bounded (can't proxy arbitrary URLs).
- **If you want to lock it down** to your own slammer.app deployment only, add an `Origin` check at the top of `fetch()`: refuse requests whose `Origin` header isn't your slammer.app domain. Trade-off: blocks `localhost` dev and any other origin you legitimately want to support.
