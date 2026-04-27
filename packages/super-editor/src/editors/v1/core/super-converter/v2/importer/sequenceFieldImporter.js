import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/sequenceField/sequenceField-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 *
 * Without this entry the V2 importer drops `<sd:sequenceField>` elements:
 * `passthroughNodeImporter` defers when a V3 translator is registered for
 * the node name, but no other entity claimed the node afterwards, so the
 * handler reduce left consumed at 0 and the field was silently lost on
 * import. Mirrors the established pattern (crossReferenceEntity,
 * rawFieldEntity) used for every other typed sd:* field carrier.
 */
export const sequenceFieldEntity = generateV2HandlerEntity('sequenceFieldNodeHandler', translator);
