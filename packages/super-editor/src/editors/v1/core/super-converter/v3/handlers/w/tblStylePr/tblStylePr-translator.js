// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator, createAttributeHandler } from '@converter/v3/handlers/utils.js';

import { translator as wPPrTranslator } from '../../w/pPr';
import { translator as wRPrTranslator } from '../../w/rpr';
import { translator as wTblPrTranslator } from '../../w/tblPr';
import { translator as wTrPrTranslator } from '../../w/trPr';
import { translator as wTcPrTranslator } from '../../w/tcPr';

// Property translators for w:tblStylePr child elements
// Each translator handles a specific property
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [wPPrTranslator, wRPrTranslator, wTblPrTranslator, wTrPrTranslator, wTcPrTranslator];

const attributeHandlers = [createAttributeHandler('w:type')];

/**
 * The NodeTranslator instance for the w:tblStylePr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:tblStylePr', 'tableStyleProperties', propertyTranslators, {}, attributeHandlers),
);
