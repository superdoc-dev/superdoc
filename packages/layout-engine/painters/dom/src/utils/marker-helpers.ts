/**
 * Default tab interval in pixels (0.5 inch at 96 DPI).
 * Used when calculating tab stops for list markers that extend past the implicit tab stop.
 * This matches Microsoft Word's default tab interval behavior.
 */
const DEFAULT_TAB_INTERVAL_PX = 48;

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
  if ((justification ?? 'left') === 'left') {
    // Check for explicit tab stops past current position
    const explicitTabs = [...(tabs ?? [])];
    if (hangingIndent && hangingIndent > 0) {
      // Account for hanging indent by adding an implicit tab stop at (left + hanging)
      const implicitTabPos = leftIndent; // paraIndentLeft already accounts for hanging
      explicitTabs.push(implicitTabPos);
      // Sort tab stops to maintain order
      explicitTabs.sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') {
          return a - b;
        }
        return 0;
      });
    }
    let targetTabStop: number | undefined;

    if (Array.isArray(explicitTabs) && explicitTabs.length > 0) {
      // Find the first tab stop that's past the current position
      for (const tab of explicitTabs) {
        if (typeof tab === 'number' && tab > currentPos) {
          targetTabStop = tab;
          break;
        }
      }
    }

    if (targetTabStop === undefined) {
      // advance to next default 48px tab interval, matching Word behavior.
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
