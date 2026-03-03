import { NodeTranslator } from '@translator';
import { createTrackChangesPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:cellDel element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(createTrackChangesPropertyHandler('w:cellDel', 'cellDel'));
