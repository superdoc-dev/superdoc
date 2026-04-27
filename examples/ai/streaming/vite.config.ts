import 'dotenv/config';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep the proxy target aligned with server.mjs so PORT overrides
// (in .env) move both sides together.
const API_PORT = Number(process.env.PORT || 8092);

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
});
