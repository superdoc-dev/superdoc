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
 *    with `memberPath`, `description`, `expectedResult`, `metadata`, `referenceDocPath`, and `referenceGroup`.
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
import { INLINE_PROPERTY_REGISTRY, type InlineRunPatchKey } from '../format/inline-run-patch.js';

// ---------------------------------------------------------------------------
// Reference group key
// ---------------------------------------------------------------------------

export type ReferenceGroupKey =
  | 'core'
  | 'blocks'
  | 'capabilities'
  | 'create'
  | 'sections'
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
  expectedResult: string;
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
const T_SECTION_CREATE = [
  'TARGET_NOT_FOUND',
  'INVALID_TARGET',
  'AMBIGUOUS_TARGET',
  'INVALID_INPUT',
  'CAPABILITY_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
const T_SECTION_READ = ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT', 'CAPABILITY_UNAVAILABLE'] as const;
const T_SECTION_MUTATION = [
  'TARGET_NOT_FOUND',
  'INVALID_TARGET',
  'INVALID_INPUT',
  'CAPABILITY_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
const T_SECTION_SETTINGS_MUTATION = ['INVALID_INPUT', 'CAPABILITY_UNAVAILABLE', 'INTERNAL_ERROR'] as const;

type FormatInlineAliasOperationId = `format.${InlineRunPatchKey}`;

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function formatInlineAliasDescription(key: InlineRunPatchKey): string {
  return `Set or clear the \`${key}\` inline run property on the target text range.`;
}

const FORMAT_INLINE_ALIAS_OPERATION_DEFINITIONS: Record<FormatInlineAliasOperationId, OperationDefinitionEntry> =
  Object.fromEntries(
    INLINE_PROPERTY_REGISTRY.map((entry) => {
      const operationId = `format.${entry.key}` as FormatInlineAliasOperationId;
      const definition: OperationDefinitionEntry = {
        memberPath: operationId,
        description: formatInlineAliasDescription(entry.key),
        expectedResult:
          'Returns a TextMutationReceipt confirming the inline run property patch was applied to the target range.',
        requiresDocumentContext: true,
        metadata: mutationOperation({
          idempotency: 'conditional',
          supportsDryRun: true,
          supportsTrackedMode: entry.tracked,
          possibleFailureCodes: ['INVALID_TARGET'],
          throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
        }),
        referenceDocPath: `format/${camelToKebab(entry.key)}.mdx`,
        referenceGroup: 'format',
      };
      return [operationId, definition];
    }),
  ) as Record<FormatInlineAliasOperationId, OperationDefinitionEntry>;

// ---------------------------------------------------------------------------
// Canonical definitions
// ---------------------------------------------------------------------------

export const OPERATION_DEFINITIONS = {
  find: {
    memberPath: 'find',
    description: 'Search the document for nodes matching type, text, or attribute criteria.',
    expectedResult:
      'Returns a FindOutput with matched items array and total count, or an empty items array if no nodes match.',
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
    expectedResult: 'Returns a NodeInfo object with the node type, address, content, and typed properties.',
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
    expectedResult: 'Returns a NodeInfo object with the node type, address, content, and typed properties.',
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
    expectedResult: 'Returns the full plain-text content of the document as a string.',
    requiresDocumentContext: true,
    metadata: readOperation(),
    referenceDocPath: 'get-text.mdx',
    referenceGroup: 'core',
  },
  info: {
    memberPath: 'info',
    description: 'Return document metadata including revision, node count, and capabilities.',
    expectedResult: 'Returns a DocumentInfo object with revision, word/paragraph/heading counts, and capability flags.',
    requiresDocumentContext: true,
    metadata: readOperation(),
    referenceDocPath: 'info.mdx',
    referenceGroup: 'core',
  },

  insert: {
    memberPath: 'insert',
    description:
      'Insert content at a target position. Supports text (default), markdown, and html content types via the `type` field.',
    expectedResult:
      'Returns a TextMutationReceipt with applied status; receipt reports NO_OP if the insertion point is invalid or content is empty.',
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
    expectedResult:
      'Returns a TextMutationReceipt with applied status; receipt reports NO_OP if the target range already contains identical content.',
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
    expectedResult:
      'Returns a TextMutationReceipt with applied status; receipt reports NO_OP if the target range is already empty.',
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
    expectedResult: 'Returns a BlocksDeleteResult receipt confirming the block was removed from the document.',
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
    description: 'Apply inline run-property patch changes to the target range with explicit set/clear semantics.',
    expectedResult: 'Returns a TextMutationReceipt confirming inline styles were applied to the target range.',
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
  ...FORMAT_INLINE_ALIAS_OPERATION_DEFINITIONS,
  'format.align': {
    memberPath: 'format.align',
    description: 'Set or unset paragraph alignment on the block containing the target. Pass null to reset to default.',
    expectedResult:
      'Returns a TextMutationReceipt; receipt reports NO_OP if the block already has the requested alignment.',
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
    expectedResult: 'Returns a StylesApplyReceipt with per-channel success/failure details for each property change.',
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
    expectedResult: 'Returns a CreateParagraphResult with the new paragraph block ID and address.',
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
    expectedResult: 'Returns a CreateHeadingResult with the new heading block ID and address.',
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
  'create.sectionBreak': {
    memberPath: 'create.sectionBreak',
    description: 'Create a section break at the target location with optional initial section properties.',
    expectedResult: 'Returns a CreateSectionBreakResult with the new section break position and section address.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_CREATE,
    }),
    referenceDocPath: 'create/section-break.mdx',
    referenceGroup: 'create',
  },

  'sections.list': {
    memberPath: 'sections.list',
    description: 'List sections in deterministic order with section-target handles.',
    expectedResult: 'Returns a SectionsListResult with an ordered array of section summaries and their target handles.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['INVALID_INPUT', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'sections/list.mdx',
    referenceGroup: 'sections',
  },
  'sections.get': {
    memberPath: 'sections.get',
    description: 'Retrieve full section information by section address.',
    expectedResult:
      'Returns a SectionInfo object with full section properties including margins, columns, and header/footer refs.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_SECTION_READ,
    }),
    referenceDocPath: 'sections/get.mdx',
    referenceGroup: 'sections',
  },
  'sections.setBreakType': {
    memberPath: 'sections.setBreakType',
    description: 'Set the section break type.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if the section already has the requested break type.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-break-type.mdx',
    referenceGroup: 'sections',
  },
  'sections.setPageMargins': {
    memberPath: 'sections.setPageMargins',
    description: 'Set page-edge margins for a section.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if margins already match the requested values.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-page-margins.mdx',
    referenceGroup: 'sections',
  },
  'sections.setHeaderFooterMargins': {
    memberPath: 'sections.setHeaderFooterMargins',
    description: 'Set header/footer margin distances for a section.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if header/footer margins already match the requested values.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-header-footer-margins.mdx',
    referenceGroup: 'sections',
  },
  'sections.setPageSetup': {
    memberPath: 'sections.setPageSetup',
    description: 'Set page size/orientation properties for a section.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if page size and orientation already match the requested values.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-page-setup.mdx',
    referenceGroup: 'sections',
  },
  'sections.setColumns': {
    memberPath: 'sections.setColumns',
    description: 'Set column configuration for a section.',
    expectedResult: 'Returns a SectionMutationResult receipt; reports NO_OP if column configuration already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-columns.mdx',
    referenceGroup: 'sections',
  },
  'sections.setLineNumbering': {
    memberPath: 'sections.setLineNumbering',
    description: 'Enable or configure line numbering for a section.',
    expectedResult: 'Returns a SectionMutationResult receipt; reports NO_OP if line numbering settings already match.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-line-numbering.mdx',
    referenceGroup: 'sections',
  },
  'sections.setPageNumbering': {
    memberPath: 'sections.setPageNumbering',
    description: 'Set page numbering format/start for a section.',
    expectedResult: 'Returns a SectionMutationResult receipt; reports NO_OP if page numbering format already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-page-numbering.mdx',
    referenceGroup: 'sections',
  },
  'sections.setTitlePage': {
    memberPath: 'sections.setTitlePage',
    description: 'Enable or disable title-page behavior for a section.',
    expectedResult: 'Returns a SectionMutationResult receipt; reports NO_OP if the title-page setting already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-title-page.mdx',
    referenceGroup: 'sections',
  },
  'sections.setOddEvenHeadersFooters': {
    memberPath: 'sections.setOddEvenHeadersFooters',
    description: 'Enable or disable odd/even header-footer mode in document settings.',
    expectedResult: 'Returns a DocumentMutationResult receipt; reports NO_OP if the odd/even setting already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_SETTINGS_MUTATION,
    }),
    referenceDocPath: 'sections/set-odd-even-headers-footers.mdx',
    referenceGroup: 'sections',
  },
  'sections.setVerticalAlign': {
    memberPath: 'sections.setVerticalAlign',
    description: 'Set vertical page alignment for a section.',
    expectedResult: 'Returns a SectionMutationResult receipt; reports NO_OP if vertical alignment already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-vertical-align.mdx',
    referenceGroup: 'sections',
  },
  'sections.setSectionDirection': {
    memberPath: 'sections.setSectionDirection',
    description: 'Set section text flow direction (LTR/RTL).',
    expectedResult: 'Returns a SectionMutationResult receipt; reports NO_OP if text direction already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-section-direction.mdx',
    referenceGroup: 'sections',
  },
  'sections.setHeaderFooterRef': {
    memberPath: 'sections.setHeaderFooterRef',
    description: 'Set or replace a section header/footer reference for a variant.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if the header/footer reference already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-header-footer-ref.mdx',
    referenceGroup: 'sections',
  },
  'sections.clearHeaderFooterRef': {
    memberPath: 'sections.clearHeaderFooterRef',
    description: 'Clear a section header/footer reference for a specific variant.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if no reference exists for the specified variant.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/clear-header-footer-ref.mdx',
    referenceGroup: 'sections',
  },
  'sections.setLinkToPrevious': {
    memberPath: 'sections.setLinkToPrevious',
    description: 'Set or clear link-to-previous behavior for a header/footer variant.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if link-to-previous already matches the requested value.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-link-to-previous.mdx',
    referenceGroup: 'sections',
  },
  'sections.setPageBorders': {
    memberPath: 'sections.setPageBorders',
    description: 'Set page border configuration for a section.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if page border configuration already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/set-page-borders.mdx',
    referenceGroup: 'sections',
  },
  'sections.clearPageBorders': {
    memberPath: 'sections.clearPageBorders',
    description: 'Clear page border configuration for a section.',
    expectedResult:
      'Returns a SectionMutationResult receipt; reports NO_OP if no page borders are configured on the section.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
      throws: T_SECTION_MUTATION,
    }),
    referenceDocPath: 'sections/clear-page-borders.mdx',
    referenceGroup: 'sections',
  },

  'lists.list': {
    memberPath: 'lists.list',
    description: 'List all list nodes in the document, optionally filtered by scope.',
    expectedResult: 'Returns a ListsListResult with an array of list item summaries and total count.',
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
    expectedResult: 'Returns a ListItemInfo object with the item kind, level, marker, and address.',
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
    expectedResult: 'Returns a ListsInsertResult with the new list item address and block ID.',
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
    expectedResult:
      'Returns a ListsMutateItemResult receipt; reports NO_OP if the list already has the requested type.',
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
    expectedResult:
      'Returns a ListsMutateItemResult receipt; reports NO_OP if the item is already at maximum indent level.',
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
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if the item is already at the root level.',
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
    expectedResult:
      'Returns a ListsMutateItemResult receipt; reports NO_OP if numbering already restarts at the target item.',
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
    expectedResult: 'Returns a ListsExitResult confirming the item was converted to a plain paragraph.',
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
    expectedResult:
      'Returns a Receipt confirming the comment was created; reports NO_OP if the anchor target is invalid.',
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
    expectedResult: 'Returns a Receipt confirming the comment was updated; reports NO_OP if no fields changed.',
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
    expectedResult:
      'Returns a Receipt confirming the comment was removed; reports NO_OP if the comment was already deleted.',
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
    expectedResult: 'Returns a CommentInfo object with the comment text, author, date, and thread metadata.',
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
    expectedResult: 'Returns a CommentsListResult with an array of comment threads and total count.',
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
    expectedResult: 'Returns a TrackChangesListResult with an array of tracked change entries and total count.',
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
    expectedResult: 'Returns a TrackChangeInfo object with the change type, author, date, and affected content.',
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
    expectedResult:
      'Returns a Receipt confirming the decision was applied; reports NO_OP if the change was already resolved.',
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
    expectedResult: 'Returns a QueryMatchOutput with the resolved target address and cardinality metadata.',
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
    expectedResult: 'Returns a MutationsPreviewOutput with resolved targets and step details without applying changes.',
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
    expectedResult: 'Returns a PlanReceipt with per-step results for the atomically applied mutation plan.',
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
    expectedResult: 'Returns a DocumentApiCapabilities object describing supported features of the current engine.',
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
    expectedResult: 'Returns a CreateTableResult with the new table block ID and address.',
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
    expectedResult: 'Returns a TableMutationResult receipt confirming text was converted into a table.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the table was already removed.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the target cells are already empty.',
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
    expectedResult:
      'Returns a TableMutationResult receipt; reports NO_OP if the table is already at the target position.',
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
    expectedResult: 'Returns a TableMutationResult receipt confirming the table was split at the target row.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the table has no content to convert.',
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
    expectedResult:
      'Returns a TableMutationResult receipt; reports NO_OP if the table already uses the requested layout mode.',
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
    expectedResult: 'Returns a TableMutationResult receipt confirming a row was inserted.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the target row does not exist.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the row height already matches.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if row heights are already equal.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if row options already match.',
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
    expectedResult: 'Returns a TableMutationResult receipt confirming a column was inserted.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the target column does not exist.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the column width already matches.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if column widths are already equal.',
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
    expectedResult: 'Returns a TableMutationResult receipt confirming a cell was inserted.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the target cell does not exist.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the cells are already merged.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the cell is not merged.',
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
    expectedResult: 'Returns a TableMutationResult receipt confirming the cell was split.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if cell properties already match.',
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
    expectedResult: 'Returns a TableMutationResult receipt confirming rows were reordered.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if alt text already matches.',
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
    expectedResult:
      'Returns a TableMutationResult receipt; reports NO_OP if the table already uses the requested style.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if no table style is applied.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the style option already matches.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if border properties already match.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if no borders are set.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if the preset is already applied.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if shading already matches.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if no shading is set.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if table padding already matches.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if cell padding already matches.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if cell spacing already matches.',
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
    expectedResult: 'Returns a TableMutationResult receipt; reports NO_OP if no custom cell spacing is set.',
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
    expectedResult: 'Returns a TablesGetOutput with the table row count, column count, and structural metadata.',
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
    expectedResult: 'Returns a TablesGetCellsOutput with cell information for the requested rows and columns.',
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
    expectedResult: 'Returns a TablesGetPropertiesOutput with the table layout, style, border, and shading properties.',
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
