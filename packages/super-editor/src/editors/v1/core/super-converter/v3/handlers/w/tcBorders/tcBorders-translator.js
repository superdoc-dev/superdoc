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
import { translator as tl2brTranslator } from '@converter/v3/handlers/w/tl2br';
import { translator as tr2blTranslator } from '@converter/v3/handlers/w/tr2bl';

// Property translators for w:tcBorders child elements
// Each translator handles a specific border property of the table
/** @type {import('@translator').NodeTranslator[]} */
const propertyTranslators = [
  wTopTranslator,
  wStartTranslator,
  wLeftTranslator,
  wBottomTranslator,
  wEndTranslator,
  wRightTranslator,
  wInsideHTranslator,
  wInsideVTranslator,
  tl2brTranslator,
  tr2blTranslator,
];

/**
 * The NodeTranslator instance for the tcBorders element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 459
 */
export const translator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:tcBorders', 'borders', propertyTranslators),
);
