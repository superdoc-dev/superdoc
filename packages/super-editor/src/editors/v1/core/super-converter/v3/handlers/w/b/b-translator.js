import { NodeTranslator } from '@translator';
import { createStrictTogglePropertyHandler } from '@converter/v3/handlers/utils';

/**
 * The NodeTranslator instance for the w:b element.
 *
 * Uses strict ST_OnOff parsing to preserve the on/off/clear tri-state:
 * - ON: `<w:b/>` or `<w:b w:val="true|1|on"/>` → mark present, default attrs
 * - OFF: `<w:b w:val="false|0|off"/>` → mark present, `{ value: '0' }`
 * - CLEAR: element absent → no mark
 *
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 264
 */
export const translator = NodeTranslator.from(createStrictTogglePropertyHandler('w:b', 'bold'));
