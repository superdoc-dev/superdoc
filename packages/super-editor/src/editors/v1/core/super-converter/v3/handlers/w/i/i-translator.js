import { NodeTranslator } from '@translator';
import { createStrictTogglePropertyHandler } from '@converter/v3/handlers/utils.js';
/**
 * The NodeTranslator instance for the w:i element.
 *
 * Uses strict ST_OnOff parsing to preserve the on/off/clear tri-state.
 *
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 282
 */
export const translator = NodeTranslator.from(createStrictTogglePropertyHandler('w:i', 'italic'));
