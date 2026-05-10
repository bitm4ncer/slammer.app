// Victoria & Albert Museum — public collection API.
// No auth, CORS-friendly. ~1.4M objects from one of the world's largest
// museums of art, design, and performance.
//
// API:
//   GET  https://api.vam.ac.uk/v2/objects/search
//        ?q=<query>&images_exist=true&page=<n>&page_size=24&response_format=json
//   Response: { records: [{ systemNumber, _primaryTitle, _primaryDate,
//             _primaryMaker: { name }, _images: { _primary_thumbnail,
//             _iiif_image_base_url } }] }
//
// Image URLs:
//   thumbnail → record._images._primary_thumbnail
//   full      → `${_iiif_image_base_url}/full/!1024,1024/0/default.jpg`
// Both are CORS-friendly off the V&A's IIIF tile server (vanda.imageopen.com),
// so no proxy chain needed for fetch-into-canvas.

import { createBrowsable } from '../_shared/browsable.js';
import './vam.css';

const PLUGIN_ID = 'vam';
const SEARCH = 'https://api.vam.ac.uk/v2/objects/search';
const PAGE_SIZE = 24;

export default {
  id: PLUGIN_ID,
  name: 'V&A',
  type: 'panel',
  // Simplified V&A monogram — clean serif wordmark in currentColor so it
  // tints with the accent and stays legible at small icon sizes.
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><text x="16" y="22" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="13">V&amp;A</text></svg>',
  accent: '#9d2235',
  description: 'Search 1.4M+ objects from the Victoria & Albert Museum.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus() { return null; },

  renderUI(container, ctx) {
    container.classList.add('vam-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: '',
      apiKeyConfigured: () => true,
      landingHeadline: "Search the V&A's collection",
      landingPlaceholder: 'e.g. william morris, kimono, art deco poster…',
      landingTags: [
        'William Morris', 'Art Deco poster', 'Japanese kimono',
        'Renaissance jewellery', 'Victorian dress', 'Theatre costume',
        'Chinese ceramic', 'Wedgwood', 'Pre-Raphaelite', 'Delftware',
        'Persian carpet', 'Wallpaper sample',
      ],
      landingQueries: [
        'william morris textile', 'art deco poster', 'theatre costume design',
        'japanese woodblock print', 'arts and crafts', 'silver tea service',
        'gothic stained glass',
      ],
      searchFn: async (query, page = 1) => {
        const url = `${SEARCH}?q=${encodeURIComponent(query)}&images_exist=true&page=${page}&page_size=${PAGE_SIZE}&response_format=json`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`V&A ${res.status}`);
        const data = await res.json();
        const records = Array.isArray(data.records) ? data.records : [];
        // V&A returns `info.record_count` for the total; convert to hasMore.
        const total = data?.info?.record_count ?? records.length;
        const hasMore = page * PAGE_SIZE < total;
        return { results: records, hasMore };
      },
      mapResult: (raw) => {
        const thumb = raw._images?._primary_thumbnail || '';
        const iiif  = raw._images?._iiif_image_base_url || '';
        const full  = iiif ? `${iiif}/full/!1024,1024/0/default.jpg` : thumb;
        const maker = raw._primaryMaker?.name || raw._primaryArtistMakerPerson || '';
        const date  = raw._primaryDate ? ` (${raw._primaryDate})` : '';
        const title = raw._primaryTitle || raw.objectType || raw.systemNumber || 'Untitled';
        return {
          id: `vam:${raw.systemNumber}`,
          thumbUrl: thumb,
          fullUrl:  full,
          attribution: maker ? `by ${maker}${date}` : title,
          name: `V&A · ${title}`,
        };
      },
    });
  },
};
