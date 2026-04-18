import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:textboxTightWrap element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 257
 */
export const translator = NodeTranslator.from(createSingleAttrPropertyHandler('w:textboxTightWrap'));
