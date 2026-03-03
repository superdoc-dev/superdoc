import { NodeTranslator } from '@translator';
import { createPropertyChangeTranslator } from '../../utils.js';
import { basePropertyTranslators } from '../rpr/property-translators.js';

/**
 * The NodeTranslator instance for the w:rPrChange element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createPropertyChangeTranslator('w:rPrChange', 'rPrChange', 'w:rPr', 'runProperties', basePropertyTranslators),
);
