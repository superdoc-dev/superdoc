import { generateV2HandlerEntity } from '@core/super-converter/v3/handlers/utils';
import { translator } from '../../v3/handlers/w/r/index.js';

/**
 * @type {import("./docxImporter").NodeHandlerEntry}
 */
export const runNodeHandlerEntity = generateV2HandlerEntity('runNodeHandler', translator);

/**
 * Convenience wrapper for tests and legacy call sites to invoke the run node handler directly.
 * @param {import('./docxImporter').NodeHandlerParams} params
 * @returns {{ nodes: any[], consumed: number }}
 */
export const handleRunNode = (params) => runNodeHandlerEntity.handler(params);
