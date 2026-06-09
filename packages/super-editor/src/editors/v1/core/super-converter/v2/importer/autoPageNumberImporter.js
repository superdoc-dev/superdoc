import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator as autoPageNumberTranslator } from '../../v3/handlers/sd/autoPageNumber/index.js';
import { translator as totalPageNumberTranslator } from '../../v3/handlers/sd/totalPageNumber/index.js';
import { translator as sectionPageCountTranslator } from '../../v3/handlers/sd/sectionPageCount/index.js';

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const autoPageHandlerEntity = generateV2HandlerEntity('autoPageNumberHandler', autoPageNumberTranslator);

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const autoTotalPageCountEntity = generateV2HandlerEntity('autoTotalPageCountEntity', totalPageNumberTranslator);

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const sectionPageCountEntity = generateV2HandlerEntity('sectionPageCountEntity', sectionPageCountTranslator);
