import { NodeTranslator } from '@translator';
import { createSingleIntegerPropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:numIdMacAtCleanup element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 720
 */
export const translator = NodeTranslator.from(createSingleIntegerPropertyHandler('w:numIdMacAtCleanup'));
