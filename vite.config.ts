/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // Set VITE_BASE=/GoMaxi/ when hosting under a sub-path (GitHub Pages); default '/' for Vercel/Netlify/local.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          map: ['leaflet', 'react-leaflet'],
          qr: ['qrcode.react', 'html5-qrcode'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    pool: 'forks',
    testTimeout: 30000,
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
