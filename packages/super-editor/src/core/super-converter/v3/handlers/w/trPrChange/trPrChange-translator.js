import { NodeTranslator } from '@translator';
import { createPropertyChangeTranslator } from '../../utils.js';
import { basePropertyTranslators } from '../trPr/property-translators.js';

/**
 * The NodeTranslator instance for the w:trPrChange element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createPropertyChangeTranslator('w:trPrChange', 'trPrChange', 'w:trPr', 'tableRowProperties', basePropertyTranslators),
);
