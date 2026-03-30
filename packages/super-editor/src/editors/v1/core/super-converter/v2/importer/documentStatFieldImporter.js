import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator as documentStatFieldTranslator } from '../../v3/handlers/sd/documentStatField/index.js';

/**
 * @type {import("docxImporter").NodeHandlerEntry}
 */
export const documentStatFieldHandlerEntity = generateV2HandlerEntity(
  'documentStatFieldHandler',
  documentStatFieldTranslator,
);
