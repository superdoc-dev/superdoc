/**
 * Checks if a given font can be rendered on the browser.
 *
 * This function uses canvas text measurement to detect if a specific font is available
 * on the user's system. It compares the rendered width and height of a test string
 * using the specified font against a fallback font. If the dimensions differ, the
 * custom font is considered available.
 *
 * The function includes a secondary verification step that switches the fallback font
 * to handle edge cases where the browser's default font matches the font being tested
 * (e.g., testing for "Helvetica" when the browser uses Helvetica as the default
 * sans-serif font).
 *
 * @param {string} fontName - The name of the font to check for availability.
 *   This should be a valid CSS font-family name (e.g., 'Arial', 'Times New Roman', 'Roboto').
 * @param {string} [uiDisplayFallbackFont='sans-serif'] - The fallback font family to use
 *   for comparison. Typically 'sans-serif' or 'serif'. Defaults to 'sans-serif'.
 * @returns {boolean} True if the font can be rendered (is available on the system),
 *   false otherwise.
 *
 * @example
 * // Check if Arial is available
 * if (canRenderFont('Arial')) {
 *   console.log('Arial font is available');
 * }
 *
 * @example
 * // Check font availability with a custom fallback
 * if (canRenderFont('Times New Roman', 'serif')) {
 *   console.log('Times New Roman is available');
 * }
 */

export function canRenderFont(fontName, uiDisplayFallbackFont = 'sans-serif') {
  const _canRenderFont = (fontName, uiDisplayFallbackFont) => {
    // Create a canvas context to measure text
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    // Ensure the text baseline is top so we can properly measure the height.
    ctx.textBaseline = 'top';

    // A standard text string to measure
    const text = 'abcdefghijklmnopqrstuvwxyz0123456789';

    // Measure the text with a generic fallback font
    ctx.font = `72px ${uiDisplayFallbackFont}`;
    const initialTextMeasurement = ctx.measureText(text);
    const fallbackWidth = initialTextMeasurement.width;
    const fallbackHeight = initialTextMeasurement.actualBoundingBoxDescent;

    // Measure the text with given font
    ctx.font = `72px "${fontName}", ${uiDisplayFallbackFont}`;
    const customTextMeasurement = ctx.measureText(text);
    const customFontWidth = customTextMeasurement.width;
    const customFontHeight = customTextMeasurement.actualBoundingBoxDescent;

    // If the widths or height differ, the custom font should have been used.
    const isAvailable = customFontWidth !== fallbackWidth || customFontHeight !== fallbackHeight;
    return isAvailable;
  };

  if (_canRenderFont(fontName, uiDisplayFallbackFont)) {
    return true;
  }
  // This extra verification is for the case where the `fontName` is the actual fallback font.
  // If the browser renders Helvetica by default when the fallback is `sans-serif`, and the
  // font being tested here is also Helvetica, this would return `false` because the width
  // and height wouldn't change at all. To avoid that case, we check it again switching
  // the fallback font.
  const oppositeUiDisplayFallbackFont = uiDisplayFallbackFont === 'sans-serif' ? 'serif' : 'sans-serif';
  return _canRenderFont(fontName, oppositeUiDisplayFallbackFont);
}
