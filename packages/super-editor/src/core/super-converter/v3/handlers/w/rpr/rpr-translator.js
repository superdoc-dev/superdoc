import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { basePropertyTranslators } from './property-translators.js';
import { translator as rPrChangeTranslator } from '../rPrChange';

// Property translators for w:rPr child elements
// Each translator handles a specific property of the run properties
/** @type {import('@translator').NodeTranslator[]} */
export const propertyTranslators = [...basePropertyTranslators, rPrChangeTranslator];

/**
 * The NodeTranslator instance for the w:rPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:rPr', 'runProperties', propertyTranslators),
);
