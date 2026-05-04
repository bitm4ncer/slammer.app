// Plugin registry — register, lookup, list. Same contract for Tools + Filters.

const plugins = new Map();

function validateManifest(p) {
  const errors = [];
  if (!p || typeof p !== 'object') errors.push('plugin must be an object');
  if (!p.id) errors.push('missing id');
  if (!p.name) errors.push('missing name');
  if (!['tool', 'filter', 'generator'].includes(p.type)) errors.push(`invalid type "${p.type}"`);
  if (typeof p.process !== 'function' && p.type !== 'generator') errors.push('missing process()');
  if (typeof p.renderUI !== 'function') errors.push('missing renderUI()');
  if (typeof p.defaultParams !== 'function') errors.push('missing defaultParams()');
  return errors;
}

export function registerPlugin(plugin) {
  const errors = validateManifest(plugin);
  if (errors.length) {
    console.error(`[plugin "${plugin?.id}"] invalid:`, errors);
    return false;
  }
  if (plugins.has(plugin.id)) {
    console.warn(`[plugin "${plugin.id}"] already registered, replacing`);
  }
  plugins.set(plugin.id, plugin);
  return true;
}

export function getPlugin(id) { return plugins.get(id) || null; }

export function listPlugins(filter = {}) {
  const all = Array.from(plugins.values());
  return all.filter((p) => {
    if (filter.type && p.type !== filter.type) return false;
    if (filter.category && p.category !== filter.category) return false;
    return true;
  });
}

export function makeEffectInstance(pluginId) {
  const p = getPlugin(pluginId);
  if (!p) return null;
  return {
    pluginId,
    params: p.defaultParams(),
  };
}
