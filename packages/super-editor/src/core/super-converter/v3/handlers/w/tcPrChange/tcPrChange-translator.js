import { NodeTranslator } from '@translator';
import { createPropertyChangeTranslator } from '../../utils.js';
import { basePropertyTranslators } from '../tcPr/property-translators.js';

/**
 * The NodeTranslator instance for the w:tcPrChange element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createPropertyChangeTranslator(
    'w:tcPrChange',
    'tcPrChange',
    'w:tcPr',
    'tableCellProperties',
    basePropertyTranslators,
  ),
);
