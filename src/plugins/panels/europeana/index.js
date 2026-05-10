// Europeana — aggregator API for 50M+ items from 4000+ European
// cultural institutions (museums, libraries, archives).
//
// API:
//   GET https://api.europeana.eu/record/v2/search.json
//        ?wskey=<KEY>&query=<q>&rows=24&start=<n>&media=true
//        &thumbnail=true&profile=rich
//   `start` is 1-BASED (not 0-based — quirk shared with old Solr APIs).
//   Response: { items: [{ id, title:[String], dcCreator:[String],
//             edmPreview:[String], edmIsShownBy:[String], guid }],
//             totalResults }
//
// Free instant key signup: pro.europeana.eu/get-api

import { createBrowsable } from '../_shared/browsable.js';
import { getSettings } from '../../../ui/settings-popup.js';
import './europeana.css';

const PLUGIN_ID = 'europeana';
const SEARCH = 'https://api.europeana.eu/record/v2/search.json';
const PAGE_SIZE = 24;

export default {
  id: PLUGIN_ID,
  name: 'Europeana',
  type: 'panel',
  // Pan-European motif — 12 small dots arranged in a circle, echoing the
  // EU flag's stars. currentColor so it tints with the accent.
  iconHTML: (() => {
    const dots = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const cx = (16 + Math.cos(angle) * 11).toFixed(2);
      const cy = (16 + Math.sin(angle) * 11).toFixed(2);
      dots.push(`<circle cx="${cx}" cy="${cy}" r="1.6"/>`);
    }
    return `<svg width="1em" height="1em" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${dots.join('')}</svg>`;
  })(),
  accent: '#0073e6',
  description: 'Search 50M+ items from 4000+ European cultural institutions.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus(settings) {
    if (!settings.europeanaApiKey) {
      return { kind: 'warn', text: 'Needs Europeana API key' };
    }
    return null;
  },

  renderUI(container, ctx) {
    container.classList.add('europeana-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: 'Add your Europeana API key in Settings → Plugins. Free instant signup at pro.europeana.eu/get-api.',
      apiKeyConfigured: () => !!getSettings().europeanaApiKey,
      landingHeadline: 'Search Europeana — 4000+ EU institutions',
      landingPlaceholder: 'e.g. van gogh, medieval manuscript, bauhaus poster…',
      landingTags: [
        'Van Gogh', 'Manuscripts', 'Vintage maps', 'Bauhaus',
        'Renaissance painting', 'Medieval', 'Photography archive',
        'Folk costume', 'Ancient pottery', 'Tapestry', 'Botanical',
        'Stained glass',
      ],
      landingQueries: [
        'van gogh', 'medieval manuscript', 'vintage map europe',
        'bauhaus poster', 'renaissance portrait', 'ancient mosaic',
      ],
      searchFn: async (query, page = 1) => {
        const apiKey = getSettings().europeanaApiKey;
        if (!apiKey) throw new Error('Europeana API key missing');
        // start is 1-based — page 1 → start=1, page 2 → start=25, etc.
        const start = (page - 1) * PAGE_SIZE + 1;
        const url = `${SEARCH}?wskey=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&rows=${PAGE_SIZE}&start=${start}&media=true&thumbnail=true&profile=rich`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) throw new Error('Invalid Europeana API key');
          throw new Error(`Europeana ${res.status}`);
        }
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];
        // Drop items with no preview thumbnail — Europeana sometimes
        // returns records that satisfy media=true via audio/video only.
        const filtered = items.filter((it) => it.edmPreview?.[0]);
        const total = data.totalResults ?? filtered.length;
        const hasMore = (start - 1 + PAGE_SIZE) < total;
        return { results: filtered, hasMore };
      },
      mapResult: (raw) => {
        const thumb = raw.edmPreview?.[0] || '';
        const full = raw.edmIsShownBy?.[0] || thumb;
        const title = raw.title?.[0] || raw.id || 'Untitled';
        const maker = raw.dcCreator?.[0] || '';
        return {
          id: `europeana:${raw.id}`,
          thumbUrl: thumb,
          fullUrl: full,
          attribution: maker ? `by ${maker}` : title,
          name: `Europeana · ${title}`,
        };
      },
    });
  },
};
