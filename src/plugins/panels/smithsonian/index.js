// Smithsonian Open Access — 5M+ items across the Smithsonian's museums,
// archives, and research collections.
//
// API:
//   GET  https://api.si.edu/openaccess/api/v1.0/search
//        ?api_key=<KEY>&q=<query>&start=<offset>&rows=24
//   Response: { response: { rows: [{ id, title, content: {
//             descriptiveNonRepeating: { online_media: { media: [{
//             thumbnail, content }] } } } }], rowCount } }
//
// Image URLs:
//   thumbnail → record.content.descriptiveNonRepeating.online_media.media[0].thumbnail
//   full      → record.content.descriptiveNonRepeating.online_media.media[0].content
//
// Free key: edan.si.edu (no usage limits at the time of writing).

import { createBrowsable } from '../_shared/browsable.js';
import { getSettings } from '../../../ui/settings-popup.js';
import './smithsonian.css';

const PLUGIN_ID = 'smithsonian';
const SEARCH = 'https://api.si.edu/openaccess/api/v1.0/search';
const PAGE_SIZE = 24;

export default {
  id: PLUGIN_ID,
  name: 'Smithsonian',
  type: 'panel',
  // Geometric sunburst — twelve rays radiating from a centred dot. Reads
  // as the institution's iconic emblem at icon scale; pure currentColor.
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="3"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="16" y1="2" x2="16" y2="9"/><line x1="16" y1="23" x2="16" y2="30"/><line x1="2" y1="16" x2="9" y2="16"/><line x1="23" y1="16" x2="30" y2="16"/><line x1="6" y1="6" x2="11" y2="11"/><line x1="21" y1="21" x2="26" y2="26"/><line x1="6" y1="26" x2="11" y2="21"/><line x1="21" y1="11" x2="26" y2="6"/></g></svg>',
  accent: '#cfa547',
  description: 'Search 5M+ open-access objects from the Smithsonian.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus(settings) {
    if (!settings.smithsonianApiKey) {
      return { kind: 'warn', text: 'Needs Smithsonian API key' };
    }
    return null;
  },

  renderUI(container, ctx) {
    container.classList.add('smithsonian-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: 'Add your Smithsonian API key in Settings → Plugins. Free at edan.si.edu.',
      apiKeyConfigured: () => !!getSettings().smithsonianApiKey,
      landingHeadline: 'Search the Smithsonian Open Access collection',
      landingPlaceholder: 'e.g. dinosaur, lunar mission, presidential portrait…',
      landingTags: [
        'Dinosaur fossil', 'Hope diamond', 'Lunar mission',
        'Presidential portrait', 'Native American', 'Civil War',
        'Air & Space', 'Vintage poster', 'Botanical illustration',
        'Hubble image', 'Folk art', 'Smithsonian gardens',
      ],
      landingQueries: [
        'dinosaur skeleton', 'apollo mission', 'butterfly specimen',
        'civil war photograph', 'hubble nebula', 'native american beadwork',
        'vintage advertising poster',
      ],
      searchFn: async (query, page = 1) => {
        const apiKey = getSettings().smithsonianApiKey;
        if (!apiKey) throw new Error('Smithsonian API key missing');
        const start = (page - 1) * PAGE_SIZE;
        // online_media_type:Images filter restricts to records that have
        // a real image (Smithsonian indexes audio + 3D scans + transcripts
        // too — without this filter half the results have no thumbnail).
        const q = `${query} AND online_media_type:Images`;
        const url = `${SEARCH}?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&start=${start}&rows=${PAGE_SIZE}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
          if (res.status === 403 || res.status === 401) throw new Error('Invalid Smithsonian API key');
          throw new Error(`Smithsonian ${res.status}`);
        }
        const data = await res.json();
        const rows = data?.response?.rows || [];
        // Drop records whose first online-media entry has no thumbnail
        // (Smithsonian occasionally ships records with the type but no
        // accessible image URL — looks broken in the grid).
        const filtered = rows.filter((r) => {
          const m = r?.content?.descriptiveNonRepeating?.online_media?.media?.[0];
          return !!(m && m.thumbnail);
        });
        const total = data?.response?.rowCount ?? filtered.length;
        const hasMore = (start + PAGE_SIZE) < total;
        return { results: filtered, hasMore };
      },
      mapResult: (raw) => {
        const m = raw.content?.descriptiveNonRepeating?.online_media?.media?.[0] || {};
        const title = raw.title || raw.id || 'Untitled';
        // Some records carry a creator under indexedStructured.name (array).
        const creators = raw.content?.indexedStructured?.name;
        const maker = Array.isArray(creators) && creators.length ? creators[0] : '';
        return {
          id: `smithsonian:${raw.id}`,
          thumbUrl: m.thumbnail,
          fullUrl:  m.content || m.thumbnail,
          attribution: maker ? `by ${maker}` : title,
          name: `Smithsonian · ${title}`,
        };
      },
    });
  },
};
