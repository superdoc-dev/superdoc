import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/w/endnoteReference/endnoteReference-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const endnoteReferenceHandlerEntity = generateV2HandlerEntity('endnoteReferenceHandler', translator);
