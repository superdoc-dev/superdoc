import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: '/',
  resolve: {
    dedupe: ['react', 'react-dom'],
    ...(mode === 'development' && {
      alias: {
        '@superdoc-dev/esign': path.resolve(__dirname, '../src/index.tsx'),
      },
    }),
  },
  server: {
    proxy: {
      '/v1': {
        target: 'https://esign-demo-proxy-server-191591660773.us-central1.run.app',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}));
