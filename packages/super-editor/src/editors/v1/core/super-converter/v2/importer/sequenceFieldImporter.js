import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/sequenceField/sequenceField-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const sequenceFieldEntity = generateV2HandlerEntity('sequenceFieldNodeHandler', translator);
