import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler, integerToString, parseInteger } from '../../utils.js';

/**
 * The NodeTranslator instance for the gridCol element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 398
 */
export const translator = NodeTranslator.from(
  createSingleAttrPropertyHandler('w:gridCol', 'col', 'w:w', parseInteger, integerToString),
);
