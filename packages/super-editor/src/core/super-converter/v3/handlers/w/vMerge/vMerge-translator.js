import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:vMerge element.
 * @type {import('@translator').NodeTranslator}
 * @see {@link https://ecma-international.org/publications-and-standards/standards/ecma-376/} "Fundamentals And Markup Language Reference", page 479
 */
export const translator = NodeTranslator.from(
  createSingleAttrPropertyHandler('w:vMerge', null, 'w:val', (val) => (!val ? 'continue' : val)),
);
