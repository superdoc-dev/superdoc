import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:rsid element.
 *
 * OOXML revision IDs are hex strings (e.g. '0045A23C'), not integers.
 *
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 638
 */
export const translator = NodeTranslator.from(createSingleAttrPropertyHandler('w:rsid'));
