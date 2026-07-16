import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator as tableOfAuthoritiesTranslator } from '../../v3/handlers/sd/tableOfAuthorities/tableOfAuthorities-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const tableOfAuthoritiesHandlerEntity = generateV2HandlerEntity(
  'tableOfAuthoritiesHandler',
  tableOfAuthoritiesTranslator,
);
