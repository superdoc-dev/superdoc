import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler, parseBoolean, booleanToString } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:hideMark element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 413
 */
export const translator = NodeTranslator.from(
  createSingleAttrPropertyHandler(
    'w:hideMark',
    null,
    'w:val',
    (v) => parseBoolean(v ?? 'true'),
    (v) => booleanToString(v),
  ),
);
