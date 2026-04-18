import { generateV2HandlerEntity } from '@converter/v3/handlers/utils.js';
import { translator as tableTranslator } from '@converter/v3/handlers/w/tbl/tbl-translator.js';

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const tableNodeHandlerEntity = generateV2HandlerEntity('tableNodeHandler', tableTranslator);
