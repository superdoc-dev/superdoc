// @ts-check
import { toolbarIcons } from './toolbarIcons.js';

/**
 * Get the icon for a given numbering format
 * Maps numbering format keys to their corresponding toolbar icons
 * @param {string} numberingType - The numbering format key
 * @returns {string} The SVG icon for the format
 */
export function getNumberingIcon(numberingType) {
  const iconMap = {
    decimalPlain: toolbarIcons.numberedListDecimalPlain,
    decimal: toolbarIcons.numberedListDecimal,
    decimalParen: toolbarIcons.numberedListDecimalParen,
    upperLetter: toolbarIcons.numberedListAlphaUpper,
    lowerLetter: toolbarIcons.numberedListAlphaLower,
    letterParen: toolbarIcons.numberedListAlphaLowerParen,
    upperRoman: toolbarIcons.numberedListRomanUpper,
    lowerRoman: toolbarIcons.numberedListRomanLower,
  };

  return iconMap[numberingType] || toolbarIcons.numberedListDecimal;
}
