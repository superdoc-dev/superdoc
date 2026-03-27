import { NodeTranslator } from '@translator';
import { createBorderPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:between element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 197
 */
export const translator = NodeTranslator.from(createBorderPropertyHandler('w:between'));
