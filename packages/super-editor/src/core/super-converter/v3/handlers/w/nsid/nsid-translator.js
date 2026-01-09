import { NodeTranslator } from '@translator';
import { createSingleIntegerPropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:nsid element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 714
 */
export const translator = NodeTranslator.from(createSingleIntegerPropertyHandler('w:nsid'));
