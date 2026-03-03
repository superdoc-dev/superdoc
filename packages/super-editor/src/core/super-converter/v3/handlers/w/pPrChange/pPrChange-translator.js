import { NodeTranslator } from '@translator';
import { createPropertyChangeTranslator } from '../../utils.js';
import { basePropertyTranslators } from '../pPr/property-translators.js';

/**
 * The NodeTranslator instance for the w:pPrChange element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createPropertyChangeTranslator('w:pPrChange', 'pPrChange', 'w:pPr', 'paragraphProperties', basePropertyTranslators),
);
