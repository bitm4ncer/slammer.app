// Cleveland Museum of Art — Open Access API.
// 60k works total, 37k released CC0.
//
// API (no key):
//   GET https://openaccess-api.clevelandart.org/api/artworks
//        ?q=<q>&has_image=1&limit=24&skip=<n>&cc0=1
//   Response: { data: [{ id, title, creators:[{description}],
//             images: { web:{url}, print:{url}, full:{url} } }],
//             info: { total } }

import { createBrowsable } from '../_shared/browsable.js';
import './cleveland.css';

const PLUGIN_ID = 'cleveland';
const SEARCH = 'https://openaccess-api.clevelandart.org/api/artworks';
const PAGE_SIZE = 24;

export default {
  id: PLUGIN_ID,
  name: 'Cleveland Art',
  type: 'panel',
  // Stylised museum-column motif — two columns + roof line, currentColor.
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><path d="M4 11 L16 5 L28 11"/><line x1="4" y1="11" x2="28" y2="11"/><line x1="9" y1="13" x2="9" y2="25"/><line x1="23" y1="13" x2="23" y2="25"/><line x1="3" y1="27" x2="29" y2="27"/></svg>',
  accent: '#005ba6',
  description: 'Search the Cleveland Museum of Art — 60k+ works, 37k CC0 open access.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus() { return null; },

  renderUI(container, ctx) {
    container.classList.add('cleveland-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: '',
      apiKeyConfigured: () => true,
      landingHeadline: 'Search the Cleveland Museum of Art',
      landingPlaceholder: 'e.g. monet, japanese woodblock, medieval armor…',
      landingTags: [
        'Impressionism', 'Armor', 'Japanese print', 'African mask',
        'Pre-Columbian', 'Renaissance', 'Modern art', 'Egyptian',
        'Photography', 'Textile', 'Glass', 'Silver',
      ],
      landingQueries: [
        'monet', 'japanese woodblock', 'african sculpture',
        'medieval armor', 'renaissance painting', 'egyptian artifact',
      ],
      searchFn: async (query, page = 1) => {
        const skip = (page - 1) * PAGE_SIZE;
        const url = `${SEARCH}?q=${encodeURIComponent(query)}&has_image=1&limit=${PAGE_SIZE}&skip=${skip}&cc0=1`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Cleveland ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.data) ? data.data : [];
        // Drop items without a web image — has_image=1 is best-effort.
        const filtered = items.filter((it) => it.images?.web?.url);
        const total = data?.info?.total ?? filtered.length;
        const hasMore = (skip + PAGE_SIZE) < total;
        return { results: filtered, hasMore };
      },
      mapResult: (raw) => {
        const thumb = raw.images?.web?.url || '';
        const full = raw.images?.print?.url || raw.images?.web?.url || thumb;
        const title = raw.title || 'Untitled';
        const maker = raw.creators?.[0]?.description || '';
        return {
          id: `cleveland:${raw.id}`,
          thumbUrl: thumb,
          fullUrl: full,
          attribution: maker ? `by ${maker}` : title,
          name: `Cleveland · ${title}`,
        };
      },
    });
  },
};
