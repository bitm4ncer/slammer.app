// fal.ai client wrapper — uses @fal-ai/client which works directly in the
// browser. The user's API key lives in localStorage (slammer:settings.falaiApiKey).
//
// Notes on the "credentials exposed in the browser" warning:
// fal.ai's SDK warns whenever you call fal.config({ credentials }) in a browser
// context. That warning is correct for SaaS where ONE shared key serves many
// users — but slammer is a BYOK tool: each user pastes their OWN key, kept in
// their OWN localStorage, used in their OWN browser. The same model as a CLI.
// We dedupe config calls so the warning fires at most once per key change.

import { fal } from '@fal-ai/client';
import { getSettings } from '../../../ui/settings-popup.js';

export class FalConfigError extends Error {
  constructor(msg) { super(msg); this.name = 'FalConfigError'; }
}

export function isConfigured() {
  return !!getSettings().falaiApiKey;
}

let _configuredKey = null;
function ensureConfigured() {
  const key = getSettings().falaiApiKey;
  if (!key) throw new FalConfigError('fal.ai API key missing — set in Settings → API Keys');
  if (key === _configuredKey) return;  // already configured with this key
  fal.config({ credentials: key });
  _configuredKey = key;
}

export async function runModel({ modelId, input, signal, onQueueUpdate }) {
  ensureConfigured();
  const result = await fal.subscribe(modelId, {
    input,
    logs: true,
    onQueueUpdate: (update) => onQueueUpdate?.(update),
    abortSignal: signal,
  });
  return result;
}

// Extract image URLs from the response using a dot path.
//   'images[].url'  → result.data.images.map(x => x.url)
//   'image.url'     → [result.data.image.url]
//   'output[]'      → result.data.output (array of strings)
export function extractImageUrls(result, path = 'images[].url') {
  const data = result?.data ?? result;
  if (!data) return [];

  const segments = path.split('.');
  let current = data;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (current == null) return [];
    if (seg.endsWith('[]')) {
      const key = seg.slice(0, -2);
      const arr = key ? current[key] : current;
      if (!Array.isArray(arr)) return [];
      const rest = segments.slice(i + 1).join('.');
      if (!rest) return arr.filter((x) => typeof x === 'string');
      return arr.map((x) => getByPath(x, rest)).filter(Boolean);
    }
    current = current[seg];
  }
  if (typeof current === 'string') return [current];
  if (Array.isArray(current)) return current.filter((x) => typeof x === 'string');
  return [];
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// ----------------------------------------------------------------------------
// Account balance — GET https://rest.fal.ai/billing/user_balance.
// The dashboard hits this endpoint with a Bearer JWT, but the same endpoint
// also accepts public `Authorization: Key <key>` auth (verified — a fake key
// returns "No user found for Key ID and Secret", confirming the scheme).
// CORS is open. Response is a bare JSON number (e.g. `10.39`).
// ----------------------------------------------------------------------------

export async function getBalance() {
  const key = getSettings().falaiApiKey;
  if (!key) return null;
  try {
    const res = await fetch('https://rest.fal.ai/billing/user_balance', {
      headers: { Authorization: `Key ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    // The dashboard endpoint returns a bare JSON number. Parse defensively in
    // case fal.ai later switches to an object shape.
    const n = Number(text);
    if (Number.isFinite(n)) return n;
    try {
      const obj = JSON.parse(text);
      if (typeof obj === 'number') return obj;
      if (typeof obj?.balance === 'number') return obj.balance;
      if (typeof obj?.user_balance === 'number') return obj.user_balance;
    } catch {}
    return null;
  } catch {
    return null;
  }
}
