import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler, parseInteger, integerToString } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:outlineLvl element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 233
 */
export const translator = NodeTranslator.from(
  createSingleAttrPropertyHandler('w:outlineLvl', 'outlineLvl', 'w:val', parseInteger, integerToString),
);
