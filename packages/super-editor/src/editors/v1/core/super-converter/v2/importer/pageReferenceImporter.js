import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/pageReference/index.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const pageReferenceEntity = generateV2HandlerEntity('pageReferenceNodeHandler', translator);
