import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    /* ambiente jsdom para simular o DOM do navegador */
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    /* globals: true expõe describe/it/expect globalmente, necessário para @testing-library/jest-dom */
    globals: true,
  },
});
