/**
 * @param {string} styleString
 * @returns {Object}
 */
export function parseInlineStyles(styleString) {
  if (!styleString) return {};
  return styleString
    .split(';')
    .filter((style) => !!style.trim())
    .reduce((acc, style) => {
      const [prop, value] = style.split(':').map((str) => str.trim());
      if (prop && value) acc[prop] = value;
      return acc;
    }, {});
}
