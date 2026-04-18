// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedArrayPropertyHandler } from '@converter/v3/handlers/utils.js';
import { translator as mcAlternateContentTranslator } from '../../mc/altermateContent';
import { translator as wTabTranslator } from '../tab';

// Property translators for w:tabs child elements
/** @type {import('@translator').NodeTranslatorConfig[]} */
const propertyTranslators = [mcAlternateContentTranslator, wTabTranslator];

/**
 * The NodeTranslator instance for the w:tabs element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedArrayPropertyHandler('w:tabs', 'tabStops', propertyTranslators, { skipRun: true }),
);
