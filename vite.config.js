import { defineConfig } from 'vite';

// Production deploy is Cloudflare Pages at slammer-app.pages.dev (root
// domain). Use './' for both dev and build so the result is also openable
// from file:// or any subpath without breaking asset URLs. (Previously this
// was '/slammer.app/' for GitHub Pages project-site hosting — that
// produced broken absolute asset paths on the Cloudflare root domain.)
export default defineConfig(() => ({
  base: './',
  server: { port: 5173, open: false },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        // Split heavy third-party libs into stable chunks. They change rarely
        // compared to app code, so users get a cache hit on most deploys.
        // Chunks load in parallel with main so cold-load latency is unchanged
        // (or slightly improved on HTTP/2), but cache hit rate jumps.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/konva/')) return 'vendor-konva';
          if (id.includes('/paper/') || id.includes('paperjs-offset')) return 'vendor-paper';
          if (id.includes('/sortablejs/')) return 'vendor-sortable';
          if (id.includes('/fflate/')) return 'vendor-fflate';
          // (opentype.js + @fal-ai/client are already dynamic-imported and
          // get their own auto-named chunks — no manualChunks rule needed.)
        },
      },
    },
  },
  optimizeDeps: { include: ['fflate'] },
}));
