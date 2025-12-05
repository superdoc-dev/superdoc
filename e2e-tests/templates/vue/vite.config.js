import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    exclude: ['superdoc'],
  },
  resolve: {
    alias: {
      '@': 'superdoc/super-editor',
      '@superdoc': 'superdoc',
    },
  },
})
