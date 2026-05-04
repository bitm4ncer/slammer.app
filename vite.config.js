import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
});
