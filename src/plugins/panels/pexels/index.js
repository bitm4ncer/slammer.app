// Pexels panel plugin — search, favorites, folders.

import { createBrowsable } from '../_shared/browsable.js';
import { getSettings } from '../../../ui/settings-popup.js';
import './pexels.css';

const PLUGIN_ID = 'pexels';

export default {
  id: PLUGIN_ID,
  name: 'Pexels',
  type: 'panel',
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 3000 3000" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M0 1595.164V600C0 268.851 268.851 0 600 0h1800c331.149 0 600 268.851 600 600v1800c0 331.149-268.851 600-600 600h-986.952v-988.169h306.017c398.86 0 722.683-323.824 722.683-722.683 0-398.86-323.823-722.684-722.683-722.684-398.86 0-722.684 323.824-722.684 722.684v306.016H0zm996.381 1404.836H600c-331.149 0-600-268.851-600-600v-388.169h996.381V3000zm722.684-2016.869c168.895 0 306.017 137.121 306.017 306.017s-137.122 306.016-306.017 306.016h-306.017v-306.016c0-168.896 137.121-306.017 306.017-306.017z"/></svg>',
  accent: '#05A081',
  description: 'Search and import photos from Pexels.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus(settings) {
    if (!settings.pexelsApiKey) {
      return { kind: 'warn', text: 'Needs Pexels API key' };
    }
    return null;
  },
  renderUI(container, ctx) {
    container.classList.add('pexels-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: 'Add your Pexels API Key in Settings → API Keys.',
      apiKeyConfigured: () => !!getSettings().pexelsApiKey,
      landingHeadline: 'Search Pexels for free stock images',
      landingPlaceholder: 'Search Pexels…',
      landingTags: ['cinematic portrait', 'aerial landscape', 'neon city', 'golden hour', 'film noir', 'minimal architecture', 'ocean waves', 'desert road', 'moody forest', 'street fashion', 'cafe lifestyle', 'bokeh lights'],
      curatedFn: async (page = 1) => {
        const key = getSettings().pexelsApiKey;
        const url = `https://api.pexels.com/v1/curated?page=${page}&per_page=24`;
        const res = await fetch(url, { headers: { Authorization: key } });
        if (!res.ok) throw new Error(`Pexels ${res.status}`);
        const data = await res.json();
        return { results: data.photos || [], hasMore: !!data.next_page };
      },
      searchFn: async (query, page = 1) => {
        const key = getSettings().pexelsApiKey;
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=24`;
        const res = await fetch(url, { headers: { Authorization: key } });
        if (!res.ok) {
          if (res.status === 401) throw new Error('Invalid Pexels key');
          throw new Error(`Pexels ${res.status}`);
        }
        const data = await res.json();
        return { results: data.photos || [], hasMore: !!data.next_page };
      },
      mapResult: (raw) => ({
        id: `pexels:${raw.id}`,
        thumbUrl: raw.src.medium,
        fullUrl: raw.src.large2x || raw.src.large || raw.src.original,
        attribution: raw.photographer ? `by ${raw.photographer}` : '',
        name: `Pexels · ${raw.photographer || raw.id}`,
        width: raw.width,
        height: raw.height,
      }),
    });
  },
};
