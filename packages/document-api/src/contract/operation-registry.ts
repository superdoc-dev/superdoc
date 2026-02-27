/**
 * Canonical type-level mapping from OperationId to input, options, and output types.
 *
 * This interface is the single source of truth for the invoke dispatch layer.
 * The bidirectional completeness checks at the bottom of this file guarantee
 * that every OperationId has a registry entry and vice versa.
 */

import type { OperationId } from './types.js';

import type { NodeAddress, NodeInfo, FindOutput, Selector, Query } from '../types/index.js';
import type { TextMutationReceipt, Receipt } from '../types/receipt.js';
import type { DocumentInfo } from '../types/info.types.js';
import type {
  CreateParagraphInput,
  CreateParagraphResult,
  CreateHeadingInput,
  CreateHeadingResult,
} from '../types/create.types.js';
import type { BlocksDeleteInput, BlocksDeleteResult } from '../types/blocks.types.js';

import type { FindOptions } from '../find/find.js';
import type { GetNodeByIdInput } from '../get-node/get-node.js';
import type { GetTextInput } from '../get-text/get-text.js';
import type { InfoInput } from '../info/info.js';
import type { InsertInput } from '../insert/insert.js';
import type { ReplaceInput } from '../replace/replace.js';
import type { DeleteInput } from '../delete/delete.js';
import type { MutationOptions, RevisionGuardOptions } from '../write/write.js';
import type { FormatInlineAliasInput, StyleApplyInput, FormatAlignInput } from '../format/format.js';
import type { InlineRunPatchKey } from '../format/inline-run-patch.js';
import type { StylesApplyInput, StylesApplyOptions, StylesApplyReceipt } from '../styles/styles.js';
import type {
  CommentsCreateInput,
  CommentsPatchInput,
  CommentsDeleteInput,
  GetCommentInput,
} from '../comments/comments.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from '../comments/comments.types.js';
import type { TrackChangesListInput, TrackChangesGetInput, ReviewDecideInput } from '../track-changes/track-changes.js';
import type { TrackChangeInfo, TrackChangesListResult } from '../types/track-changes.types.js';
import type { DocumentApiCapabilities } from '../capabilities/capabilities.js';
import type {
  ListsListQuery,
  ListsListResult,
  ListsGetInput,
  ListItemInfo,
  ListInsertInput,
  ListsInsertResult,
  ListSetTypeInput,
  ListsMutateItemResult,
  ListTargetInput,
  ListsExitResult,
} from '../lists/lists.types.js';
import type {
  CreateSectionBreakInput,
  CreateSectionBreakResult,
  DocumentMutationResult,
  SectionInfo,
  SectionMutationResult,
  SectionsClearHeaderFooterRefInput,
  SectionsClearPageBordersInput,
  SectionsGetInput,
  SectionsListQuery,
  SectionsListResult,
  SectionsSetBreakTypeInput,
  SectionsSetColumnsInput,
  SectionsSetHeaderFooterMarginsInput,
  SectionsSetHeaderFooterRefInput,
  SectionsSetLineNumberingInput,
  SectionsSetLinkToPreviousInput,
  SectionsSetOddEvenHeadersFootersInput,
  SectionsSetPageBordersInput,
  SectionsSetPageMarginsInput,
  SectionsSetPageNumberingInput,
  SectionsSetPageSetupInput,
  SectionsSetSectionDirectionInput,
  SectionsSetTitlePageInput,
  SectionsSetVerticalAlignInput,
} from '../sections/sections.types.js';
import type { QueryMatchInput, QueryMatchOutput } from '../types/query-match.types.js';
import type {
  MutationsApplyInput,
  MutationsPreviewInput,
  MutationsPreviewOutput,
  PlanReceipt,
} from '../types/mutation-plan.types.js';
import type {
  CreateTableInput,
  CreateTableResult,
  TablesConvertFromTextInput,
  TableLocator,
  TablesMoveInput,
  TablesSplitInput,
  TablesConvertToTextInput,
  TablesSetLayoutInput,
  TablesInsertRowInput,
  TablesDeleteRowInput,
  TablesSetRowHeightInput,
  TablesDistributeRowsInput,
  TablesSetRowOptionsInput,
  TablesInsertColumnInput,
  TablesDeleteColumnInput,
  TablesSetColumnWidthInput,
  TablesDistributeColumnsInput,
  TablesInsertCellInput,
  TablesDeleteCellInput,
  TablesMergeCellsInput,
  TablesUnmergeCellsInput,
  TablesSplitCellInput,
  TablesSetCellPropertiesInput,
  TablesSortInput,
  TablesSetAltTextInput,
  TablesSetStyleInput,
  TablesClearStyleInput,
  TablesSetStyleOptionInput,
  TablesSetBorderInput,
  TablesClearBorderInput,
  TablesApplyBorderPresetInput,
  TablesSetShadingInput,
  TablesClearShadingInput,
  TablesSetTablePaddingInput,
  TablesSetCellPaddingInput,
  TablesSetCellSpacingInput,
  TablesClearCellSpacingInput,
  TableMutationResult,
  TablesGetInput,
  TablesGetOutput,
  TablesGetCellsInput,
  TablesGetCellsOutput,
  TablesGetPropertiesInput,
  TablesGetPropertiesOutput,
} from '../types/table-operations.types.js';

type FormatInlineAliasOperationRegistry = {
  [K in InlineRunPatchKey as `format.${K}`]: {
    input: FormatInlineAliasInput<K>;
    options: MutationOptions;
    output: TextMutationReceipt;
  };
};

export interface OperationRegistry extends FormatInlineAliasOperationRegistry {
  // --- Singleton reads ---
  find: { input: Selector | Query; options: FindOptions; output: FindOutput };
  getNode: { input: NodeAddress; options: never; output: NodeInfo };
  getNodeById: { input: GetNodeByIdInput; options: never; output: NodeInfo };
  getText: { input: GetTextInput; options: never; output: string };
  info: { input: InfoInput; options: never; output: DocumentInfo };

  // --- Singleton mutations ---
  insert: { input: InsertInput; options: MutationOptions; output: TextMutationReceipt };
  replace: { input: ReplaceInput; options: MutationOptions; output: TextMutationReceipt };
  delete: { input: DeleteInput; options: MutationOptions; output: TextMutationReceipt };

  // --- blocks.* ---
  'blocks.delete': { input: BlocksDeleteInput; options: MutationOptions; output: BlocksDeleteResult };

  // --- format.* ---
  'format.apply': { input: StyleApplyInput; options: MutationOptions; output: TextMutationReceipt };
  'format.align': { input: FormatAlignInput; options: MutationOptions; output: TextMutationReceipt };

  // --- styles.* ---
  'styles.apply': { input: StylesApplyInput; options: StylesApplyOptions; output: StylesApplyReceipt };

  // --- create.* ---
  'create.paragraph': { input: CreateParagraphInput; options: MutationOptions; output: CreateParagraphResult };
  'create.heading': { input: CreateHeadingInput; options: MutationOptions; output: CreateHeadingResult };
  'create.sectionBreak': { input: CreateSectionBreakInput; options: MutationOptions; output: CreateSectionBreakResult };

  // --- lists.* ---
  'lists.list': { input: ListsListQuery | undefined; options: never; output: ListsListResult };
  'lists.get': { input: ListsGetInput; options: never; output: ListItemInfo };
  'lists.insert': { input: ListInsertInput; options: MutationOptions; output: ListsInsertResult };
  'lists.setType': { input: ListSetTypeInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.indent': { input: ListTargetInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.outdent': { input: ListTargetInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.restart': { input: ListTargetInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.exit': { input: ListTargetInput; options: MutationOptions; output: ListsExitResult };

  // --- sections.* ---
  'sections.list': { input: SectionsListQuery | undefined; options: never; output: SectionsListResult };
  'sections.get': { input: SectionsGetInput; options: never; output: SectionInfo };
  'sections.setBreakType': {
    input: SectionsSetBreakTypeInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setPageMargins': {
    input: SectionsSetPageMarginsInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setHeaderFooterMargins': {
    input: SectionsSetHeaderFooterMarginsInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setPageSetup': {
    input: SectionsSetPageSetupInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setColumns': { input: SectionsSetColumnsInput; options: MutationOptions; output: SectionMutationResult };
  'sections.setLineNumbering': {
    input: SectionsSetLineNumberingInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setPageNumbering': {
    input: SectionsSetPageNumberingInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setTitlePage': {
    input: SectionsSetTitlePageInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setOddEvenHeadersFooters': {
    input: SectionsSetOddEvenHeadersFootersInput;
    options: MutationOptions;
    output: DocumentMutationResult;
  };
  'sections.setVerticalAlign': {
    input: SectionsSetVerticalAlignInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setSectionDirection': {
    input: SectionsSetSectionDirectionInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setHeaderFooterRef': {
    input: SectionsSetHeaderFooterRefInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.clearHeaderFooterRef': {
    input: SectionsClearHeaderFooterRefInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setLinkToPrevious': {
    input: SectionsSetLinkToPreviousInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.setPageBorders': {
    input: SectionsSetPageBordersInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };
  'sections.clearPageBorders': {
    input: SectionsClearPageBordersInput;
    options: MutationOptions;
    output: SectionMutationResult;
  };

  // --- comments.* ---
  'comments.create': { input: CommentsCreateInput; options: RevisionGuardOptions; output: Receipt };
  'comments.patch': { input: CommentsPatchInput; options: RevisionGuardOptions; output: Receipt };
  'comments.delete': { input: CommentsDeleteInput; options: RevisionGuardOptions; output: Receipt };
  'comments.get': { input: GetCommentInput; options: never; output: CommentInfo };
  'comments.list': { input: CommentsListQuery | undefined; options: never; output: CommentsListResult };

  // --- trackChanges.* ---
  'trackChanges.list': { input: TrackChangesListInput | undefined; options: never; output: TrackChangesListResult };
  'trackChanges.get': { input: TrackChangesGetInput; options: never; output: TrackChangeInfo };
  'trackChanges.decide': { input: ReviewDecideInput; options: RevisionGuardOptions; output: Receipt };

  // --- query.* ---
  'query.match': { input: QueryMatchInput; options: never; output: QueryMatchOutput };

  // --- mutations.* ---
  'mutations.preview': { input: MutationsPreviewInput; options: never; output: MutationsPreviewOutput };
  'mutations.apply': { input: MutationsApplyInput; options: never; output: PlanReceipt };

  // --- capabilities ---
  'capabilities.get': { input: undefined; options: never; output: DocumentApiCapabilities };

  // --- create.table ---
  'create.table': { input: CreateTableInput; options: MutationOptions; output: CreateTableResult };

  // --- tables.* ---
  'tables.convertFromText': {
    input: TablesConvertFromTextInput;
    options: MutationOptions;
    output: TableMutationResult;
  };
  'tables.delete': { input: TableLocator; options: MutationOptions; output: TableMutationResult };
  'tables.clearContents': { input: TableLocator; options: MutationOptions; output: TableMutationResult };
  'tables.move': { input: TablesMoveInput; options: MutationOptions; output: TableMutationResult };
  'tables.split': { input: TablesSplitInput; options: MutationOptions; output: TableMutationResult };
  'tables.convertToText': { input: TablesConvertToTextInput; options: MutationOptions; output: TableMutationResult };
  'tables.setLayout': { input: TablesSetLayoutInput; options: MutationOptions; output: TableMutationResult };
  'tables.insertRow': { input: TablesInsertRowInput; options: MutationOptions; output: TableMutationResult };
  'tables.deleteRow': { input: TablesDeleteRowInput; options: MutationOptions; output: TableMutationResult };
  'tables.setRowHeight': { input: TablesSetRowHeightInput; options: MutationOptions; output: TableMutationResult };
  'tables.distributeRows': { input: TablesDistributeRowsInput; options: MutationOptions; output: TableMutationResult };
  'tables.setRowOptions': { input: TablesSetRowOptionsInput; options: MutationOptions; output: TableMutationResult };
  'tables.insertColumn': { input: TablesInsertColumnInput; options: MutationOptions; output: TableMutationResult };
  'tables.deleteColumn': { input: TablesDeleteColumnInput; options: MutationOptions; output: TableMutationResult };
  'tables.setColumnWidth': { input: TablesSetColumnWidthInput; options: MutationOptions; output: TableMutationResult };
  'tables.distributeColumns': {
    input: TablesDistributeColumnsInput;
    options: MutationOptions;
    output: TableMutationResult;
  };
  'tables.insertCell': { input: TablesInsertCellInput; options: MutationOptions; output: TableMutationResult };
  'tables.deleteCell': { input: TablesDeleteCellInput; options: MutationOptions; output: TableMutationResult };
  'tables.mergeCells': { input: TablesMergeCellsInput; options: MutationOptions; output: TableMutationResult };
  'tables.unmergeCells': { input: TablesUnmergeCellsInput; options: MutationOptions; output: TableMutationResult };
  'tables.splitCell': { input: TablesSplitCellInput; options: MutationOptions; output: TableMutationResult };
  'tables.setCellProperties': {
    input: TablesSetCellPropertiesInput;
    options: MutationOptions;
    output: TableMutationResult;
  };
  'tables.sort': { input: TablesSortInput; options: MutationOptions; output: TableMutationResult };
  'tables.setAltText': { input: TablesSetAltTextInput; options: MutationOptions; output: TableMutationResult };
  'tables.setStyle': { input: TablesSetStyleInput; options: MutationOptions; output: TableMutationResult };
  'tables.clearStyle': { input: TablesClearStyleInput; options: MutationOptions; output: TableMutationResult };
  'tables.setStyleOption': { input: TablesSetStyleOptionInput; options: MutationOptions; output: TableMutationResult };
  'tables.setBorder': { input: TablesSetBorderInput; options: MutationOptions; output: TableMutationResult };
  'tables.clearBorder': { input: TablesClearBorderInput; options: MutationOptions; output: TableMutationResult };
  'tables.applyBorderPreset': {
    input: TablesApplyBorderPresetInput;
    options: MutationOptions;
    output: TableMutationResult;
  };
  'tables.setShading': { input: TablesSetShadingInput; options: MutationOptions; output: TableMutationResult };
  'tables.clearShading': { input: TablesClearShadingInput; options: MutationOptions; output: TableMutationResult };
  'tables.setTablePadding': {
    input: TablesSetTablePaddingInput;
    options: MutationOptions;
    output: TableMutationResult;
  };
  'tables.setCellPadding': { input: TablesSetCellPaddingInput; options: MutationOptions; output: TableMutationResult };
  'tables.setCellSpacing': { input: TablesSetCellSpacingInput; options: MutationOptions; output: TableMutationResult };
  'tables.clearCellSpacing': {
    input: TablesClearCellSpacingInput;
    options: MutationOptions;
    output: TableMutationResult;
  };

  // --- tables.* reads ---
  'tables.get': { input: TablesGetInput; options: never; output: TablesGetOutput };
  'tables.getCells': { input: TablesGetCellsInput; options: never; output: TablesGetCellsOutput };
  'tables.getProperties': { input: TablesGetPropertiesInput; options: never; output: TablesGetPropertiesOutput };
}

// --- Bidirectional completeness checks ---
// If either assertion fails, the `false extends true` branch produces a compile error.

type Assert<_T extends true> = void;

/** Fails to compile if OperationRegistry is missing any OperationId key. */
type _AllOpsHaveRegistryEntry = Assert<OperationId extends keyof OperationRegistry ? true : false>;

/** Fails to compile if OperationRegistry has extra keys not in OperationId. */
type _NoExtraRegistryKeys = Assert<keyof OperationRegistry extends OperationId ? true : false>;

// --- Invoke request/result types ---

/**
 * Typed invoke request. TypeScript narrows input and options based on operationId.
 */
export type InvokeRequest<T extends OperationId> = {
  operationId: T;
  input: OperationRegistry[T]['input'];
} & (OperationRegistry[T]['options'] extends never
  ? Record<string, never>
  : { options?: OperationRegistry[T]['options'] });

/**
 * Typed invoke result, narrowed by operationId.
 */
export type InvokeResult<T extends OperationId> = OperationRegistry[T]['output'];

/**
 * Loose invoke request for dynamic callers who don't know the operation at compile time.
 * Invalid inputs will produce adapter-level errors, not input-validation errors.
 */
export type DynamicInvokeRequest = {
  operationId: OperationId;
  input: unknown;
  options?: unknown;
};
