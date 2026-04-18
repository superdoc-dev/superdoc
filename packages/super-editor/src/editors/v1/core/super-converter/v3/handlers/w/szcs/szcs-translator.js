import { createSingleIntegerPropertyHandler } from '@converter/v3/handlers/utils.js';
import { NodeTranslator } from '@translator';

/**
 * The NodeTranslator instance for the jc element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 314
 */
export const translator = NodeTranslator.from(createSingleIntegerPropertyHandler('w:szCs', 'fontSizeCs'));
