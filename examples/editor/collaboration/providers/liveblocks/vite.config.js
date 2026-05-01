import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ensure only one Y.js copy is bundled across the app and dependencies.
    dedupe: ['yjs'],
  },
  server: {
    port: 3000,
  },
});
