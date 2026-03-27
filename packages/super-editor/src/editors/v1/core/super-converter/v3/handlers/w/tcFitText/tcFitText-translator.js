import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler, parseBoolean, booleanToString } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:tcFitText element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 460
 */
export const translator = NodeTranslator.from(
  createSingleAttrPropertyHandler(
    'w:tcFitText',
    null,
    'w:val',
    (v) => parseBoolean(v ?? 'true'),
    (v) => booleanToString(v),
  ),
);
