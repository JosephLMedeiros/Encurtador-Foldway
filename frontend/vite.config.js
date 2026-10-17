import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/* Em desenvolvimento o Vite faz o papel do nginx: /api e /r vão para a API.
   Suba a API com `docker compose up api` (porta 8080) ou aponte API_URL para outra. */
const api = process.env.API_URL ?? 'http://localhost:8080';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': api, '/r/': api },
  },
  test: {
    /* ambiente jsdom para simular o DOM do navegador */
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    /* globals: true expõe describe/it/expect globalmente, necessário para @testing-library/jest-dom */
    globals: true,
  },
});
