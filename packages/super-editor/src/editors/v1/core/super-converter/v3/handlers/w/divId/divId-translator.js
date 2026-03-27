import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the divId element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 391
 */
export const translator = NodeTranslator.from(createSingleAttrPropertyHandler('w:divId'));
