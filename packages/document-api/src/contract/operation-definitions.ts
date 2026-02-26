/**
 * Canonical operation definitions — single source of truth for keys, metadata, and paths.
 *
 * Every operation in the Document API is defined exactly once here.
 * All downstream artifacts (COMMAND_CATALOG, OPERATION_MEMBER_PATH_MAP,
 * OPERATION_REFERENCE_DOC_PATH_MAP, REFERENCE_OPERATION_GROUPS) are
 * projected from this object.
 *
 * ## Adding a new operation
 *
 * 1. **Here** (`operation-definitions.ts`) — add an entry to `OPERATION_DEFINITIONS`
 *    with `memberPath`, `metadata`, `referenceDocPath`, and `referenceGroup`.
 * 2. **`operation-registry.ts`** — add a type entry (`input`, `options`, `output`).
 *    The bidirectional `Assert` checks will error until this is done.
 * 3. **`invoke.ts`** (`buildDispatchTable`) — add a one-line dispatch entry calling
 *    the API method. `TypedDispatchTable` will error until this is done.
 * 4. **Implement** — the API method on `DocumentApi` + its adapter.
 *
 * That's 4 touch points. The catalog, maps, and reference docs are derived
 * automatically. If you forget step 1 or 2, compile-time assertions fail.
 * If you forget step 3, the `TypedDispatchTable` mapped type errors.
 *
 * Import DAG: this file imports only from `metadata-types.ts` and
 * `../types/receipt.js` — no contract-internal circular deps.
 */

import type { ReceiptFailureCode } from '../types/receipt.js';
import type { CommandStaticMetadata, OperationIdempotency, PreApplyThrowCode } from './metadata-types.js';

// ---------------------------------------------------------------------------
// Reference group key
// ---------------------------------------------------------------------------

export type ReferenceGroupKey =
  | 'core'
  | 'blocks'
  | 'capabilities'
  | 'create'
  | 'format'
  | 'lists'
  | 'comments'
  | 'trackChanges'
  | 'query'
  | 'mutations';

// ---------------------------------------------------------------------------
// Entry shape
// ---------------------------------------------------------------------------

export interface OperationDefinitionEntry {
  memberPath: string;
  description: string;
  requiresDocumentContext: boolean;
  metadata: CommandStaticMetadata;
  referenceDocPath: string;
  referenceGroup: ReferenceGroupKey;
}

// ---------------------------------------------------------------------------
// Metadata helpers (moved from command-catalog.ts)
// ---------------------------------------------------------------------------

const NONE_FAILURES: readonly ReceiptFailureCode[] = [];
const NONE_THROWS: readonly PreApplyThrowCode[] = [];

function readOperation(
  options: {
    idempotency?: OperationIdempotency;
    throws?: readonly PreApplyThrowCode[];
    deterministicTargetResolution?: boolean;
    remediationHints?: readonly string[];
  } = {},
): CommandStaticMetadata {
  return {
    mutates: false,
    idempotency: options.idempotency ?? 'idempotent',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: NONE_FAILURES,
    throws: {
      preApply: options.throws ?? NONE_THROWS,
      postApplyForbidden: true,
    },
    deterministicTargetResolution: options.deterministicTargetResolution ?? true,
    remediationHints: options.remediationHints,
  };
}

function mutationOperation(options: {
  idempotency: OperationIdempotency;
  supportsDryRun: boolean;
  supportsTrackedMode: boolean;
  possibleFailureCodes: readonly ReceiptFailureCode[];
  throws: readonly PreApplyThrowCode[];
  deterministicTargetResolution?: boolean;
  remediationHints?: readonly string[];
}): CommandStaticMetadata {
  return {
    mutates: true,
    idempotency: options.idempotency,
    supportsDryRun: options.supportsDryRun,
    supportsTrackedMode: options.supportsTrackedMode,
    possibleFailureCodes: options.possibleFailureCodes,
    throws: {
      preApply: options.throws,
      postApplyForbidden: true,
    },
    deterministicTargetResolution: options.deterministicTargetResolution ?? true,
    remediationHints: options.remediationHints,
  };
}

// Throw-code shorthand arrays
const T_NOT_FOUND = ['TARGET_NOT_FOUND'] as const;
const T_NOT_FOUND_CAPABLE = ['TARGET_NOT_FOUND', 'CAPABILITY_UNAVAILABLE'] as const;

// Plan-engine throw-code arrays
const T_PLAN_ENGINE = [
  'REVISION_MISMATCH',
  'MATCH_NOT_FOUND',
  'AMBIGUOUS_MATCH',
  'STYLE_CONFLICT',
  'PRECONDITION_FAILED',
  'INVALID_INPUT',
  'CROSS_BLOCK_MATCH',
  'SPAN_FRAGMENTED',
  'TARGET_MOVED',
  'PLAN_CONFLICT_OVERLAP',
  'INVALID_STEP_COMBINATION',
  'CAPABILITY_UNAVAILABLE',
] as const;

const T_QUERY_MATCH = ['MATCH_NOT_FOUND', 'AMBIGUOUS_MATCH', 'INVALID_INPUT', 'INTERNAL_ERROR'] as const;

// ---------------------------------------------------------------------------
// Canonical definitions
// ---------------------------------------------------------------------------

export const OPERATION_DEFINITIONS = {
  find: {
    memberPath: 'find',
    description: 'Search the document for nodes matching type, text, or attribute criteria.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['CAPABILITY_UNAVAILABLE', 'INVALID_INPUT'],
      deterministicTargetResolution: false,
    }),
    referenceDocPath: 'find.mdx',
    referenceGroup: 'core',
  },
  getNode: {
    memberPath: 'getNode',
    description: 'Retrieve a single node by target position.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'get-node.mdx',
    referenceGroup: 'core',
  },
  getNodeById: {
    memberPath: 'getNodeById',
    description: 'Retrieve a single node by its unique ID.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'get-node-by-id.mdx',
    referenceGroup: 'core',
  },
  getText: {
    memberPath: 'getText',
    description: 'Extract the plain-text content of the document.',
    requiresDocumentContext: true,
    metadata: readOperation(),
    referenceDocPath: 'get-text.mdx',
    referenceGroup: 'core',
  },
  info: {
    memberPath: 'info',
    description: 'Return document metadata including revision, node count, and capabilities.',
    requiresDocumentContext: true,
    metadata: readOperation(),
    referenceDocPath: 'info.mdx',
    referenceGroup: 'core',
  },

  insert: {
    memberPath: 'insert',
    description: 'Insert text or inline content at a target position.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'insert.mdx',
    referenceGroup: 'core',
  },
  replace: {
    memberPath: 'replace',
    description: 'Replace content at a target position with new text or inline content.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'replace.mdx',
    referenceGroup: 'core',
  },
  delete: {
    memberPath: 'delete',
    description: 'Delete content at a target position.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'delete.mdx',
    referenceGroup: 'core',
  },

  'blocks.delete': {
    memberPath: 'blocks.delete',
    description: 'Delete an entire block node (paragraph, heading, list item, table, image, or sdt) deterministically.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: NONE_FAILURES,
      throws: [
        'TARGET_NOT_FOUND',
        'AMBIGUOUS_TARGET',
        'CAPABILITY_UNAVAILABLE',
        'INVALID_TARGET',
        'INVALID_INPUT',
        'INTERNAL_ERROR',
      ],
    }),
    referenceDocPath: 'blocks/delete.mdx',
    referenceGroup: 'blocks',
  },

  'format.apply': {
    memberPath: 'format.apply',
    description:
      'Apply explicit inline style changes (bold, italic, underline, strike) to the target range using boolean patch semantics.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'format/apply.mdx',
    referenceGroup: 'format',
  },
  'format.fontSize': {
    memberPath: 'format.fontSize',
    description: 'Set or unset the font size on the target text range. Pass null to remove.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'format/font-size.mdx',
    referenceGroup: 'format',
  },
  'format.fontFamily': {
    memberPath: 'format.fontFamily',
    description: 'Set or unset the font family on the target text range. Pass null to remove.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'format/font-family.mdx',
    referenceGroup: 'format',
  },
  'format.color': {
    memberPath: 'format.color',
    description: 'Set or unset the text color on the target text range. Pass null to remove.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'format/color.mdx',
    referenceGroup: 'format',
  },
  'format.align': {
    memberPath: 'format.align',
    description: 'Set or unset paragraph alignment on the block containing the target. Pass null to reset to default.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'format/align.mdx',
    referenceGroup: 'format',
  },

  'create.paragraph': {
    memberPath: 'create.paragraph',
    description: 'Create a new paragraph at the target position.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'AMBIGUOUS_TARGET'],
    }),
    referenceDocPath: 'create/paragraph.mdx',
    referenceGroup: 'create',
  },
  'create.heading': {
    memberPath: 'create.heading',
    description: 'Create a new heading at the target position.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'AMBIGUOUS_TARGET'],
    }),
    referenceDocPath: 'create/heading.mdx',
    referenceGroup: 'create',
  },

  'lists.list': {
    memberPath: 'lists.list',
    description: 'List all list nodes in the document, optionally filtered by scope.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'lists/list.mdx',
    referenceGroup: 'lists',
  },
  'lists.get': {
    memberPath: 'lists.get',
    description: 'Retrieve a specific list node by target.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'lists/get.mdx',
    referenceGroup: 'lists',
  },
  'lists.insert': {
    memberPath: 'lists.insert',
    description: 'Insert a new list at the target position.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/insert.mdx',
    referenceGroup: 'lists',
  },
  'lists.setType': {
    memberPath: 'lists.setType',
    description: 'Change the list type (ordered, unordered) of a target list.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-type.mdx',
    referenceGroup: 'lists',
  },
  'lists.indent': {
    memberPath: 'lists.indent',
    description: 'Increase the indentation level of a list item.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/indent.mdx',
    referenceGroup: 'lists',
  },
  'lists.outdent': {
    memberPath: 'lists.outdent',
    description: 'Decrease the indentation level of a list item.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/outdent.mdx',
    referenceGroup: 'lists',
  },
  'lists.restart': {
    memberPath: 'lists.restart',
    description: 'Restart numbering of an ordered list at the target item.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/restart.mdx',
    referenceGroup: 'lists',
  },
  'lists.exit': {
    memberPath: 'lists.exit',
    description: 'Exit a list context, converting the target item to a paragraph.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/exit.mdx',
    referenceGroup: 'lists',
  },

  'comments.create': {
    memberPath: 'comments.create',
    description: 'Create a new comment thread (or reply when parentCommentId is given).',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'comments/create.mdx',
    referenceGroup: 'comments',
  },
  'comments.patch': {
    memberPath: 'comments.patch',
    description: 'Patch fields on an existing comment (text, target, status, or isInternal).',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'comments/patch.mdx',
    referenceGroup: 'comments',
  },
  'comments.delete': {
    memberPath: 'comments.delete',
    description: 'Remove a comment or reply by ID.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_NOT_FOUND_CAPABLE,
    }),
    referenceDocPath: 'comments/delete.mdx',
    referenceGroup: 'comments',
  },
  'comments.get': {
    memberPath: 'comments.get',
    description: 'Retrieve a single comment thread by ID.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'comments/get.mdx',
    referenceGroup: 'comments',
  },
  'comments.list': {
    memberPath: 'comments.list',
    description: 'List all comment threads in the document.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['INVALID_INPUT'],
    }),
    referenceDocPath: 'comments/list.mdx',
    referenceGroup: 'comments',
  },

  'trackChanges.list': {
    memberPath: 'trackChanges.list',
    description: 'List all tracked changes in the document.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['INVALID_INPUT'],
    }),
    referenceDocPath: 'track-changes/list.mdx',
    referenceGroup: 'trackChanges',
  },
  'trackChanges.get': {
    memberPath: 'trackChanges.get',
    description: 'Retrieve a single tracked change by ID.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'track-changes/get.mdx',
    referenceGroup: 'trackChanges',
  },
  'trackChanges.decide': {
    memberPath: 'trackChanges.decide',
    description: 'Accept or reject a tracked change (by ID or scope: all).',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_INPUT', 'INVALID_TARGET'],
    }),
    referenceDocPath: 'track-changes/decide.mdx',
    referenceGroup: 'trackChanges',
  },

  'query.match': {
    memberPath: 'query.match',
    description: 'Deterministic selector-based search with cardinality contracts for mutation targeting.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_QUERY_MATCH,
      deterministicTargetResolution: true,
    }),
    referenceDocPath: 'query/match.mdx',
    referenceGroup: 'query',
  },

  'mutations.preview': {
    memberPath: 'mutations.preview',
    description: 'Dry-run a mutation plan, returning resolved targets without applying changes.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_PLAN_ENGINE,
      deterministicTargetResolution: true,
    }),
    referenceDocPath: 'mutations/preview.mdx',
    referenceGroup: 'mutations',
  },

  'mutations.apply': {
    memberPath: 'mutations.apply',
    description: 'Execute a mutation plan atomically against the document.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: false,
      supportsTrackedMode: true,
      possibleFailureCodes: NONE_FAILURES,
      throws: T_PLAN_ENGINE,
      deterministicTargetResolution: true,
    }),
    referenceDocPath: 'mutations/apply.mdx',
    referenceGroup: 'mutations',
  },

  'capabilities.get': {
    memberPath: 'capabilities',
    description: 'Query runtime capabilities supported by the current document engine.',
    requiresDocumentContext: false,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: NONE_THROWS,
    }),
    referenceDocPath: 'capabilities/get.mdx',
    referenceGroup: 'capabilities',
  },
} as const satisfies Record<string, OperationDefinitionEntry>;

// ---------------------------------------------------------------------------
// Derived identities (immutable)
// ---------------------------------------------------------------------------

export type OperationId = keyof typeof OPERATION_DEFINITIONS;

export const OPERATION_IDS: readonly OperationId[] = Object.freeze(Object.keys(OPERATION_DEFINITIONS) as OperationId[]);

export const SINGLETON_OPERATION_IDS: readonly OperationId[] = Object.freeze(
  OPERATION_IDS.filter((id) => !id.includes('.')),
);

export const NAMESPACED_OPERATION_IDS: readonly OperationId[] = Object.freeze(
  OPERATION_IDS.filter((id) => id.includes('.')),
);

// ---------------------------------------------------------------------------
// Typed projection helper (single contained cast)
// ---------------------------------------------------------------------------

/**
 * Projects a value from each operation definition entry into a keyed record.
 *
 * The cast is needed because `Object.fromEntries` returns `Record<string, V>`;
 * all callers validate the result via explicit type annotations.
 */
export function projectFromDefinitions<V>(
  fn: (id: OperationId, entry: OperationDefinitionEntry) => V,
): Record<OperationId, V> {
  return Object.fromEntries(OPERATION_IDS.map((id) => [id, fn(id, OPERATION_DEFINITIONS[id])])) as Record<
    OperationId,
    V
  >;
}
