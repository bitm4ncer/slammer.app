// Local-only loader for premium plugins under development.
//
// Premium plugins live in `src/plugins/premium/<id>/index.js` and are
// gitignored — they are not part of the public AGPL distribution. This
// loader uses Vite's `import.meta.glob` to discover them on disk during
// dev and is a no-op in production builds.
//
// Once the Bitmancer Library shop ships (roadmap Phase 28), production
// loading happens dynamically via license-gated downloads from Cloudflare
// R2 — this dev loader stays only as the local development convenience.
//
// To add a premium plugin locally:
//
//   1. mkdir src/plugins/premium/<plugin-id>
//   2. Create src/plugins/premium/<plugin-id>/index.js
//   3. Default-export a manifest with the same shape as a free plugin
//      (id, name, type, process / processPaths, renderUI, defaultParams).
//      Add a `category: 'Premium'` so it groups together in the Effects
//      add menu, or whatever category you want it filed under.
//   4. Restart `npm run dev` (Vite's glob resolves at module-graph build
//      time, so new entries appear after a dev-server restart).
//
// Versioning:
// `src/plugins/premium/` is gitignored from the public repo. Initialise a
// separate git repo INSIDE that folder to track premium plugin source:
//   cd src/plugins/premium
//   git init
//   git remote add origin <your private bitmancer-plugins repo>
// VS Code happily handles two git contexts in the same window.
//
// Why dev-only:
// During Cloudflare Pages CI builds the premium folder doesn't exist
// (it's gitignored, not in the public repo), so the glob resolves empty
// regardless. The `import.meta.env.DEV` gate is belt-and-braces — it
// also prevents premium plugins from leaking into a local prod build
// (`npm run build`) on the maintainer's machine.

import { registerPlugin } from './registry.js';

export function registerPremiumPluginsForDev() {
  if (!import.meta.env.DEV) return 0;
  const modules = import.meta.glob('./premium/*/index.js', { eager: true });
  let count = 0;
  for (const path in modules) {
    const manifest = modules[path]?.default;
    if (!manifest) {
      console.warn(`[premium-loader] ${path}: no default export, skipping`);
      continue;
    }
    if (registerPlugin(manifest)) count += 1;
  }
  if (count > 0) {
    console.log(`[premium-loader] registered ${count} premium plugin(s) (dev only)`);
  }
  return count;
}
