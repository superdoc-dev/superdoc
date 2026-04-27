import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/authorityEntry/authorityEntry-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 *
 * Without this entry the V2 importer drops `<sd:authorityEntry>` elements
 * (TA fields). passthroughNodeImporter defers when a V3 translator is
 * registered for the node name, but no other entity claims the node
 * afterwards.
 */
export const authorityEntryEntity = generateV2HandlerEntity('authorityEntryNodeHandler', translator);
