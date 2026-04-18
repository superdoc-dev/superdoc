import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/tableOfContents/index.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const tableOfContentsHandlerEntity = generateV2HandlerEntity('tableOfContentsHandler', translator);
