/**
 * PostCSS plugin that wraps each CSS file's top-level rules in `@layer <name> { ... }`.
 *
 * Multiple `@layer name { }` blocks with the same name merge into one cascade layer
 * per CSS spec, so wrapping per-file produces the same cascade behavior as wrapping
 * the whole bundle once.
 *
 * `@charset` and `@import` rules at the top of the file are preserved outside the
 * wrapper — per CSS spec they must appear before any other rule.
 */
module.exports = (opts = {}) => {
  const layerName = opts.layerName || 'superdoc';

  return {
    postcssPlugin: 'wrap-in-layer',
    Once(root, { AtRule }) {
      if (!root.nodes || root.nodes.length === 0) return;

      const preserved = [];
      const toWrap = [];
      let seenNonPreserved = false;
      for (const node of root.nodes) {
        if (
          !seenNonPreserved &&
          node.type === 'atrule' &&
          (node.name === 'charset' || node.name === 'import')
        ) {
          preserved.push(node);
        } else {
          seenNonPreserved = true;
          toWrap.push(node);
        }
      }

      if (toWrap.length === 0) return;

      if (
        toWrap.length === 1 &&
        toWrap[0].type === 'atrule' &&
        toWrap[0].name === 'layer' &&
        toWrap[0].params.trim() === layerName
      ) {
        return;
      }

      const layer = new AtRule({ name: 'layer', params: layerName });
      for (const node of toWrap) {
        node.remove();
        layer.append(node);
      }
      root.append(layer);
    },
  };
};

module.exports.postcss = true;
