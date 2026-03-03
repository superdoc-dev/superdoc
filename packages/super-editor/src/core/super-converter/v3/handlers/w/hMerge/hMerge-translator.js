import { NodeTranslator } from '@translator';
import { createSingleAttrPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:hMerge element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createSingleAttrPropertyHandler('w:hMerge', null, 'w:val', (val) => (!val ? 'continue' : val)),
);
