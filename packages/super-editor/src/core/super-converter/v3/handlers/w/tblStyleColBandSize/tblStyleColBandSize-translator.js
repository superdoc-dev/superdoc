import { NodeTranslator } from '@translator';
import { createSingleIntegerPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the tblStyleColBandSize element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 657
 */
export const translator = NodeTranslator.from(
  createSingleIntegerPropertyHandler('w:tblStyleColBandSize', 'tableStyleColBandSize'),
);
