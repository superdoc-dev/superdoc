import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator as citationTranslator } from '../../v3/handlers/sd/citation/citation-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const citationHandlerEntity = generateV2HandlerEntity('citationHandler', citationTranslator);
