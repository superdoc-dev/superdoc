import { NodeTranslator } from '@translator';
import { createMeasurementPropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the tblW element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 455
 */
export const translator = NodeTranslator.from(createMeasurementPropertyHandler('w:tblW', 'tableWidth'));
