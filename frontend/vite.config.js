import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const backendUrl = process.env.AUTARK_OS_BACKEND_URL || process.env.VITE_AUTARK_OS_BACKEND_URL || 'http://localhost:8082';

function manualChunks(id) {
  const normalizedId = id.split(path.sep).join('/');

  if (!normalizedId.includes('/node_modules/')) {
    return undefined;
  }

  if (
    normalizedId.includes('/node_modules/react/') ||
    normalizedId.includes('/node_modules/react-dom/') ||
    normalizedId.includes('/node_modules/scheduler/')
  ) {
    return 'vendor-react';
  }

  if (
    normalizedId.includes('/node_modules/react-router/') ||
    normalizedId.includes('/node_modules/react-router-dom/') ||
    normalizedId.includes('/node_modules/@remix-run/router/')
  ) {
    return 'vendor-router';
  }

  if (normalizedId.includes('/node_modules/@tanstack/react-query/')) {
    return 'vendor-query';
  }

  return undefined;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
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
