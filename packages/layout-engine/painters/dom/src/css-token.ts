export type CssToken = {
  css: string;
  fallback: string;
};

/**
 * Creates a CSS variable token with a fallback value.
 * The `css` string is used in real browsers (supports var()).
 * The `fallback` is used in environments that don't (e.g., jsdom in tests).
 */
export const cssToken = (varName: string, fallback: string): CssToken => ({
  css: `var(${varName}, ${fallback})`,
  fallback,
});
