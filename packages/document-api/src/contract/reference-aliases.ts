import type { OperationId } from './types.js';
import type { ReferenceGroupKey } from './operation-definitions.js';

/**
 * Convenience API aliases that are intentionally not canonical contract operations.
 *
 * These aliases exist on the runtime `DocumentApi` surface, but each one routes
 * to a canonical operation ID for schema/contract purposes.
 */
export interface ReferenceAliasDefinition {
  /** Public runtime member path (for example, `format.bold`). */
  memberPath: string;
  /** Canonical operation ID the alias delegates to. */
  canonicalOperationId: OperationId;
  /** Reference namespace where this alias should be listed. */
  referenceGroup: ReferenceGroupKey;
  /** Short customer-facing description used in generated docs. */
  description: string;
}

export const REFERENCE_OPERATION_ALIASES: readonly ReferenceAliasDefinition[] = [
  {
    memberPath: 'format.strikethrough',
    canonicalOperationId: 'format.strike',
    referenceGroup: 'format',
    description: 'Convenience alias for `format.strike` with `value: true`.',
  },
] as const;
