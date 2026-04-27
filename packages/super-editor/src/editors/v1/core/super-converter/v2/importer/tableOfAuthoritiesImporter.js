import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/sd/tableOfAuthorities/tableOfAuthorities-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 *
 * Without this entry the V2 importer drops `<sd:tableOfAuthorities>`
 * elements (TOA fields). paragraphNodeImporter hoists the block but the
 * downstream node-list handler still requires a claimant; without it
 * the node is dropped.
 */
export const tableOfAuthoritiesEntity = generateV2HandlerEntity('tableOfAuthoritiesNodeHandler', translator);
