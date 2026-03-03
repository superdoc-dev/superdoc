// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { basePropertyTranslators } from './property-translators.js';
import { translator as wPPrChangeTranslator } from '../pPrChange';

// Property translators for w:pPr child elements
// Each translator handles a specific property of the paragraph properties
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [...basePropertyTranslators, wPPrChangeTranslator];

/**
 * The NodeTranslator instance for the w:pPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:pPr', 'paragraphProperties', propertyTranslators),
);
