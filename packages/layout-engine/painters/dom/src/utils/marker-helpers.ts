/**
 * Default tab interval in pixels (0.5 inch at 96 DPI).
 * Used when calculating tab stops for list markers that extend past the implicit tab stop.
 * This matches Microsoft Word's default tab interval behavior.
 */
const DEFAULT_TAB_INTERVAL_PX = 48;

/**
 * Compute the width of the tab separator between a list marker and its text content.
 *
 * Finds the next tab stop past `currentPos` (the x position after the marker text)
 * using explicit tab stops first, then falling back to default 48px intervals.
 * For hanging indents, an implicit tab stop is injected at `leftIndent`.
 *
 * @param currentPos - X position after the marker text ends (pixels)
 * @param justification - Marker justification ('left', 'right', or 'center')
 * @param tabs - Explicit tab stop positions in pixels
 * @param hangingIndent - Hanging indent in pixels
 * @param firstLineIndent - First line indent in pixels
 * @param leftIndent - Left indent in pixels (paraIndentLeft)
 * @returns Width of the tab separator in pixels
 */
export const computeTabWidth = (
  currentPos: number,
  justification: string,
  tabs: number[] | undefined,
  hangingIndent: number | undefined,
  firstLineIndent: number | undefined,
  leftIndent: number,
): number => {
  const nextDefaultTabStop = currentPos + DEFAULT_TAB_INTERVAL_PX - (currentPos % DEFAULT_TAB_INTERVAL_PX);
  let tabWidth: number;
  if (justification === 'left') {
    // Check for explicit tab stops past current position
    const explicitTabs = [...(tabs ?? [])];
    if (hangingIndent && hangingIndent > 0) {
      // Account for hanging indent by adding an implicit tab stop at leftIndent
      explicitTabs.push(leftIndent);
      explicitTabs.sort((a, b) => a - b);
    }
    let targetTabStop: number | undefined;

    for (const tab of explicitTabs) {
      if (tab > currentPos) {
        targetTabStop = tab;
        break;
      }
    }

    if (targetTabStop === undefined) {
      // Advance to next default 48px tab interval, matching Word behavior.
      targetTabStop = nextDefaultTabStop;
    }
    tabWidth = targetTabStop - currentPos;
  } else if (justification === 'right') {
    if (firstLineIndent != null && firstLineIndent > 0) {
      tabWidth = nextDefaultTabStop - currentPos;
    } else {
      tabWidth = hangingIndent ?? 0;
    }
  } else {
    tabWidth = nextDefaultTabStop - currentPos;
  }
  return tabWidth;
};
