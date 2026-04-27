import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/rawField/rawField-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 *
 * Without this entry the V2 importer drops `<sd:rawField>` elements:
 * `passthroughNodeImporter` defers when a V3 translator is registered for
 * the node name, but if no V2 entity claims the node afterwards the
 * handler reduce leaves consumed at 0 and the node is silently lost.
 */
export const rawFieldEntity = generateV2HandlerEntity('rawFieldNodeHandler', translator);
