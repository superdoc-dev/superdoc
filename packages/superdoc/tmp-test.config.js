import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const r = require.resolve('node-stdlib-browser/package.json');
console.log('RESOLVED', r);
export default defineConfig({ build: { lib: { entry: 'src/index.js', name: 'X' } } });
