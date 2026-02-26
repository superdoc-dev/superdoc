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
    memberPath: 'format.bold',
    canonicalOperationId: 'format.apply',
    referenceGroup: 'format',
    description: 'Convenience alias for `format.apply` with `inline.bold: true`.',
  },
  {
    memberPath: 'format.italic',
    canonicalOperationId: 'format.apply',
    referenceGroup: 'format',
    description: 'Convenience alias for `format.apply` with `inline.italic: true`.',
  },
  {
    memberPath: 'format.underline',
    canonicalOperationId: 'format.apply',
    referenceGroup: 'format',
    description: 'Convenience alias for `format.apply` with `inline.underline: true`.',
  },
  {
    memberPath: 'format.strikethrough',
    canonicalOperationId: 'format.apply',
    referenceGroup: 'format',
    description: 'Convenience alias for `format.apply` with `inline.strike: true`.',
  },
] as const;
