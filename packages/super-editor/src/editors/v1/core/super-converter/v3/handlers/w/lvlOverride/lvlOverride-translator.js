// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator, createIntegerAttributeHandler } from '@converter/v3/handlers/utils.js';
import { translator as wStartOverrideTranslator } from '../../w/startOverride';
import { translator as wLvlTranslator } from '../../w/lvl';

// Property translators for w:lvlOverride child elements
// Each translator handles a specific property
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [wStartOverrideTranslator, wLvlTranslator];

const attributeHandlers = [createIntegerAttributeHandler('w:ilvl')];

/**
 * The NodeTranslator instance for the w:lvlOverride element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:lvlOverride', 'lvlOverride', propertyTranslators, {}, attributeHandlers),
);
