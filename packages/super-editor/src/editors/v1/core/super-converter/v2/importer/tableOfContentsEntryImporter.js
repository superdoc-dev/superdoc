import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/tableOfContentsEntry/tableOfContentsEntry-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 *
 * Without this entry the V2 importer drops `<sd:tableOfContentsEntry>`
 * elements (TC fields). passthroughNodeImporter defers when a V3
 * translator is registered for the node name, but no other entity
 * claims the node afterwards.
 */
export const tableOfContentsEntryEntity = generateV2HandlerEntity('tableOfContentsEntryNodeHandler', translator);
