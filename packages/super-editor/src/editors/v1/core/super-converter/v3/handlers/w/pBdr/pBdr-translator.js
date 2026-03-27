// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '@converter/v3/handlers/utils.js';
import { translator as mcAlternateContentTranslator } from '../../mc/altermateContent';
import { translator as wBarTranslator } from '../bar';
import { translator as wBetweenTranslator } from '../between';
import { translator as wBottom } from '../bottom';
import { translator as wLeft } from '../left';
import { translator as wRight } from '../right';
import { translator as wTop } from '../top';

// Property translators for w:pBdr child elements
// Each translator handles a specific property of the paragraph borders
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  mcAlternateContentTranslator,
  wBarTranslator,
  wBetweenTranslator,
  wBottom,
  wLeft,
  wRight,
  wTop,
];

/**
 * The NodeTranslator instance for the w:pBdr element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:pBdr', 'borders', propertyTranslators),
);
