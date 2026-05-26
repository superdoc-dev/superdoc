import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/tableOfContentsEntry/tableOfContentsEntry-translator.js';

/**
 * Bridges the v3 `sd:tableOfContentsEntry` translator into the v2 node-list
 * pipeline so TC fields synthesized by `tc-preprocessor` are materialized as
 * PM `tableOfContentsEntry` nodes during import.
 *
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const tableOfContentsEntryEntity = generateV2HandlerEntity('tableOfContentsEntryNodeHandler', translator);
