// @ts-check
import { numberingIcons } from './numbering-icons.js';

/**
 * Get the icon for a given numbering format
 * Maps numbering format keys to their corresponding icons
 * @param {string} numberingType - The numbering format key
 * @returns {string} The SVG icon for the format
 */
export function getNumberingIcon(numberingType) {
  const iconMap = {
    decimalPlain: numberingIcons.decimalPlain,
    decimal: numberingIcons.decimal,
    decimalParen: numberingIcons.decimalParen,
    upperLetter: numberingIcons.upperLetter,
    lowerLetter: numberingIcons.lowerLetter,
    letterParen: numberingIcons.letterParen,
    upperRoman: numberingIcons.upperRoman,
    lowerRoman: numberingIcons.lowerRoman,
  };

  return iconMap[numberingType] || numberingIcons.decimal;
}
