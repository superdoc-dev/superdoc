import { NodeTranslator } from '@translator';
import { createMeasurementPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:tcW element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 465
 */
export const translator = NodeTranslator.from(createMeasurementPropertyHandler('w:tcW', 'cellWidth'));
