const wrapInLayer = require('../../scripts/postcss-plugins/wrap-in-layer.cjs');

module.exports = {
  plugins: [
    require('postcss-nested'),
    require('postcss-nested-import'),
    wrapInLayer({ layerName: 'superdoc' }),
  ],
};
