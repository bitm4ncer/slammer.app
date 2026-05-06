// Unsplash panel plugin — search, favorites, folders.

import { createBrowsable } from '../_shared/browsable.js';
import { getSettings } from '../../../ui/settings-popup.js';
import './unsplash.css';

const PLUGIN_ID = 'unsplash';

export default {
  id: PLUGIN_ID,
  name: 'Unsplash',
  type: 'panel',
  iconHTML: '<svg width="1em" height="1em" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z" fill-rule="nonzero"/></svg>',
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
      landingTags: ['abstract texture', 'street photography', 'double exposure', 'abandoned places', 'macro nature', 'brutalist architecture', 'fog landscape', 'vintage film', 'neon signs', 'underwater', 'silhouette', 'long exposure'],
      landingQueries: ['texture', 'abstract', 'architecture', 'nature close up', 'urban night', 'film grain', 'moody portrait'],
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
