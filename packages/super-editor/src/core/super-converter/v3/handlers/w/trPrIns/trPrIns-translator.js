import { NodeTranslator } from '@translator';
import { createTrackChangesPropertyHandler } from '../../utils.js';

/**
 * The NodeTranslator instance for the w:ins element inside w:trPr.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(createTrackChangesPropertyHandler('w:ins', 'ins'));
