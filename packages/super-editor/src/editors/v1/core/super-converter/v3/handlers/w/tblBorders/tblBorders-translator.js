import { NodeTranslator } from '@translator';
import { createNestedPropertiesTranslator } from '../../utils.js';
import { translator as wBottomTranslator } from '../bottom';
import { translator as wEndTranslator } from '../end';
import { translator as wInsideHTranslator } from '../insideH';
import { translator as wInsideVTranslator } from '../insideV';
import { translator as wLeftTranslator } from '../left';
import { translator as wRightTranslator } from '../right';
import { translator as wStartTranslator } from '../start';
import { translator as wTopTranslator } from '../top';

// Property translators for w:tblBorders child elements
// Each translator handles a specific border property of the table
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  wBottomTranslator,
  wEndTranslator,
  wInsideHTranslator,
  wInsideVTranslator,
  wLeftTranslator,
  wRightTranslator,
  wStartTranslator,
  wTopTranslator,
];

/**
 * The NodeTranslator instance for the tblBorders element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 422
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:tblBorders', 'borders', propertyTranslators),
);
