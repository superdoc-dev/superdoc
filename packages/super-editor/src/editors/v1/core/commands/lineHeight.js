import { linesToTwips } from '@converter/helpers';

/**
 * Set line height
 * @category Command
 * @param {number} lineHeight Line height value (e.g., 1.5 for 1.5x line spacing)
 * @example
 * editor.commands.setLineHeight(1.5)
 */
export const setLineHeight =
  (lineHeight) =>
  ({ commands }) => {
    if (!lineHeight) return false;
    return commands.updateAttributes('paragraph', {
      'paragraphProperties.spacing.line': linesToTwips(lineHeight),
      'paragraphProperties.spacing.lineRule': 'auto',
    });
  };

/**
 * Remove line height
 * @category Command
 * @example
 * editor.commands.unsetLineHeight()
 * @note Reverts to default line spacing
 */
export const unsetLineHeight =
  () =>
  ({ commands }) => {
    return commands.resetAttributes(
      'paragraph',
      'paragraphProperties.spacing.line',
      'paragraphProperties.spacing.lineRule',
    );
  };
