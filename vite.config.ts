import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // GitHub Pages site root: existing repo serves at /LetsHunt/, the
    // second repo at /letshunt/. Override per-repo with VITE_BASE, e.g.
    //   VITE_BASE=/letshunt/ npm run build
    base: process.env.VITE_BASE || '/LetsHunt/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['tesseract.js'],
    },
    build: {
      commonjsOptions: {
        include: [/tesseract\.js/, /node_modules/],
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // Ignore non-source directories. The Freebuff desktop client writes
        // SQLite WAL files under .freebuff/ every few seconds; without these
        // ignores Vite treats each write as a file change and hard-reloads
        // the page, kicking users out of the Map view (and hiding overlays
        // like the radar) before they can even render. Applied regardless of
        // the HMR toggle — the reload loop is a full page reload, not an
        // HMR-specific behavior.
        ignored: [
          '**/.freebuff/**',
          '**/.scratch/**',
          '**/.git/**',
          '**/fixes/**',
          '**/scripts/**',
          '**/forecast-batches/**',
          '**/dist/**',
        ],
      },
    },
  };
});
