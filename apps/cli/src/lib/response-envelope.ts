import { RESPONSE_ENVELOPE_KEY } from '../cli/operation-hints.js';
import type { CliExposedOperationId } from '../cli/operation-set.js';
import { CliError } from './errors.js';

/**
 * Resolves the response envelope key for a doc-backed CLI operation, failing
 * closed if the hint table drifted from the operation set. The type system
 * requires RESPONSE_ENVELOPE_KEY to cover every CliExposedOperationId, but
 * apps/cli does not run `tsc --noEmit` in CI, so this is the runtime backstop.
 *
 * Callers MUST invoke this before any mutating step (opening the document,
 * running the operation, persisting state). Resolving late leaves on-disk
 * state advanced past an internal-error response.
 */
export function resolveResponseEnvelopeKey(operationId: CliExposedOperationId): string | null {
  if (!Object.prototype.hasOwnProperty.call(RESPONSE_ENVELOPE_KEY, operationId)) {
    throw new CliError(
      'OPERATION_HINT_MISSING',
      `Internal error: operation '${operationId}' has no RESPONSE_ENVELOPE_KEY entry. Add one in apps/cli/src/cli/operation-hints.ts.`,
    );
  }
  return RESPONSE_ENVELOPE_KEY[operationId];
}
