import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator as indexTranslator } from '../../v3/handlers/sd/index/index.js';
import { translator as indexEntryTranslator } from '../../v3/handlers/sd/indexEntry/index.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const indexHandlerEntity = generateV2HandlerEntity('indexHandler', indexTranslator);

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const indexEntryHandlerEntity = generateV2HandlerEntity('indexEntryHandler', indexEntryTranslator);
