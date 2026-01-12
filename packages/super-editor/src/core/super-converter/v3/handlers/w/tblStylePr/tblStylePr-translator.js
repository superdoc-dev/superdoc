import { NodeTranslator } from '@translator';
import { translator as tblPrTranslator } from '@converter/v3/handlers/w/tblPr';
import { translator as tcPrTranslator } from '@converter/v3/handlers/w/tcPr';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';

/** @type {import('@translator').NodeTranslatorConfig[]} */
const propertyTranslators = [tblPrTranslator, tcPrTranslator];

/**
 * The NodeTranslator instance for the w:tblStylePr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:tblStylePr', 'tableStyleProperties', propertyTranslators),
);
