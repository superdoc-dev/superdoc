import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator as bibliographyTranslator } from '../../v3/handlers/sd/bibliography/bibliography-translator.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const bibliographyHandlerEntity = generateV2HandlerEntity('bibliographyHandler', bibliographyTranslator);
