// @ts-check
import { generateV2HandlerEntity } from '@converter/v3/handlers/utils.js';
import { translator as pictTranslator } from '@converter/v3/handlers/w/pict/pict-translator';

/**
 * @type {import("@converter/v2/importer/docxImporter").NodeHandlerEntry}
 */
export const pictNodeHandlerEntity = generateV2HandlerEntity('handlePictNode', pictTranslator);

export const handlePictNode = pictNodeHandlerEntity.handler;
