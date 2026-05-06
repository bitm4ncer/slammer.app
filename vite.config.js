import { defineConfig } from 'vite';

// GitHub Pages serves project sites under /<repo>/, so we need a base
// path of '/slammer.app/' for production builds. Dev keeps './' so the
// app can also be opened from file:// or any subpath.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/slammer.app/' : './',
  server: { port: 5173, open: false },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  optimizeDeps: { include: ['fflate'] },
}));
