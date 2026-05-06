// Unsplash panel plugin — search, favorites, folders.

import { createBrowsable } from '../_shared/browsable.js';
import { getSettings } from '../../../ui/settings-popup.js';
import './unsplash.css';

const PLUGIN_ID = 'unsplash';

export default {
  id: PLUGIN_ID,
  name: 'Unsplash',
  type: 'panel',
  icon: 'fa-camera',
  accent: '#FFFFFF',
  description: 'Search and import photos from Unsplash.',
  defaultParams() { return {}; },
  defaultGeometry() { return { w: 560, h: 680 }; },
  computeStatus(settings) {
    if (!settings.unsplashAccessKey) {
      return { kind: 'warn', text: 'Needs Unsplash access key' };
    }
    return null;
  },
  renderUI(container, ctx) {
    container.classList.add('unsplash-panel');
    createBrowsable({
      pluginId: PLUGIN_ID,
      container,
      ctx,
      apiKeyMissingMessage: 'Add your Unsplash Access Key in Settings → API Keys.',
      apiKeyConfigured: () => !!getSettings().unsplashAccessKey,
      landingHeadline: 'Search Unsplash for free high-quality photos',
      landingPlaceholder: 'Search Unsplash…',
      searchFn: async (query, page = 1) => {
        const key = getSettings().unsplashAccessKey;
        const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=24`;
        const res = await fetch(url, {
          headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
        });
        if (!res.ok) {
          if (res.status === 401) throw new Error('Invalid Unsplash key');
          throw new Error(`Unsplash ${res.status}`);
        }
        const data = await res.json();
        return { results: data.results || [], hasMore: (data.total_pages || 1) > page };
      },
      mapResult: (raw) => ({
        id: `unsplash:${raw.id}`,
        thumbUrl: raw.urls.small,
        fullUrl: raw.urls.regular,
        attribution: raw.user?.name ? `by ${raw.user.name}` : '',
        name: `Unsplash · ${raw.user?.name || raw.id}`,
        width: raw.width,
        height: raw.height,
      }),
    });
  },
};
