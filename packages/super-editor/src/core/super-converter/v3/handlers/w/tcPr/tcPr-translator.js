// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { basePropertyTranslators } from './property-translators.js';
import { translator as tcPrChangeTranslator } from '../tcPrChange';
import { translator as hMergeTranslator } from '../hMerge';
import { translator as cellInsTranslator } from '../cellIns';
import { translator as cellDelTranslator } from '../cellDel';
import { translator as cellMergeTranslator } from '../cellMerge';

// Property translators for w:tcPr child elements
// Each translator handles a specific property of the table cell
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  ...basePropertyTranslators,
  hMergeTranslator,
  cellInsTranslator,
  cellDelTranslator,
  cellMergeTranslator,
  tcPrChangeTranslator,
];

/**
 * The NodeTranslator instance for the w:tcPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:tcPr', 'tableCellProperties', propertyTranslators),
);
