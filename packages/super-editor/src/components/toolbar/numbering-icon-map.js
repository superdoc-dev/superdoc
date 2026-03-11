// @ts-check
import { numberingIcons } from './numbering-icons.js';

/**
 * Get the icon for a given numbering format
 * @param {string} numberingType - The numbering format key
 * @returns {string} The SVG icon for the format
 */
export function getNumberingIcon(numberingType) {
  return numberingIcons[numberingType] ?? numberingIcons.decimal;
}
