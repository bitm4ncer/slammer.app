// NASA Image & Video Library — public, keyless.
// Hubble, Apollo, Mars rovers, ISS, Earth observation.
//
// API:
//   GET https://images-api.nasa.gov/search
//        ?q=<q>&media_type=image&page=<n>&page_size=24
//   Response: { collection: { items: [{ data:[{ title, description,
//             nasa_id, date_created, center }],
//             links:[{ href, rel:'preview' }] }],
//             metadata:{ total_hits } } }
//
// Note: images-api.nasa.gov has inconsistent CORS — direct fetch usually
// works in browsers but can fail intermittently. The hi-res asset endpoint
// (asset/<id>) requires a second hop, so v1 keeps the preview thumbnail
// as fullUrl and accepts the trade. If the user's region blocks CORS
// outright, we suggest the custom CORS proxy.

import { createBrowsable } from '../_shared/browsable.js';
import './nasa.css';

const PLUGIN_ID = 'nasa';
const SEARCH = 'https://images-api.nasa.gov/search';
const PAGE_SIZE = 24;

export default {
  id: PLUGIN_ID,
  name: 'NASA',
  type: 'panel',
  // Simplified NASA "meatball" — circle with a swooshing arc and a star.
  // currentColor only; we don't try to render the full red/white/blue.
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="12"/><path d="M5 19 Q14 11 27 14" fill="none"/><circle cx="22" cy="10" r="1" fill="currentColor"/><circle cx="10" cy="22" r="0.8" fill="currentColor"/></svg>',
  accent: '#fc3d21',
  description: "Search NASA's image & video library — Hubble, Apollo, Mars, Earth observation.",
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus() { return null; },

  renderUI(container, ctx) {
    container.classList.add('nasa-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: '',
      apiKeyConfigured: () => true,
      landingHeadline: "Search NASA's image library",
      landingPlaceholder: 'e.g. hubble, apollo 11, mars rover, saturn…',
      landingTags: [
        'Hubble nebula', 'Apollo', 'Mars rover', 'ISS', 'Earth from space',
        'Saturn rings', 'Galaxy', 'Astronaut', 'Lunar surface',
        'Solar flare', 'Aurora', 'Spacewalk',
      ],
      landingQueries: [
        'hubble', 'apollo 11', 'mars rover', 'iss earth',
        'saturn cassini', 'galaxy spiral',
      ],
      searchFn: async (query, page = 1) => {
        const url = `${SEARCH}?q=${encodeURIComponent(query)}&media_type=image&page=${page}&page_size=${PAGE_SIZE}`;
        let res;
        try {
          res = await fetch(url, { headers: { Accept: 'application/json' } });
        } catch (err) {
          // Likely a CORS pre-flight failure — surface a friendly hint.
          console.warn('[nasa] direct fetch failed (CORS?). Consider enabling the custom CORS proxy in Settings → Plugins.', err);
          throw new Error('NASA fetch blocked (CORS) — try enabling the custom CORS proxy in Settings.');
        }
        if (!res.ok) throw new Error(`NASA ${res.status}`);
        const data = await res.json();
        const items = data?.collection?.items || [];
        // Drop items with no preview link.
        const filtered = items.filter((it) => it.links?.[0]?.href);
        const total = data?.collection?.metadata?.total_hits ?? filtered.length;
        const hasMore = page * PAGE_SIZE < total;
        return { results: filtered, hasMore };
      },
      mapResult: (raw) => {
        const preview = raw.links?.[0]?.href || '';
        const meta = raw.data?.[0] || {};
        const title = meta.title || meta.nasa_id || 'Untitled';
        const center = meta.center || '';
        return {
          id: `nasa:${meta.nasa_id || raw.href || preview}`,
          thumbUrl: preview,
          // NASA's hi-res original lives behind a separate asset/<id>
          // call (returns a JSON manifest with .tif / .jpg URLs). v1 keeps
          // the preview as fullUrl — good enough for canvas use.
          fullUrl: preview,
          attribution: center ? `NASA · ${center}` : title,
          name: `NASA · ${title}`,
        };
      },
    });
  },
};
