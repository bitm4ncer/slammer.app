// slammer.app — service worker.
//
// Minimal install handler so the app passes Chrome's PWA installability
// checks ("Add to Desktop"). Doesn't cache anything yet — every request
// passes through to the network. Future: cache-first for hashed assets
// in dist/assets/ (they're content-hashed so safe to cache forever),
// network-first for index.html (so a fresh deploy is reachable on next
// load), no-cache for fal.ai / Pexels / Unsplash / Met endpoints.
//
// Why a fetch listener at all even with no caching? Some browser engines
// (older Chrome, Firefox) still require a fetch handler to count the
// service worker towards "installable" criteria. The empty pass-through
// satisfies that without changing behaviour.

const VERSION = 'slammer-sw-v1';

self.addEventListener('install', () => {
  // Activate immediately on first install — no waiting for old tabs.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of every open tab right away so the standalone window
  // sees the new SW without a hard reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through. Don't intercept anything yet. The listener exists so
  // installability checks count this SW as "controlling".
  void event;
});

// Future hook: respond to messages from the page (e.g. "skipWaiting" on
// a new deploy, or "clearCaches" from the dev tools). No-op for now.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  void VERSION;
});
