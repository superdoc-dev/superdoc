import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/citation/citation-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const citationEntity = generateV2HandlerEntity('citationNodeHandler', translator);
