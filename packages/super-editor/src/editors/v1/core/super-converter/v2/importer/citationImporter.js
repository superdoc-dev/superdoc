import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/citation/citation-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 *
 * Without this entry the V2 importer drops `<sd:citation>` elements:
 * passthroughNodeImporter defers when a V3 translator is registered for
 * the node name, but no other entity claims the node afterwards. Mirrors
 * the established pattern used by every other typed sd:* field carrier.
 */
export const citationEntity = generateV2HandlerEntity('citationNodeHandler', translator);
