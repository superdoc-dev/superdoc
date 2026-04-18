import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler, parseInteger, integerToString } from '../../utils.js';

/**
 * The NodeTranslator instance for the gridBefore element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 396
 */
export const translator = NodeTranslator.from(
  createSingleAttrPropertyHandler(
    'w:gridBefore',
    null,
    'w:val',
    (v) => parseInteger(v) ?? undefined,
    (v) => integerToString(v),
  ),
);
