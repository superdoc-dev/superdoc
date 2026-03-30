// @ts-check
import { NodeTranslator } from '@translator';
import { createNestedArrayPropertyHandler } from '@converter/v3/handlers/utils.js';
import { translator as headerTranslator } from '../header';

/**
 * The NodeTranslator instance for the w:headers element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(
  createNestedArrayPropertyHandler('w:headers', 'headers', [headerTranslator]),
);
