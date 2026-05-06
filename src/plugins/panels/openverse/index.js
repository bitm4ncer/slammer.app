// Openverse panel plugin — CC-licensed image search across Wikimedia,
// Flickr, museums, etc.
//
// Anonymous mode: Openverse's /v1/auth_tokens/register/ now requires
// email verification before credentials can request tokens, so we can't
// register-and-use in one shot from the browser. The search endpoint is
// public (rate-limited to 20 req/hour per IP, ~5 req/min — fine for
// casual browsing). If we ever need higher limits we can ship a
// pre-verified key via env var.

import { createBrowsable } from '../_shared/browsable.js';
import './openverse.css';

const PLUGIN_ID = 'openverse';
const BASE = 'https://api.openverse.org/v1';
const ENDPOINT = `${BASE}/images/`;

// ---------- Wikimedia thumbnail helper ----------
// Wikimedia only allows specific widths (20,40,60,120,250,330,500,960,1280…).
// Non-standard widths return 429. For grid thumbnails 500px is a good balance.
// URL pattern:
//   /wikipedia/commons/a/ab/File.jpg
//   → /wikipedia/commons/thumb/a/ab/File.jpg/500px-File.jpg
const WIKI_THUMB_RE = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/\w+\/)(\w\/\w+\/)(.+)$/;
function wikiThumb(url, px = 250) {
  const m = url.match(WIKI_THUMB_RE);
  if (!m) return url;                               // not a Wikimedia URL
  const filename = m[3];
  // 250px is Wikipedia's default article-thumbnail width — almost always
  // pre-cached on Wikimedia's CDN.  Non-standard widths get 429.
  return `${m[1]}thumb/${m[2]}${filename}/${px}px-${filename}`;
}

// ---------- Plugin ----------

export default {
  id: PLUGIN_ID,
  name: 'Openverse',
  type: 'panel',
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 3000 3000" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(62.068 0 0 62.068 341.682 444.84)"><path d="M0.086 7.608C0.086 11.794 3.463 15.215 7.643 15.215V0C3.463 0 0.086 3.4 0.086 7.608"/><path d="M11.105 7.608C11.105 11.794 14.482 15.215 18.662 15.215V0C14.503 0 11.105 3.4 11.105 7.608"/><path d="M29.68 15.215C33.855 15.215 37.238 11.809 37.238 7.608 37.238 3.407 33.855 0 29.681 0 25.507 0 22.124 3.406 22.124 7.608 22.124 11.809 25.507 15.215 29.681 15.215"/><path d="M0.086 26.392C0.086 30.6 3.463 34 7.643 34V18.806C3.463 18.806 0.086 22.206 0.086 26.392"/><path d="M11.105 26.329C11.105 30.515 14.482 33.936 18.662 33.936V18.743C14.503 18.743 11.105 22.143 11.105 26.329"/><path d="M29.68 33.936C33.855 33.936 37.238 30.53 37.238 26.329 37.238 22.128 33.855 18.721 29.681 18.721 25.507 18.721 22.124 22.127 22.124 26.329 22.124 30.53 25.507 33.936 29.681 33.936"/></g></svg>',
  accent: '#ffe033',
  description: 'Search ~600M openly-licensed images across Wikimedia, Flickr, museums.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus() { return null; },

  renderUI(container, ctx) {
    container.classList.add('openverse-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: '',                  // No user-facing key needed.
      apiKeyConfigured: () => true,
      landingHeadline: 'Search Openverse for free, openly-licensed images',
      landingPlaceholder: 'Search Openverse…',
      landingTags: ['vintage poster', 'scientific illustration', 'botanical drawing', 'propaganda art', 'woodcut print', 'map cartography', 'Art Deco', 'patent drawing', 'album cover', 'comic art', 'ceramic art', 'folk art'],
      landingQueries: ['vintage illustration', 'botanical art', 'art deco poster', 'scientific drawing', 'folk art pattern', 'retro advertisement'],
      searchFn: async (query, page = 1) => {
        // Fetch extra to compensate for filtered-out wikimedia results.
        const url = `${ENDPOINT}?q=${encodeURIComponent(query)}&page=${page}&page_size=50`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });

        if (res.status === 429) throw new Error('Openverse rate limit hit — try again in a minute (anonymous tier is ~20/hour).');
        if (!res.ok) throw new Error(`Openverse ${res.status}`);
        const data = await res.json();
        // Exclude wikimedia — their thumbnail CDN aggressively rate-limits
        // non-cached sizes, breaking image grids. TODO: re-enable once
        // Openverse fixes their /thumb/ proxy (currently returns 424).
        const results = (data.results || []).filter((r) => r.source !== 'wikimedia');
        const hasMore = page < (data.page_count || 1);
        return { results, hasMore };
      },
      mapResult: (raw) => ({
        id: `openverse:${raw.id}`,
        thumbUrl: raw.thumbnail || raw.url,
        fullUrl: raw.url,
        attribution: raw.creator ? `by ${raw.creator}${raw.source ? ` · ${raw.source}` : ''}` : (raw.source || ''),
        name: `Openverse · ${raw.title || raw.creator || raw.id}`,
        width: raw.width,
        height: raw.height,
      }),
    });
  },
};
