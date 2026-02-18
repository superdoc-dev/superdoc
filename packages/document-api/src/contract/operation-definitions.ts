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

export type ReferenceGroupKey = 'core' | 'capabilities' | 'create' | 'format' | 'lists' | 'comments' | 'trackChanges';

// ---------------------------------------------------------------------------
// Entry shape
// ---------------------------------------------------------------------------

export interface OperationDefinitionEntry {
  memberPath: string;
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
const T_COMMAND = ['COMMAND_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'] as const;
const T_NOT_FOUND_COMMAND = ['TARGET_NOT_FOUND', 'COMMAND_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'] as const;
const T_NOT_FOUND_TRACKED = ['TARGET_NOT_FOUND', 'TRACK_CHANGE_COMMAND_UNAVAILABLE', 'CAPABILITY_UNAVAILABLE'] as const;
const T_NOT_FOUND_COMMAND_TRACKED = [
  'TARGET_NOT_FOUND',
  'COMMAND_UNAVAILABLE',
  'TRACK_CHANGE_COMMAND_UNAVAILABLE',
  'CAPABILITY_UNAVAILABLE',
] as const;

// ---------------------------------------------------------------------------
// Canonical definitions
// ---------------------------------------------------------------------------

export const OPERATION_DEFINITIONS = {
  find: {
    memberPath: 'find',
    metadata: readOperation({
      idempotency: 'idempotent',
      deterministicTargetResolution: false,
    }),
    referenceDocPath: 'find.mdx',
    referenceGroup: 'core',
  },
  getNode: {
    memberPath: 'getNode',
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'get-node.mdx',
    referenceGroup: 'core',
  },
  getNodeById: {
    memberPath: 'getNodeById',
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'get-node-by-id.mdx',
    referenceGroup: 'core',
  },
  getText: {
    memberPath: 'getText',
    metadata: readOperation(),
    referenceDocPath: 'get-text.mdx',
    referenceGroup: 'core',
  },
  info: {
    memberPath: 'info',
    metadata: readOperation(),
    referenceDocPath: 'info.mdx',
    referenceGroup: 'core',
  },

  insert: {
    memberPath: 'insert',
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_TRACKED,
    }),
    referenceDocPath: 'insert.mdx',
    referenceGroup: 'core',
  },
  replace: {
    memberPath: 'replace',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_TRACKED,
    }),
    referenceDocPath: 'replace.mdx',
    referenceGroup: 'core',
  },
  delete: {
    memberPath: 'delete',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['NO_OP'],
      throws: T_NOT_FOUND_TRACKED,
    }),
    referenceDocPath: 'delete.mdx',
    referenceGroup: 'core',
  },

  'format.bold': {
    memberPath: 'format.bold',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'format/bold.mdx',
    referenceGroup: 'format',
  },
  'format.italic': {
    memberPath: 'format.italic',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'format/italic.mdx',
    referenceGroup: 'format',
  },
  'format.underline': {
    memberPath: 'format.underline',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'format/underline.mdx',
    referenceGroup: 'format',
  },
  'format.strikethrough': {
    memberPath: 'format.strikethrough',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'format/strikethrough.mdx',
    referenceGroup: 'format',
  },

  'create.paragraph': {
    memberPath: 'create.paragraph',
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'create/paragraph.mdx',
    referenceGroup: 'create',
  },
  'create.heading': {
    memberPath: 'create.heading',
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'create/heading.mdx',
    referenceGroup: 'create',
  },

  'lists.list': {
    memberPath: 'lists.list',
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'lists/list.mdx',
    referenceGroup: 'lists',
  },
  'lists.get': {
    memberPath: 'lists.get',
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'lists/get.mdx',
    referenceGroup: 'lists',
  },
  'lists.insert': {
    memberPath: 'lists.insert',
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: true,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'lists/insert.mdx',
    referenceGroup: 'lists',
  },
  'lists.setType': {
    memberPath: 'lists.setType',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'lists/set-type.mdx',
    referenceGroup: 'lists',
  },
  'lists.indent': {
    memberPath: 'lists.indent',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'lists/indent.mdx',
    referenceGroup: 'lists',
  },
  'lists.outdent': {
    memberPath: 'lists.outdent',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'lists/outdent.mdx',
    referenceGroup: 'lists',
  },
  'lists.restart': {
    memberPath: 'lists.restart',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'lists/restart.mdx',
    referenceGroup: 'lists',
  },
  'lists.exit': {
    memberPath: 'lists.exit',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND_TRACKED,
    }),
    referenceDocPath: 'lists/exit.mdx',
    referenceGroup: 'lists',
  },

  'comments.add': {
    memberPath: 'comments.add',
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/add.mdx',
    referenceGroup: 'comments',
  },
  'comments.edit': {
    memberPath: 'comments.edit',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/edit.mdx',
    referenceGroup: 'comments',
  },
  'comments.reply': {
    memberPath: 'comments.reply',
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/reply.mdx',
    referenceGroup: 'comments',
  },
  'comments.move': {
    memberPath: 'comments.move',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/move.mdx',
    referenceGroup: 'comments',
  },
  'comments.resolve': {
    memberPath: 'comments.resolve',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/resolve.mdx',
    referenceGroup: 'comments',
  },
  'comments.remove': {
    memberPath: 'comments.remove',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/remove.mdx',
    referenceGroup: 'comments',
  },
  'comments.setInternal': {
    memberPath: 'comments.setInternal',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/set-internal.mdx',
    referenceGroup: 'comments',
  },
  'comments.setActive': {
    memberPath: 'comments.setActive',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/set-active.mdx',
    referenceGroup: 'comments',
  },
  'comments.goTo': {
    memberPath: 'comments.goTo',
    metadata: readOperation({
      idempotency: 'conditional',
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'comments/go-to.mdx',
    referenceGroup: 'comments',
  },
  'comments.get': {
    memberPath: 'comments.get',
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'comments/get.mdx',
    referenceGroup: 'comments',
  },
  'comments.list': {
    memberPath: 'comments.list',
    metadata: readOperation({
      idempotency: 'idempotent',
    }),
    referenceDocPath: 'comments/list.mdx',
    referenceGroup: 'comments',
  },

  'trackChanges.list': {
    memberPath: 'trackChanges.list',
    metadata: readOperation({
      idempotency: 'idempotent',
    }),
    referenceDocPath: 'track-changes/list.mdx',
    referenceGroup: 'trackChanges',
  },
  'trackChanges.get': {
    memberPath: 'trackChanges.get',
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'track-changes/get.mdx',
    referenceGroup: 'trackChanges',
  },
  'trackChanges.accept': {
    memberPath: 'trackChanges.accept',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'track-changes/accept.mdx',
    referenceGroup: 'trackChanges',
  },
  'trackChanges.reject': {
    memberPath: 'trackChanges.reject',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_NOT_FOUND_COMMAND,
    }),
    referenceDocPath: 'track-changes/reject.mdx',
    referenceGroup: 'trackChanges',
  },
  'trackChanges.acceptAll': {
    memberPath: 'trackChanges.acceptAll',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_COMMAND,
    }),
    referenceDocPath: 'track-changes/accept-all.mdx',
    referenceGroup: 'trackChanges',
  },
  'trackChanges.rejectAll': {
    memberPath: 'trackChanges.rejectAll',
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_COMMAND,
    }),
    referenceDocPath: 'track-changes/reject-all.mdx',
    referenceGroup: 'trackChanges',
  },

  'capabilities.get': {
    memberPath: 'capabilities',
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
