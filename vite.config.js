// Builds the live screen (dashboard/) into dashboard/dist, which the bot serves at http://localhost:DASHBOARD_PORT.
// `npm run dashboard:dev` serves it with hot reload and proxies the live event stream from a running bot.
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'dashboard',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'dashboard/src') } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/events': `http://localhost:${process.env.DASHBOARD_PORT ?? 3000}` } },
});
