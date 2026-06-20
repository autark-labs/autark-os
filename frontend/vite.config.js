import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const backendUrl = process.env.PROJECT_OS_BACKEND_URL || process.env.VITE_PROJECT_OS_BACKEND_URL || 'http://localhost:8082';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': backendUrl,
    },
  },
});
