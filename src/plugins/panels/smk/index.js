// SMK — Statens Museum for Kunst (Denmark's national gallery).
// 80k+ open works including Hammershøi, Skagen Painters, Danish Golden Age.
//
// API (no key):
//   GET https://api.smk.dk/api/v1/art/search
//        ?keys=<q>&filters=[has_image:true]&offset=<n>&rows=24&lang=en
//   Response: { items: [{ id, titles:[{title}], production:[{creator}],
//             image_thumbnail, image_native, object_number }], found }
//
// Note: filters value is a literal `[has_image:true]` string, not URL-encoded
// brackets — SMK's API parser rejects %5B/%5D for this param specifically.

import { createBrowsable } from '../_shared/browsable.js';
import './smk.css';

const PLUGIN_ID = 'smk';
const SEARCH = 'https://api.smk.dk/api/v1/art/search';
const PAGE_SIZE = 24;

export default {
  id: PLUGIN_ID,
  name: 'SMK',
  type: 'panel',
  // Stylised "SMK" wordmark — clean sans-serif in currentColor.
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><text x="16" y="22" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="11" letter-spacing="0.5">SMK</text></svg>',
  accent: '#c8102e',
  description: 'Search the Statens Museum for Kunst (Denmark) — 80k+ open works.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus() { return null; },

  renderUI(container, ctx) {
    container.classList.add('smk-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: '',
      apiKeyConfigured: () => true,
      landingHeadline: "Search SMK — Denmark's national gallery",
      landingPlaceholder: 'e.g. hammershøi interior, skagen beach, eckersberg…',
      landingTags: [
        'Hammershøi', 'Skagen Painters', 'Krøyer', 'Danish Golden Age',
        'Eckersberg', 'Modern Danish', 'Portrait miniature',
        'Landscape painting', 'Still life', 'Drawing', 'Print', 'Sculpture',
      ],
      landingQueries: [
        'hammershoi interior', 'skagen beach', 'eckersberg',
        'danish landscape', 'krøyer', 'modern danish',
      ],
      searchFn: async (query, page = 1) => {
        const offset = (page - 1) * PAGE_SIZE;
        // filters bracket syntax is rejected when URL-encoded — pass raw.
        const url = `${SEARCH}?keys=${encodeURIComponent(query)}&filters=[has_image:true]&offset=${offset}&rows=${PAGE_SIZE}&lang=en`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`SMK ${res.status}`);
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        const total = data.found ?? items.length;
        const hasMore = (offset + PAGE_SIZE) < total;
        return { results: items, hasMore };
      },
      mapResult: (raw) => {
        const thumb = raw.image_thumbnail || '';
        const full = raw.image_native || thumb;
        const title = raw.titles?.[0]?.title || raw.object_number || 'Untitled';
        const maker = raw.production?.[0]?.creator || '';
        return {
          id: `smk:${raw.id}`,
          thumbUrl: thumb,
          fullUrl: full,
          attribution: maker ? `by ${maker}` : title,
          name: `SMK · ${title}`,
        };
      },
    });
  },
};
