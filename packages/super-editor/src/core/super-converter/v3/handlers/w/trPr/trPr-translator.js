// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { basePropertyTranslators } from './property-translators.js';
import { translator as trPrChangeTranslator } from '../trPrChange';
import { translator as trPrInsTranslator } from '../trPrIns';
import { translator as trPrDelTranslator } from '../trPrDel';

// Property translators for w:trPr child elements
// Each translator handles a specific property of the table row
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [...basePropertyTranslators, trPrInsTranslator, trPrDelTranslator, trPrChangeTranslator];

/**
 * The NodeTranslator instance for the w:trPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:trPr', 'tableRowProperties', propertyTranslators),
);
