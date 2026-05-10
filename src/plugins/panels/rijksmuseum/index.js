// Rijksmuseum — the Netherlands' national museum. ~800k objects, half
// digitised; Vermeer, Rembrandt, Delftware, Dutch Golden Age.
//
// API:
//   GET  https://www.rijksmuseum.nl/api/en/collection
//        ?key=<KEY>&q=<query>&p=<page1based>&ps=24&imgonly=true&culture=en
//   Response: { artObjects: [{ objectNumber, title, principalOrFirstMaker,
//             webImage: { url }, headerImage: { url } }], count }
//
// Image URLs:
//   thumbnail → artObject.webImage.url   (Rijks's CDN serves CORS-friendly)
//   full      → same URL — Rijks doesn't expose a separate hi-res endpoint
//               without going through IIIF; webImage.url is already
//               1024-on-long-edge for most records.
//
// Free key: register at data.rijksmuseum.nl. ~10k requests/day.

import { createBrowsable } from '../_shared/browsable.js';
import { getSettings } from '../../../ui/settings-popup.js';
import './rijksmuseum.css';

const PLUGIN_ID = 'rijksmuseum';
const SEARCH = 'https://www.rijksmuseum.nl/api/en/collection';
const PAGE_SIZE = 24;

export default {
  id: PLUGIN_ID,
  name: 'Rijksmuseum',
  type: 'panel',
  // Stylised "RM" serif monogram — the museum's identity is the wordmark
  // itself; an oversized serif ligature reads as Dutch heritage at icon
  // scale without lifting copyrighted glyphs verbatim.
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><text x="16" y="22" text-anchor="middle" font-family="Georgia, &quot;Times New Roman&quot;, serif" font-weight="700" font-size="14" letter-spacing="-0.5">RM</text></svg>',
  accent: '#bc1142',
  description: 'Search 800k+ objects from the Rijksmuseum, Amsterdam.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus(settings) {
    if (!settings.rijksmuseumApiKey) {
      return { kind: 'warn', text: 'Needs Rijksmuseum API key' };
    }
    return null;
  },

  renderUI(container, ctx) {
    container.classList.add('rijksmuseum-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: 'Add your Rijksmuseum API key in Settings → Plugins. Free at data.rijksmuseum.nl.',
      apiKeyConfigured: () => !!getSettings().rijksmuseumApiKey,
      landingHeadline: 'Search the Rijksmuseum collection',
      landingPlaceholder: 'e.g. vermeer, rembrandt, delftware…',
      landingTags: [
        'Vermeer', 'Rembrandt', 'Dutch Golden Age', 'Delftware',
        'The Night Watch', 'Self-portrait', 'Still life', 'Tulip',
        'Japanese print', 'Silver', 'Landscape painting', 'Portrait miniature',
      ],
      landingQueries: [
        'vermeer', 'rembrandt self portrait', 'delft blue',
        'dutch landscape', 'tulip mania', 'flower still life',
        'japanese woodblock',
      ],
      searchFn: async (query, page = 1) => {
        const apiKey = getSettings().rijksmuseumApiKey;
        if (!apiKey) throw new Error('Rijksmuseum API key missing');
        const url = `${SEARCH}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&p=${page}&ps=${PAGE_SIZE}&imgonly=true&culture=en`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) throw new Error('Invalid Rijksmuseum API key');
          throw new Error(`Rijksmuseum ${res.status}`);
        }
        const data = await res.json();
        const records = Array.isArray(data.artObjects) ? data.artObjects : [];
        const total = data?.count ?? records.length;
        const hasMore = page * PAGE_SIZE < total;
        return { results: records, hasMore };
      },
      mapResult: (raw) => {
        const url = raw.webImage?.url || raw.headerImage?.url || '';
        const title = raw.title || raw.longTitle || raw.objectNumber || 'Untitled';
        const maker = raw.principalOrFirstMaker || '';
        return {
          id: `rijksmuseum:${raw.objectNumber}`,
          thumbUrl: url,
          fullUrl:  url,
          attribution: maker ? `by ${maker}` : title,
          name: `Rijksmuseum · ${title}`,
        };
      },
    });
  },
};
