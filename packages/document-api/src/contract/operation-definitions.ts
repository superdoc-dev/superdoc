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
  | 'format.paragraph'
  | 'styles'
  | 'styles.paragraph'
  | 'lists'
  | 'comments'
  | 'trackChanges'
  | 'query'
  | 'mutations'
  | 'tables'
  | 'history'
  | 'toc'
  | 'images'
  | 'hyperlinks';

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
  skipAsATool?: boolean;
  /** When true, this tool is included in the default "essential" tool set. */
  essential?: boolean;
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
    possibleFailureCodes?: readonly ReceiptFailureCode[];
    deterministicTargetResolution?: boolean;
    remediationHints?: readonly string[];
  } = {},
): CommandStaticMetadata {
  return {
    mutates: false,
    idempotency: options.idempotency ?? 'idempotent',
    supportsDryRun: false,
    supportsTrackedMode: false,
    possibleFailureCodes: options.possibleFailureCodes ?? NONE_FAILURES,
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
  historyUnsafe?: boolean;
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
    historyUnsafe: options.historyUnsafe,
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

// Image operations can throw AMBIGUOUS_TARGET when multiple images share an sdImageId.
const T_IMAGE_COMMAND = ['TARGET_NOT_FOUND', 'AMBIGUOUS_TARGET', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'] as const;

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
const T_PARAGRAPH_MUTATION = ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'] as const;
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
        skipAsATool: true,
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
    skipAsATool: true,
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
    essential: true,
  },
  getText: {
    memberPath: 'getText',
    description: 'Extract the plain-text content of the document.',
    expectedResult: 'Returns the full plain-text content of the document as a string.',
    requiresDocumentContext: true,
    metadata: readOperation(),
    referenceDocPath: 'get-text.mdx',
    referenceGroup: 'core',
    essential: true,
  },
  getMarkdown: {
    memberPath: 'getMarkdown',
    description: 'Extract the document content as a Markdown string.',
    expectedResult: 'Returns the full document content as a Markdown-formatted string.',
    requiresDocumentContext: true,
    metadata: readOperation(),
    referenceDocPath: 'get-markdown.mdx',
    referenceGroup: 'core',
  },
  getHtml: {
    memberPath: 'getHtml',
    description: 'Extract the document content as an HTML string.',
    expectedResult: 'Returns the full document content as an HTML-formatted string.',
    requiresDocumentContext: true,
    metadata: readOperation(),
    referenceDocPath: 'get-html.mdx',
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

  clearContent: {
    memberPath: 'clearContent',
    description: 'Clear all document body content, leaving a single empty paragraph.',
    expectedResult: 'Returns a Receipt with success status; reports NO_OP if the document is already empty.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: ['CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'clear-content.mdx',
    referenceGroup: 'core',
  },

  insert: {
    memberPath: 'insert',
    description:
      'Insert content at a target position, or at the end of the document when target is omitted. Supports text (default), markdown, and html content types via the `type` field.',
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

  'styles.apply': {
    memberPath: 'styles.apply',
    description:
      'Apply document-level default style changes to the stylesheet (word/styles.xml). Targets docDefaults run and paragraph channels with set-style patch semantics.',
    expectedResult: 'Returns a StylesApplyReceipt with per-channel success/failure details for each property change.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: NONE_FAILURES,
      throws: ['INVALID_TARGET', 'INVALID_INPUT', 'CAPABILITY_UNAVAILABLE', 'REVISION_MISMATCH'],
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
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
      historyUnsafe: true,
    }),
    referenceDocPath: 'sections/clear-page-borders.mdx',
    referenceGroup: 'sections',
  },

  // --- styles.paragraph.* ---

  'styles.paragraph.setStyle': {
    memberPath: 'styles.paragraph.setStyle',
    description: 'Set the paragraph style reference (w:pStyle) on a paragraph-like block.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if the style already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'styles/paragraph/set-style.mdx',
    referenceGroup: 'styles.paragraph',
  },
  'styles.paragraph.clearStyle': {
    memberPath: 'styles.paragraph.clearStyle',
    description: 'Remove the paragraph style reference from a paragraph-like block.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no style is set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'styles/paragraph/clear-style.mdx',
    referenceGroup: 'styles.paragraph',
  },

  // --- format.paragraph.* ---

  'format.paragraph.resetDirectFormatting': {
    memberPath: 'format.paragraph.resetDirectFormatting',
    description:
      'Strip all direct paragraph formatting while preserving style reference, numbering, and section metadata.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no direct formatting is present.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/reset-direct-formatting.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setAlignment': {
    memberPath: 'format.paragraph.setAlignment',
    description: 'Set paragraph alignment (justification) on a paragraph-like block.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if the alignment already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-alignment.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.clearAlignment': {
    memberPath: 'format.paragraph.clearAlignment',
    description: 'Remove direct paragraph alignment, reverting to style-defined or default alignment.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no direct alignment is set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/clear-alignment.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setIndentation': {
    memberPath: 'format.paragraph.setIndentation',
    description: 'Set paragraph indentation properties (left, right, firstLine, hanging) in twips.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if indentation already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-indentation.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.clearIndentation': {
    memberPath: 'format.paragraph.clearIndentation',
    description: 'Remove all direct paragraph indentation.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no direct indentation is set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/clear-indentation.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setSpacing': {
    memberPath: 'format.paragraph.setSpacing',
    description: 'Set paragraph spacing properties (before, after, line, lineRule) in twips.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if spacing already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-spacing.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.clearSpacing': {
    memberPath: 'format.paragraph.clearSpacing',
    description: 'Remove all direct paragraph spacing.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no direct spacing is set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/clear-spacing.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setKeepOptions': {
    memberPath: 'format.paragraph.setKeepOptions',
    description: 'Set keep-with-next, keep-lines-together, and widow/orphan control flags.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if all flags already match.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-keep-options.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setOutlineLevel': {
    memberPath: 'format.paragraph.setOutlineLevel',
    description: 'Set the paragraph outline level (0–9) or null to clear.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if outline level already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-outline-level.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setFlowOptions': {
    memberPath: 'format.paragraph.setFlowOptions',
    description: 'Set contextual spacing, page-break-before, and suppress-auto-hyphens flags.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if all flags already match.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-flow-options.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setTabStop': {
    memberPath: 'format.paragraph.setTabStop',
    description: 'Add or replace a tab stop at a given position.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if an identical tab stop already exists.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-tab-stop.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.clearTabStop': {
    memberPath: 'format.paragraph.clearTabStop',
    description: 'Remove a tab stop at a given position.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no tab stop exists at that position.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/clear-tab-stop.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.clearAllTabStops': {
    memberPath: 'format.paragraph.clearAllTabStops',
    description: 'Remove all tab stops from a paragraph.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no tab stops exist.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/clear-all-tab-stops.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setBorder': {
    memberPath: 'format.paragraph.setBorder',
    description: 'Set border properties for a specific side of a paragraph.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if the border already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-border.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.clearBorder': {
    memberPath: 'format.paragraph.clearBorder',
    description: 'Remove border for a specific side or all sides of a paragraph.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if the border is already absent.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/clear-border.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.setShading': {
    memberPath: 'format.paragraph.setShading',
    description: 'Set paragraph shading (background fill, pattern color, pattern type).',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if the shading already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/set-shading.mdx',
    referenceGroup: 'format.paragraph',
  },
  'format.paragraph.clearShading': {
    memberPath: 'format.paragraph.clearShading',
    description: 'Remove all paragraph shading.',
    expectedResult: 'Returns a ParagraphMutationResult; reports NO_OP if no shading is set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_PARAGRAPH_MUTATION,
    }),
    referenceDocPath: 'format/paragraph/clear-shading.mdx',
    referenceGroup: 'format.paragraph',
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
  'lists.create': {
    memberPath: 'lists.create',
    description: 'Create a new list from one or more paragraphs, or convert existing paragraphs into a new list.',
    expectedResult: 'Returns a ListsCreateResult with the new listId and the first item address.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'LEVEL_OUT_OF_RANGE'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/create.mdx',
    referenceGroup: 'lists',
  },
  'lists.attach': {
    memberPath: 'lists.attach',
    description: 'Convert non-list paragraphs to list items under an existing list sequence.',
    expectedResult: 'Returns a ListsMutateItemResult confirming attachment.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/attach.mdx',
    referenceGroup: 'lists',
  },
  'lists.detach': {
    memberPath: 'lists.detach',
    description: 'Remove numbering properties from list items, converting them to plain paragraphs.',
    expectedResult: 'Returns a ListsDetachResult confirming the item was converted to a plain paragraph.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/detach.mdx',
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
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE'],
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
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/outdent.mdx',
    referenceGroup: 'lists',
  },
  'lists.join': {
    memberPath: 'lists.join',
    description: 'Merge two adjacent list sequences into one.',
    expectedResult: 'Returns a ListsJoinResult with the resulting listId of the merged sequence.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: [
        'INVALID_TARGET',
        'NO_ADJACENT_SEQUENCE',
        'INCOMPATIBLE_DEFINITIONS',
        'ALREADY_SAME_SEQUENCE',
      ],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/join.mdx',
    referenceGroup: 'lists',
  },
  'lists.canJoin': {
    memberPath: 'lists.canJoin',
    description: 'Check whether two adjacent list sequences can be joined.',
    expectedResult: 'Returns a ListsCanJoinResult indicating feasibility and reason if not possible.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'lists/can-join.mdx',
    referenceGroup: 'lists',
  },
  'lists.separate': {
    memberPath: 'lists.separate',
    description: 'Split a list sequence at the target item, creating a new sequence from that point forward.',
    expectedResult: 'Returns a ListsSeparateResult with the new listId and numId.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/separate.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevel': {
    memberPath: 'lists.setLevel',
    description: 'Set the absolute nesting level (0..8) of a list item.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if already at the target level.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-level.mdx',
    referenceGroup: 'lists',
  },
  'lists.setValue': {
    memberPath: 'lists.setValue',
    description:
      'Set an explicit numbering value at the target item. Mid-sequence targets are atomically separated first.',
    expectedResult: 'Returns a ListsMutateItemResult receipt.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-value.mdx',
    referenceGroup: 'lists',
  },
  'lists.continuePrevious': {
    memberPath: 'lists.continuePrevious',
    description: 'Continue numbering from the nearest compatible previous list sequence.',
    expectedResult: 'Returns a ListsMutateItemResult receipt.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'NO_COMPATIBLE_PREVIOUS', 'ALREADY_CONTINUOUS'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/continue-previous.mdx',
    referenceGroup: 'lists',
  },
  'lists.canContinuePrevious': {
    memberPath: 'lists.canContinuePrevious',
    description: 'Check whether the target sequence can continue numbering from a previous compatible sequence.',
    expectedResult: 'Returns a ListsCanContinuePreviousResult indicating feasibility.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'lists/can-continue-previous.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelRestart': {
    memberPath: 'lists.setLevelRestart',
    description: 'Set the restart behavior for a specific list level.',
    expectedResult: 'Returns a ListsMutateItemResult receipt.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'LEVEL_OUT_OF_RANGE'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-level-restart.mdx',
    referenceGroup: 'lists',
  },
  'lists.convertToText': {
    memberPath: 'lists.convertToText',
    description: 'Convert list items to plain paragraphs, optionally prepending the rendered marker text.',
    expectedResult: 'Returns a ListsConvertToTextResult confirming the conversion.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/convert-to-text.mdx',
    referenceGroup: 'lists',
  },

  // SD-1973 — List formatting and templates
  'lists.applyTemplate': {
    memberPath: 'lists.applyTemplate',
    description: 'Apply a captured ListTemplate to the target list, optionally filtered to specific levels.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if all levels already match.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'INVALID_INPUT'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'lists/apply-template.mdx',
    referenceGroup: 'lists',
  },
  'lists.applyPreset': {
    memberPath: 'lists.applyPreset',
    description: 'Apply a built-in list formatting preset to the target list.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if all levels already match the preset.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'INVALID_INPUT'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'lists/apply-preset.mdx',
    referenceGroup: 'lists',
  },
  'lists.captureTemplate': {
    memberPath: 'lists.captureTemplate',
    description: 'Capture the formatting of a list as a reusable ListTemplate.',
    expectedResult: 'Returns a ListsCaptureTemplateResult containing the captured template.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT'],
      possibleFailureCodes: ['INVALID_TARGET', 'INVALID_INPUT', 'LEVEL_OUT_OF_RANGE'],
    }),
    referenceDocPath: 'lists/capture-template.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelNumbering': {
    memberPath: 'lists.setLevelNumbering',
    description: 'Set the numbering format, pattern, and optional start value for a specific list level.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if the level already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'LEVEL_NOT_FOUND'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-level-numbering.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelBullet': {
    memberPath: 'lists.setLevelBullet',
    description: 'Set the bullet marker text for a specific list level.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if the marker already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'LEVEL_NOT_FOUND'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-level-bullet.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelPictureBullet': {
    memberPath: 'lists.setLevelPictureBullet',
    description: 'Set a picture bullet for a specific list level by its OOXML lvlPicBulletId.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if the picture bullet already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: [
        'NO_OP',
        'INVALID_TARGET',
        'LEVEL_OUT_OF_RANGE',
        'LEVEL_NOT_FOUND',
        'INVALID_INPUT',
        'CAPABILITY_UNAVAILABLE',
      ],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'lists/set-level-picture-bullet.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelAlignment': {
    memberPath: 'lists.setLevelAlignment',
    description: 'Set the marker alignment (left, center, right) for a specific list level.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if the alignment already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'LEVEL_NOT_FOUND'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-level-alignment.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelIndents': {
    memberPath: 'lists.setLevelIndents',
    description: 'Set the paragraph indentation values (left, hanging, firstLine) for a specific list level.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if all indent values already match.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'LEVEL_NOT_FOUND', 'INVALID_INPUT'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'lists/set-level-indents.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelTrailingCharacter': {
    memberPath: 'lists.setLevelTrailingCharacter',
    description: 'Set the trailing character (tab, space, nothing) after the marker for a specific list level.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if the trailing character already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'LEVEL_NOT_FOUND'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-level-trailing-character.mdx',
    referenceGroup: 'lists',
  },
  'lists.setLevelMarkerFont': {
    memberPath: 'lists.setLevelMarkerFont',
    description: 'Set the font family used for the marker character at a specific list level.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if the font already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE', 'LEVEL_NOT_FOUND'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/set-level-marker-font.mdx',
    referenceGroup: 'lists',
  },
  'lists.clearLevelOverrides': {
    memberPath: 'lists.clearLevelOverrides',
    description: 'Remove instance-level overrides for a specific list level, restoring abstract definition values.',
    expectedResult: 'Returns a ListsMutateItemResult receipt; reports NO_OP if no override exists.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET', 'LEVEL_OUT_OF_RANGE'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET'],
    }),
    referenceDocPath: 'lists/clear-level-overrides.mdx',
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
    essential: true,
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
    essential: true,
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
  'tables.getStyles': {
    memberPath: 'tables.getStyles',
    description: 'List all table styles and the document-level default table style setting.',
    expectedResult: 'Returns a TablesGetStylesOutput with the style catalog, explicit default, and effective default.',
    requiresDocumentContext: true,
    metadata: readOperation({ idempotency: 'idempotent' }),
    referenceDocPath: 'tables/get-styles.mdx',
    referenceGroup: 'tables',
  },
  'tables.setDefaultStyle': {
    memberPath: 'tables.setDefaultStyle',
    description: 'Set the document-level default table style (w:defaultTableStyle in settings.xml).',
    expectedResult: 'Returns a DocumentMutationResult; reports NO_OP if the default already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_INPUT'],
      throws: ['CAPABILITY_UNAVAILABLE', 'INVALID_INPUT'],
      historyUnsafe: true,
    }),
    referenceDocPath: 'tables/set-default-style.mdx',
    referenceGroup: 'tables',
  },
  'tables.clearDefaultStyle': {
    memberPath: 'tables.clearDefaultStyle',
    description: 'Remove the document-level default table style setting.',
    expectedResult: 'Returns a DocumentMutationResult; reports NO_OP if no default is set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: ['CAPABILITY_UNAVAILABLE'],
      historyUnsafe: true,
    }),
    referenceDocPath: 'tables/clear-default-style.mdx',
    referenceGroup: 'tables',
  },
  // -------------------------------------------------------------------------
  // Create: table of contents
  // -------------------------------------------------------------------------

  'create.tableOfContents': {
    memberPath: 'create.tableOfContents',
    description: 'Insert a new table of contents at the target position.',
    expectedResult: 'Returns a CreateTableOfContentsResult with the new TOC block address.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_INSERTION_CONTEXT'],
      throws: ['INVALID_TARGET', 'TARGET_NOT_FOUND', 'INVALID_INPUT', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'create/table-of-contents.mdx',
    referenceGroup: 'create',
  },

  // -------------------------------------------------------------------------
  // TOC: lifecycle + configuration
  // -------------------------------------------------------------------------

  'toc.list': {
    memberPath: 'toc.list',
    description: 'List all tables of contents in the document.',
    expectedResult: 'Returns a TocListResult with an array of TOC discovery items and pagination metadata.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
    }),
    referenceDocPath: 'toc/list.mdx',
    referenceGroup: 'toc',
  },
  'toc.get': {
    memberPath: 'toc.get',
    description: 'Retrieve details of a specific table of contents.',
    expectedResult: 'Returns a TocInfo object with the instruction, source/display configuration, and entry count.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'toc/get.mdx',
    referenceGroup: 'toc',
  },
  'toc.configure': {
    memberPath: 'toc.configure',
    description: 'Update the configuration switches of a table of contents.',
    expectedResult: 'Returns a TocMutationResult with the updated TOC address on success, or a failure code on no-op.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'toc/configure.mdx',
    referenceGroup: 'toc',
  },
  'toc.update': {
    memberPath: 'toc.update',
    description: 'Rebuild or refresh the materialized content of a table of contents.',
    expectedResult:
      'Returns a TocMutationResult with the TOC address on success, or a failure code if content is unchanged or page numbers cannot be resolved.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'PAGE_NUMBERS_NOT_MATERIALIZED', 'CAPABILITY_UNAVAILABLE'],
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'toc/update.mdx',
    referenceGroup: 'toc',
  },
  'toc.remove': {
    memberPath: 'toc.remove',
    description: 'Remove a table of contents from the document.',
    expectedResult: 'Returns a TocMutationResult with the removed TOC address on success, or a failure code on no-op.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'toc/remove.mdx',
    referenceGroup: 'toc',
  },

  // -------------------------------------------------------------------------
  // TOC: TC entry management (SD-1977)
  // -------------------------------------------------------------------------

  'toc.markEntry': {
    memberPath: 'toc.markEntry',
    description: 'Insert a TC (table of contents entry) field at the target paragraph.',
    expectedResult: 'Returns a TocEntryMutationResult with the created entry address on success.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP', 'INVALID_INSERTION_CONTEXT'],
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'toc/mark-entry.mdx',
    referenceGroup: 'toc',
  },
  'toc.unmarkEntry': {
    memberPath: 'toc.unmarkEntry',
    description: 'Remove a TC (table of contents entry) field from the document.',
    expectedResult: 'Returns a TocEntryMutationResult with the removed entry address on success.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'toc/unmark-entry.mdx',
    referenceGroup: 'toc',
  },
  'toc.listEntries': {
    memberPath: 'toc.listEntries',
    description: 'List all TC (table of contents entry) fields in the document body.',
    expectedResult: 'Returns a TocListEntriesResult with an array of TC entry discovery items and pagination metadata.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
    }),
    referenceDocPath: 'toc/list-entries.mdx',
    referenceGroup: 'toc',
  },
  'toc.getEntry': {
    memberPath: 'toc.getEntry',
    description: 'Retrieve details of a specific TC (table of contents entry) field.',
    expectedResult: 'Returns a TocEntryInfo object with the instruction, text, level, and switch configuration.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: T_NOT_FOUND,
    }),
    referenceDocPath: 'toc/get-entry.mdx',
    referenceGroup: 'toc',
  },
  'toc.editEntry': {
    memberPath: 'toc.editEntry',
    description: 'Update the properties of a TC (table of contents entry) field.',
    expectedResult:
      'Returns a TocEntryMutationResult with the updated entry address on success, or NO_OP if no change.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET', 'INVALID_INPUT', 'CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'toc/edit-entry.mdx',
    referenceGroup: 'toc',
  },

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  'history.get': {
    memberPath: 'history.get',
    description: 'Query the current undo/redo history state of the active editor.',
    expectedResult:
      'Returns a HistoryState object with undoDepth, redoDepth, canUndo, canRedo, and a list of history-unsafe operations.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
    }),
    referenceDocPath: 'history/get.mdx',
    referenceGroup: 'history',
  },

  'history.undo': {
    memberPath: 'history.undo',
    description: 'Undo the most recent history-safe mutation in the active editor.',
    expectedResult:
      'Returns a HistoryActionResult with noop flag and revision before/after; noop is true when the undo stack is empty.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: NONE_FAILURES,
      throws: ['CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'history/undo.mdx',
    referenceGroup: 'history',
    essential: true,
  },

  'history.redo': {
    memberPath: 'history.redo',
    description: 'Redo the most recently undone action in the active editor.',
    expectedResult:
      'Returns a HistoryActionResult with noop flag and revision before/after; noop is true when the redo stack is empty.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: false,
      supportsTrackedMode: false,
      possibleFailureCodes: NONE_FAILURES,
      throws: ['CAPABILITY_UNAVAILABLE'],
    }),
    referenceDocPath: 'history/redo.mdx',
    referenceGroup: 'history',
  },

  // -------------------------------------------------------------------------
  // Create: image
  // -------------------------------------------------------------------------

  'create.image': {
    memberPath: 'create.image',
    description: 'Insert a new image at the target position.',
    expectedResult: 'Returns a CreateImageResult with the new image address.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET', 'INVALID_INPUT'],
      throws: [...T_NOT_FOUND_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'create/image.mdx',
    referenceGroup: 'create',
  },

  // -------------------------------------------------------------------------
  // Images: lifecycle + placement
  // -------------------------------------------------------------------------

  'images.list': {
    memberPath: 'images.list',
    description: 'List all images in the document.',
    expectedResult: 'Returns an ImagesListResult with total count and image summaries.',
    requiresDocumentContext: true,
    metadata: readOperation({ idempotency: 'idempotent', deterministicTargetResolution: true }),
    referenceDocPath: 'images/list.mdx',
    referenceGroup: 'images',
  },

  'images.get': {
    memberPath: 'images.get',
    description: 'Get details for a specific image by its stable ID.',
    expectedResult: 'Returns an ImageSummary with full image properties.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['TARGET_NOT_FOUND', 'AMBIGUOUS_TARGET'],
      deterministicTargetResolution: true,
    }),
    referenceDocPath: 'images/get.mdx',
    referenceGroup: 'images',
  },

  'images.delete': {
    memberPath: 'images.delete',
    description: 'Delete an image from the document.',
    expectedResult: 'Returns an ImagesMutationResult indicating success or failure.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/delete.mdx',
    referenceGroup: 'images',
  },

  'images.move': {
    memberPath: 'images.move',
    description: 'Move an image to a new location in the document.',
    expectedResult: 'Returns an ImagesMutationResult indicating success or failure.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['INVALID_TARGET'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/move.mdx',
    referenceGroup: 'images',
  },

  'images.convertToInline': {
    memberPath: 'images.convertToInline',
    description: 'Convert a floating image to inline placement.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already inline.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/convert-to-inline.mdx',
    referenceGroup: 'images',
  },

  'images.convertToFloating': {
    memberPath: 'images.convertToFloating',
    description: 'Convert an inline image to floating placement.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already floating.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/convert-to-floating.mdx',
    referenceGroup: 'images',
  },

  'images.setSize': {
    memberPath: 'images.setSize',
    description: 'Set explicit width/height for an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if the size already matches.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/set-size.mdx',
    referenceGroup: 'images',
  },

  'images.setWrapType': {
    memberPath: 'images.setWrapType',
    description: 'Set the text wrapping type for a floating image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/set-wrap-type.mdx',
    referenceGroup: 'images',
  },

  'images.setWrapSide': {
    memberPath: 'images.setWrapSide',
    description: 'Set which side(s) text wraps around a floating image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/set-wrap-side.mdx',
    referenceGroup: 'images',
  },

  'images.setWrapDistances': {
    memberPath: 'images.setWrapDistances',
    description: 'Set the text-wrap distance margins for a floating image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/set-wrap-distances.mdx',
    referenceGroup: 'images',
  },

  'images.setPosition': {
    memberPath: 'images.setPosition',
    description: 'Set the anchor position for a floating image.',
    expectedResult: 'Returns an ImagesMutationResult.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/set-position.mdx',
    referenceGroup: 'images',
  },

  'images.setAnchorOptions': {
    memberPath: 'images.setAnchorOptions',
    description: 'Set anchor behavior options for a floating image.',
    expectedResult: 'Returns an ImagesMutationResult.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/set-anchor-options.mdx',
    referenceGroup: 'images',
  },

  'images.setZOrder': {
    memberPath: 'images.setZOrder',
    description: 'Set the z-order (relativeHeight) for a floating image.',
    expectedResult: 'Returns an ImagesMutationResult.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/set-z-order.mdx',
    referenceGroup: 'images',
  },

  // --- SD-2100: Geometry ---

  'images.scale': {
    memberPath: 'images.scale',
    description: 'Scale an image by a uniform factor applied to both dimensions.',
    expectedResult: 'Returns an ImagesMutationResult with the updated image address.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/scale.mdx',
    referenceGroup: 'images',
  },

  'images.setLockAspectRatio': {
    memberPath: 'images.setLockAspectRatio',
    description: 'Lock or unlock the aspect ratio for an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/set-lock-aspect-ratio.mdx',
    referenceGroup: 'images',
  },

  'images.rotate': {
    memberPath: 'images.rotate',
    description: 'Set the absolute rotation angle for an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/rotate.mdx',
    referenceGroup: 'images',
  },

  'images.flip': {
    memberPath: 'images.flip',
    description: 'Set horizontal and/or vertical flip state for an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if already set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/flip.mdx',
    referenceGroup: 'images',
  },

  'images.crop': {
    memberPath: 'images.crop',
    description: 'Apply rectangular edge-percentage crop to an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if unchanged.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/crop.mdx',
    referenceGroup: 'images',
  },

  'images.resetCrop': {
    memberPath: 'images.resetCrop',
    description: 'Remove all cropping from an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if no crop is set.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/reset-crop.mdx',
    referenceGroup: 'images',
  },

  // --- SD-2100: Content replacement ---

  'images.replaceSource': {
    memberPath: 'images.replaceSource',
    description: 'Replace the image source while preserving identity and placement.',
    expectedResult: 'Returns an ImagesMutationResult with the updated image address.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/replace-source.mdx',
    referenceGroup: 'images',
  },

  // --- SD-2100: Semantic metadata ---

  'images.setAltText': {
    memberPath: 'images.setAltText',
    description: 'Set the accessibility description (alt text) for an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if unchanged.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/set-alt-text.mdx',
    referenceGroup: 'images',
  },

  'images.setDecorative': {
    memberPath: 'images.setDecorative',
    description: 'Mark or unmark an image as decorative.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if unchanged.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/set-decorative.mdx',
    referenceGroup: 'images',
  },

  'images.setName': {
    memberPath: 'images.setName',
    description: 'Set the object name for an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if unchanged.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/set-name.mdx',
    referenceGroup: 'images',
  },

  'images.setHyperlink': {
    memberPath: 'images.setHyperlink',
    description: 'Set or remove the hyperlink attached to an image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if unchanged.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/set-hyperlink.mdx',
    referenceGroup: 'images',
  },

  // --- SD-2100: Caption lifecycle ---

  'images.insertCaption': {
    memberPath: 'images.insertCaption',
    description: 'Insert a caption paragraph below the image.',
    expectedResult: 'Returns an ImagesMutationResult with the image address.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/insert-caption.mdx',
    referenceGroup: 'images',
  },

  'images.updateCaption': {
    memberPath: 'images.updateCaption',
    description: 'Update the text of an existing caption paragraph.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if text unchanged.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_IMAGE_COMMAND, 'INVALID_INPUT'],
    }),
    referenceDocPath: 'images/update-caption.mdx',
    referenceGroup: 'images',
  },

  'images.removeCaption': {
    memberPath: 'images.removeCaption',
    description: 'Remove the caption paragraph from below the image.',
    expectedResult: 'Returns an ImagesMutationResult; reports NO_OP if no caption exists.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      possibleFailureCodes: ['NO_OP'],
      throws: T_IMAGE_COMMAND,
    }),
    referenceDocPath: 'images/remove-caption.mdx',
    referenceGroup: 'images',
  },

  // -------------------------------------------------------------------------
  // Hyperlinks: discovery + CRUD
  // -------------------------------------------------------------------------

  'hyperlinks.list': {
    memberPath: 'hyperlinks.list',
    description: 'List all hyperlinks in the document, with optional filtering by href, anchor, or display text.',
    expectedResult:
      'Returns a HyperlinksListResult with an array of hyperlink discovery items and pagination metadata.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
    }),
    referenceDocPath: 'hyperlinks/list.mdx',
    referenceGroup: 'hyperlinks',
  },
  'hyperlinks.get': {
    memberPath: 'hyperlinks.get',
    description: 'Retrieve details of a specific hyperlink by its inline address.',
    expectedResult: 'Returns a HyperlinkInfo object with the address, destination properties, and display text.',
    requiresDocumentContext: true,
    metadata: readOperation({
      idempotency: 'idempotent',
      throws: ['TARGET_NOT_FOUND', 'INVALID_TARGET'],
    }),
    referenceDocPath: 'hyperlinks/get.mdx',
    referenceGroup: 'hyperlinks',
  },
  'hyperlinks.wrap': {
    memberPath: 'hyperlinks.wrap',
    description: 'Wrap an existing text range with a hyperlink.',
    expectedResult:
      'Returns a HyperlinkMutationResult with the created hyperlink address on success, or a failure code on no-op.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      deterministicTargetResolution: true,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'hyperlinks/wrap.mdx',
    referenceGroup: 'hyperlinks',
  },
  'hyperlinks.insert': {
    memberPath: 'hyperlinks.insert',
    description: 'Insert new linked text at a target position.',
    expectedResult:
      'Returns a HyperlinkMutationResult with the created hyperlink address on success, or a failure code.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'non-idempotent',
      supportsDryRun: true,
      supportsTrackedMode: false,
      deterministicTargetResolution: true,
      possibleFailureCodes: ['NO_OP', 'INVALID_TARGET'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'hyperlinks/insert.mdx',
    referenceGroup: 'hyperlinks',
  },
  'hyperlinks.patch': {
    memberPath: 'hyperlinks.patch',
    description: 'Update hyperlink metadata (destination, tooltip, target, rel) without changing display text.',
    expectedResult:
      'Returns a HyperlinkMutationResult with the updated hyperlink address on success, or NO_OP if unchanged.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      deterministicTargetResolution: true,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'hyperlinks/patch.mdx',
    referenceGroup: 'hyperlinks',
  },
  'hyperlinks.remove': {
    memberPath: 'hyperlinks.remove',
    description:
      "Remove a hyperlink. Mode 'unwrap' preserves display text; 'deleteText' removes the linked content entirely.",
    expectedResult:
      'Returns a HyperlinkMutationResult with the removed hyperlink address on success, or a failure code on no-op.',
    requiresDocumentContext: true,
    metadata: mutationOperation({
      idempotency: 'conditional',
      supportsDryRun: true,
      supportsTrackedMode: false,
      deterministicTargetResolution: true,
      possibleFailureCodes: ['NO_OP'],
      throws: [...T_NOT_FOUND_CAPABLE, 'INVALID_TARGET', 'INVALID_INPUT'],
    }),
    referenceDocPath: 'hyperlinks/remove.mdx',
    referenceGroup: 'hyperlinks',
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
