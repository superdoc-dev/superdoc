import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        // Output workers as separate files, not inline base64
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
