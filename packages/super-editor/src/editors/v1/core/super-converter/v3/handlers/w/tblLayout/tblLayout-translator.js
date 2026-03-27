import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the tblLayout element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 436
 */
export const translator = NodeTranslator.from(createSingleAttrPropertyHandler('w:tblLayout', 'tableLayout', 'w:type'));
