import { NodeTranslator } from '@translator';
import { createSingleBooleanPropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:suppressAutoHyphens element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 251
 */
export const translator = NodeTranslator.from(createSingleBooleanPropertyHandler('w:suppressAutoHyphens'));
