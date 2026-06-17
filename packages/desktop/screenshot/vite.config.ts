import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Builds the desktop renderer against the mock window.connectty so it can be
// loaded in a headless Electron window for screenshots. Output is plain static
// files (base './') loadable over file://.
export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: './',
  build: {
    outDir: path.join(__dirname, '..', 'dist', 'screenshot'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  resolve: {
    alias: {
      '@connectty/shared': path.join(__dirname, '..', '..', 'shared', 'src'),
    },
  },
});
