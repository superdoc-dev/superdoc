import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/w/perm-end/index.js';

/**
 * @type {import("./docxImporter.js").NodeHandlerEntry}
 */
export const permEndHandlerEntity = generateV2HandlerEntity('permEndHandler', translator);

/**
 * Convenience wrapper for tests and legacy call sites to invoke the perm end node handler directly.
 * @param {import('./docxImporter.js').NodeHandlerParams} params
 * @returns {{ nodes: any[], consumed: number }}
 */
export const handlePermEndNode = (params) => permEndHandlerEntity.handler(params);
