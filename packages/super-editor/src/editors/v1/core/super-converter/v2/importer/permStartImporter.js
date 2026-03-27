import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/w/perm-start/index.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const permStartHandlerEntity = generateV2HandlerEntity('permStartHandler', translator);

/**
 * Convenience wrapper for tests and legacy call sites to invoke the perm start node handler directly.
 * @param {import('./docxImporter').NodeHandlerParams} params
 * @returns {{ nodes: any[], consumed: number }}
 */
export const handlePermStartNode = (params) => permStartHandlerEntity.handler(params);
