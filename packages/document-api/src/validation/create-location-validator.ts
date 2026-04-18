import { DocumentApiValidationError } from '../errors.js';
import type { TocCreateLocation } from '../toc/toc.types.js';

/**
 * Validates create-location inputs that support only `at.target` for
 * `before`/`after` placement.
 *
 * Guards against missing or malformed `at` so callers always receive a
 * {@link DocumentApiValidationError} instead of a raw TypeError.
 */
const VALID_CREATE_LOCATION_KINDS = new Set<string>(['documentStart', 'documentEnd', 'before', 'after']);

export function validateTargetOnlyTocCreateLocation(at: TocCreateLocation, operationName: string): void {
  if (!at || typeof at !== 'object' || !('kind' in at)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${operationName} requires an 'at' create-location with a valid 'kind' property.`,
      { field: 'at', value: at },
    );
  }

  if (!VALID_CREATE_LOCATION_KINDS.has(at.kind)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${operationName} received an unsupported at.kind "${at.kind}". ` +
        `Valid values are: ${[...VALID_CREATE_LOCATION_KINDS].join(', ')}.`,
      { field: 'at.kind', value: at.kind },
    );
  }

  if (at.kind !== 'before' && at.kind !== 'after') return;

  const loc = at as { target?: unknown; nodeId?: unknown };
  if (loc.nodeId !== undefined) {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} requires at.target for before/after positioning. The nodeId form is not supported.`,
      { field: 'at.nodeId' },
    );
  }

  const target = loc.target as Record<string, unknown> | undefined;
  if (!target || target.kind !== 'block' || typeof target.nodeType !== 'string' || typeof target.nodeId !== 'string') {
    throw new DocumentApiValidationError(
      'INVALID_TARGET',
      `${operationName} with at.kind="${at.kind}" requires at.target to be a BlockNodeAddress.`,
      { field: 'at.target', value: loc.target },
    );
  }
}
