import { NodeTranslator } from '@translator';
import { createSingleBooleanPropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the bidiVisual element.
 *
 * SD-3142: use the shared boolean handler so an explicit `w:val="0"` survives
 * the round trip as `<w:bidiVisual w:val="0"/>`. Per ECMA-376 §17.4.1 +
 * §17.17.4, explicit-false can override a style-cascade true; dropping it on
 * export silently flips the table visual direction on the next open.
 *
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 373
 */
export const translator = NodeTranslator.from(createSingleBooleanPropertyHandler('w:bidiVisual', 'rightToLeft'));
