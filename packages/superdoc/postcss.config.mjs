import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wrapInLayer = require('../../scripts/postcss-plugins/wrap-in-layer.cjs');

export default {
  plugins: [
    (await import('postcss-nested')).default,
    wrapInLayer({ layerName: 'superdoc' }),
  ],
};
