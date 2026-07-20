import { defineConfig } from 'vite';

export default defineConfig({
  // Build configuration for standalone deployment
  build: {
    outDir: 'dist',
    // Ensure assets use relative paths for deployment anywhere
    assetsDir: 'assets',
    // Generate sourcemaps for debugging
    sourcemap: true,
  },
  // Base path - use './' for relative paths (works on any hosting)
  base: './',
});
