import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/w/hyperlink/index.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const hyperlinkNodeHandlerEntity = generateV2HandlerEntity('hyperlinkNodeHandler', translator);
