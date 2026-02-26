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
  | 'styles'
  | 'lists'
  | 'comments'
  | 'trackChanges'
  | 'query'
  | 'mutations'
  | 'tables';

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
  'REVISION_CHANGED_SINCE_COMPILE',
  'INVALID_INSERTION_CONTEXT',
  'DOCUMENT_IDENTITY_CONFLICT',
  'CAPABILITY_UNAVAILABLE',
] as const;

// Table-command throw-code arrays.
// All mutation operations include CAPABILITY_UNAVAILABLE (contract invariant).
// _TRACKED suffix signals the operation also supports tracked change mode.
const T_NOT_FOUND_COMMAND = ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'] as const;
const T_NOT_FOUND_COMMAND_TRACKED = [...T_NOT_FOUND_COMMAND] as const;

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
    description:
      'Insert content at a target position. Supports text (default), markdown, and html content types via the `type` field.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP', 'CAPABILITY_UNAVAILABLE', 'UNSUPPORTED_ENVIRONMENT'],
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

  'styles.apply': {
    memberPath: 'styles.apply',
    description:
      'Apply document-level default style changes to the stylesheet (word/styles.xml). Targets docDefaults run properties with boolean patch semantics.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: NONE_FAILURES,
      throws: ['INVALID_TARGET', 'INVALID_INPUT', 'CAPABILITY_UNAVAILABLE', 'REVISION_MISMATCH'],
    }),
    referenceDocPath: 'styles/apply.mdx',
    referenceGroup: 'styles',
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

  // -------------------------------------------------------------------------
  // Create: table
  // -------------------------------------------------------------------------

  'create.table': {
    memberPath: 'create.table',
    description: 'Create a new table at the target position.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_COMMAND_TRACKED, 'INVALID_TARGET', 'AMBIGUOUS_TARGET'],
    }),
    referenceDocPath: 'create/table.mdx',
    referenceGroup: 'create',
  },

  // -------------------------------------------------------------------------
  // Tables: lifecycle
  // -------------------------------------------------------------------------

  'tables.convertFromText': {
    memberPath: 'tables.convertFromText',
    description: 'Convert a text range into a table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/convert-from-text.mdx',
    referenceGroup: 'tables',
  },
  'tables.delete': {
    memberPath: 'tables.delete',
    description: 'Delete the target table from the document.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_COMMAND_TRACKED, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'tables/delete.mdx',
    referenceGroup: 'tables',
  },
  'tables.clearContents': {
    memberPath: 'tables.clearContents',
    description: 'Clear the contents of the target table or cell range.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/clear-contents.mdx',
    referenceGroup: 'tables',
  },
  'tables.move': {
    memberPath: 'tables.move',
    description: 'Move a table to a new position in the document.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/move.mdx',
    referenceGroup: 'tables',
  },
  'tables.split': {
    memberPath: 'tables.split',
    description: 'Split a table into two tables at the target row.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/split.mdx',
    referenceGroup: 'tables',
  },
  'tables.convertToText': {
    memberPath: 'tables.convertToText',
    description: 'Convert a table back to plain text.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/convert-to-text.mdx',
    referenceGroup: 'tables',
  },

  // -------------------------------------------------------------------------
  // Tables: layout
  // -------------------------------------------------------------------------

  'tables.setLayout': {
    memberPath: 'tables.setLayout',
    description: 'Set the layout mode of the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-layout.mdx',
    referenceGroup: 'tables',
  },

  // -------------------------------------------------------------------------
  // Tables: row structure
  // -------------------------------------------------------------------------

  'tables.insertRow': {
    memberPath: 'tables.insertRow',
    description: 'Insert a new row into the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_COMMAND_TRACKED, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'tables/insert-row.mdx',
    referenceGroup: 'tables',
  },
  'tables.deleteRow': {
    memberPath: 'tables.deleteRow',
    description: 'Delete a row from the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_COMMAND_TRACKED, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'tables/delete-row.mdx',
    referenceGroup: 'tables',
  },
  'tables.setRowHeight': {
    memberPath: 'tables.setRowHeight',
    description: 'Set the height of a table row.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-row-height.mdx',
    referenceGroup: 'tables',
  },
  'tables.distributeRows': {
    memberPath: 'tables.distributeRows',
    description: 'Distribute row heights evenly across the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/distribute-rows.mdx',
    referenceGroup: 'tables',
  },
  'tables.setRowOptions': {
    memberPath: 'tables.setRowOptions',
    description: 'Set options on a table row such as header repeat or page break.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-row-options.mdx',
    referenceGroup: 'tables',
  },

  // -------------------------------------------------------------------------
  // Tables: column structure
  // -------------------------------------------------------------------------

  'tables.insertColumn': {
    memberPath: 'tables.insertColumn',
    description: 'Insert a new column into the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_COMMAND_TRACKED, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'tables/insert-column.mdx',
    referenceGroup: 'tables',
  },
  'tables.deleteColumn': {
    memberPath: 'tables.deleteColumn',
    description: 'Delete a column from the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_COMMAND_TRACKED, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'tables/delete-column.mdx',
    referenceGroup: 'tables',
  },
  'tables.setColumnWidth': {
    memberPath: 'tables.setColumnWidth',
    description: 'Set the width of a table column.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-column-width.mdx',
    referenceGroup: 'tables',
  },
  'tables.distributeColumns': {
    memberPath: 'tables.distributeColumns',
    description: 'Distribute column widths evenly across the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/distribute-columns.mdx',
    referenceGroup: 'tables',
  },

  // -------------------------------------------------------------------------
  // Tables: cell structure
  // -------------------------------------------------------------------------

  'tables.insertCell': {
    memberPath: 'tables.insertCell',
    description: 'Insert a new cell into a table row.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_COMMAND, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'tables/insert-cell.mdx',
    referenceGroup: 'tables',
  },
  'tables.deleteCell': {
    memberPath: 'tables.deleteCell',
    description: 'Delete a cell from a table row.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_COMMAND, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'tables/delete-cell.mdx',
    referenceGroup: 'tables',
  },
  'tables.mergeCells': {
    memberPath: 'tables.mergeCells',
    description: 'Merge a range of table cells into one.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/merge-cells.mdx',
    referenceGroup: 'tables',
  },
  'tables.unmergeCells': {
    memberPath: 'tables.unmergeCells',
    description: 'Unmerge a previously merged table cell.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/unmerge-cells.mdx',
    referenceGroup: 'tables',
  },
  'tables.splitCell': {
    memberPath: 'tables.splitCell',
    description: 'Split a table cell into multiple cells.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/split-cell.mdx',
    referenceGroup: 'tables',
  },
  'tables.setCellProperties': {
    memberPath: 'tables.setCellProperties',
    description: 'Set properties on a table cell such as vertical alignment or text direction.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-cell-properties.mdx',
    referenceGroup: 'tables',
  },

  // -------------------------------------------------------------------------
  // Tables: data + accessibility
  // -------------------------------------------------------------------------

  'tables.sort': {
    memberPath: 'tables.sort',
    description: 'Sort table rows by a column value.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/sort.mdx',
    referenceGroup: 'tables',
  },
  'tables.setAltText': {
    memberPath: 'tables.setAltText',
    description: 'Set the alternative text description for a table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-alt-text.mdx',
    referenceGroup: 'tables',
  },

  // -------------------------------------------------------------------------
  // Tables: style
  // -------------------------------------------------------------------------

  'tables.setStyle': {
    memberPath: 'tables.setStyle',
    description: 'Apply a named table style to the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-style.mdx',
    referenceGroup: 'tables',
  },
  'tables.clearStyle': {
    memberPath: 'tables.clearStyle',
    description: 'Remove the applied table style, reverting to defaults.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/clear-style.mdx',
    referenceGroup: 'tables',
  },
  'tables.setStyleOption': {
    memberPath: 'tables.setStyleOption',
    description: 'Toggle a conditional style option such as banded rows or first column.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-style-option.mdx',
    referenceGroup: 'tables',
  },
  'tables.setBorder': {
    memberPath: 'tables.setBorder',
    description: 'Set border properties on a table or cell range.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-border.mdx',
    referenceGroup: 'tables',
  },
  'tables.clearBorder': {
    memberPath: 'tables.clearBorder',
    description: 'Remove border formatting from a table or cell range.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/clear-border.mdx',
    referenceGroup: 'tables',
  },
  'tables.applyBorderPreset': {
    memberPath: 'tables.applyBorderPreset',
    description: 'Apply a border preset (e.g. all borders, outside only) to a table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/apply-border-preset.mdx',
    referenceGroup: 'tables',
  },
  'tables.setShading': {
    memberPath: 'tables.setShading',
    description: 'Set the background shading color on a table or cell range.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-shading.mdx',
    referenceGroup: 'tables',
  },
  'tables.clearShading': {
    memberPath: 'tables.clearShading',
    description: 'Remove shading from a table or cell range.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/clear-shading.mdx',
    referenceGroup: 'tables',
  },
  'tables.setTablePadding': {
    memberPath: 'tables.setTablePadding',
    description: 'Set default cell padding for the entire table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-table-padding.mdx',
    referenceGroup: 'tables',
  },
  'tables.setCellPadding': {
    memberPath: 'tables.setCellPadding',
    description: 'Set padding on a specific table cell or cell range.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-cell-padding.mdx',
    referenceGroup: 'tables',
  },
  'tables.setCellSpacing': {
    memberPath: 'tables.setCellSpacing',
    description: 'Set the cell spacing for the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/set-cell-spacing.mdx',
    referenceGroup: 'tables',
  },
  'tables.clearCellSpacing': {
    memberPath: 'tables.clearCellSpacing',
    description: 'Remove custom cell spacing from the target table.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'tables/clear-cell-spacing.mdx',
    referenceGroup: 'tables',
  },

  // -------------------------------------------------------------------------
  // Tables: read operations (B4 ref handoff)
  // -------------------------------------------------------------------------

  'tables.get': {
    memberPath: 'tables.get',
    description: 'Retrieve table structure and dimensions by locator.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'tables/get.mdx',
    referenceGroup: 'tables',
  },
  'tables.getCells': {
    memberPath: 'tables.getCells',
    description: 'Retrieve cell information for a table, optionally filtered by row or column.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'tables/get-cells.mdx',
    referenceGroup: 'tables',
  },
  'tables.getProperties': {
    memberPath: 'tables.getProperties',
    description: 'Retrieve layout and style properties of a table.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'tables/get-properties.mdx',
    referenceGroup: 'tables',
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
