// Pexels panel plugin — search, favorites, folders.

import { createBrowsable } from '../_shared/browsable.js';
import { getSettings } from '../../../ui/settings-popup.js';
import './pexels.css';

const PLUGIN_ID = 'pexels';

export default {
  id: PLUGIN_ID,
  name: 'Pexels',
  type: 'panel',
  icon: 'fa-images',
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
