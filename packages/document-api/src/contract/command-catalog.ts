import type { CommandCatalog, CommandStaticMetadata } from './types.js';
import { OPERATION_IDS, projectFromDefinitions } from './operation-definitions.js';

export const COMMAND_CATALOG: CommandCatalog = projectFromDefinitions((_id, entry) => entry.metadata);

/** Operation IDs whose catalog entry has `mutates: true`. */
export const MUTATING_OPERATION_IDS = OPERATION_IDS.filter((operationId) => COMMAND_CATALOG[operationId].mutates);

/**
 * Returns the static metadata for a given operation.
 *
 * @param operationId - A known operation identifier from the command catalog.
 * @returns The compile-time metadata describing idempotency, failure codes, throw policy, etc.
 */
export function getCommandMetadata(operationId: keyof typeof COMMAND_CATALOG): CommandStaticMetadata {
  return COMMAND_CATALOG[operationId];
}
