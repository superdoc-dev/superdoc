import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/crossReference/crossReference-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const crossReferenceEntity = generateV2HandlerEntity('crossReferenceNodeHandler', translator);
