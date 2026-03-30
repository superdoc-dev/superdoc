import { NodeTranslator } from '@translator';
import { createBorderPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:tl2br element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 468
 */
export const translator = NodeTranslator.from(createBorderPropertyHandler('w:tl2br'));
