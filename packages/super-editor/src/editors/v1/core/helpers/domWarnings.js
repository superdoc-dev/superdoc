/**
 * Log a standard warning when a DOM document is required but unavailable.
 *
 * @param {string} feature - Short description of the DOM-dependent feature.
 */
export const warnNoDOM = (feature = 'This feature') => {
  console.warn(
    `[super-editor] ${feature} requires a DOM document. ` +
      'This environment has no DOM. Provide a DOM (e.g., JSDOM) and set globalThis.document ' +
      'or pass { document } to the editor.',
  );
};
