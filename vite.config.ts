import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./web'),
  plugins: [react(), tailwindcss()],
  build: { outDir: r('./web/dist'), emptyOutDir: true },
  server: {
    // Everything the editor needs comes from the Fastify server; Vite only serves the app
    // shell in dev. Proxying keeps the frontend's fetch URLs identical in dev and prod.
    proxy: {
      '/api': 'http://127.0.0.1:5178',
      '/files': 'http://127.0.0.1:5178',
    },
  },
});
