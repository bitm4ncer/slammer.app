// analytics — thin wrapper around Umami's window.umami.track().
//
// Design rules:
//
//   1. Never throw — analytics must not break the app. Every call is
//      wrapped in try/catch; if umami didn't load (blocked by ad-blocker,
//      offline, in dev without the script) calls are silent no-ops.
//
//   2. Privacy first. We track action types + counts, NEVER user
//      content (no filenames, no text contents, no image bytes, no
//      paths). Umami itself is cookieless and IP-anonymised.
//
//   3. Named functions over string event-names at call sites. Typos in
//      event names silently fragment the dashboard — by centralising
//      the names here, the linter / TypeScript / grep can catch
//      misspelled events.
//
//   4. Small payloads. Umami's event-data sidebar is searchable but
//      gets unwieldy past ~3 properties per event. Stick to one or two.
//
// Adding a new event: add a method on `track` below. Use existing event
// names where you can — fewer unique names = clearer dashboard.

function _send(name, data) {
  try {
    if (typeof window === 'undefined') return;
    const umami = window.umami;
    if (!umami || typeof umami.track !== 'function') return;
    if (data && typeof data === 'object') umami.track(name, data);
    else umami.track(name);
  } catch (_) {
    // analytics is best-effort — swallow.
  }
}

export const track = {
  // ---------- Core workflow ----------
  layerAdded(type) { _send('layer_added', { type: type || 'unknown' }); },
  effectAdded(effectId) { _send('effect_added', { effect: effectId || 'unknown' }); },
  toolSelected(tool) { _send('tool_selected', { tool: tool || 'unknown' }); },

  // ---------- Project lifecycle ----------
  projectSaved() { _send('project_saved'); },
  projectLoaded(source) { _send('project_loaded', { source: source || 'menu' }); },
  projectNew() { _send('project_new'); },
  projectImportedSlmr() { _send('project_imported_slmr'); },

  // ---------- Export ----------
  exported(format) { _send('export', { format: (format || 'png').toLowerCase() }); },

  // ---------- Plugins / shop ----------
  pluginOpened(pluginId) { _send('plugin_opened', { plugin: pluginId || 'unknown' }); },
  shopOpened() { _send('shop_opened'); },
  shopSpecimenViewed(specimenId) { _send('shop_specimen_viewed', { plugin: specimenId || 'unknown' }); },

  // ---------- PWA ----------
  pwaInstallClicked() { _send('pwa_install_clicked'); },
  pwaInstallAccepted() { _send('pwa_install_accepted'); },
  pwaInstallDismissed() { _send('pwa_install_dismissed'); },
};

export default track;
