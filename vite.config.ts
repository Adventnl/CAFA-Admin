import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    // wrangler.jsonc serves this directory as the Worker's static assets.
    outDir: 'dist',
    emptyOutDir: true,
  },
});
