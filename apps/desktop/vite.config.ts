import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed dev port and hands the frontend its own env via TAURI_*.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // src-tauri is Rust; Vite must not try to watch it.
      ignored: ['**/src-tauri/**'],
    },
  },
  // Produce a build the Tauri bundler can embed.
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
