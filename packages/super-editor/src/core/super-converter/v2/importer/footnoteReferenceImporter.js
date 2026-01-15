import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/w/footnoteReference/footnoteReference-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const footnoteReferenceHandlerEntity = generateV2HandlerEntity('footnoteReferenceHandler', translator);

