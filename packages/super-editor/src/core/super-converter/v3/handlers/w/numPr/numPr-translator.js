// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { translator as mcAlternateContentTranslator } from '../../mc/altermateContent';
import { translator as wIlvlTranslator } from '../ilvl';
import { translator as wInsTranslator } from '../ins';
import { translator as wNumIdTranslator } from '../numId';

// Property translators for w:numPr child elements
// Each translator handles a specific property of the numbering properties
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [mcAlternateContentTranslator, wIlvlTranslator, wInsTranslator, wNumIdTranslator];

/**
 * The NodeTranslator instance for the w:numPr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:numPr', 'numberingProperties', propertyTranslators),
);
