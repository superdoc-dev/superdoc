/**
 * Engine-agnostic Document API surface.
 */

export * from './types/index.js';
export * from './contract/index.js';
export * from './capabilities/capabilities.js';
export * from './inline-semantics/index.js';

import type {
  CreateParagraphInput,
  CreateParagraphResult,
  DocumentInfo,
  MutationsApplyInput,
  MutationsPreviewInput,
  MutationsPreviewOutput,
  NodeAddress,
  NodeInfo,
  PlanReceipt,
  Query,
  QueryMatchInput,
  QueryMatchOutput,
  FindOutput,
  Receipt,
  Selector,
  TextMutationReceipt,
  TrackChangeInfo,
  TrackChangesListResult,
} from './types/index.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments/comments.types.js';
import type {
  CommentsAdapter,
  CommentsApi,
  CommentsCreateInput,
  CommentsPatchInput,
  CommentsDeleteInput,
  GetCommentInput,
} from './comments/comments.js';
import {
  executeCommentsCreate,
  executeCommentsPatch,
  executeCommentsDelete,
  executeGetComment,
  executeListComments,
} from './comments/comments.js';
import type { DeleteInput } from './delete/delete.js';
import { executeFind, type FindAdapter, type FindOptions } from './find/find.js';
import type {
  FormatAdapter,
  FormatApi,
  FormatInlineAliasApi,
  FormatInlineAliasInput,
  FormatStrikethroughInput,
  StyleApplyInput,
  FormatAlignInput,
} from './format/format.js';
import { executeStyleApply, executeInlineAlias, executeAlign } from './format/format.js';
import { INLINE_PROPERTY_REGISTRY, type InlineRunPatchKey } from './format/inline-run-patch.js';
import type {
  StylesAdapter,
  StylesApi,
  StylesApplyInput,
  StylesApplyOptions,
  StylesApplyReceipt,
} from './styles/styles.js';
import { executeStylesApply } from './styles/styles.js';
import type { GetNodeAdapter, GetNodeByIdInput } from './get-node/get-node.js';
import { executeGetNode, executeGetNodeById } from './get-node/get-node.js';
import { executeGetText, type GetTextAdapter, type GetTextInput } from './get-text/get-text.js';
import { executeInfo, type InfoAdapter, type InfoInput } from './info/info.js';
import type { InsertInput } from './insert/insert.js';
import { executeDelete } from './delete/delete.js';
import { executeInsert } from './insert/insert.js';
import type { ListsAdapter, ListsApi } from './lists/lists.js';
import type {
  ListItemInfo,
  ListInsertInput,
  ListSetTypeInput,
  ListsExitResult,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListTargetInput,
} from './lists/lists.types.js';
import {
  executeListsExit,
  executeListsGet,
  executeListsIndent,
  executeListsInsert,
  executeListsList,
  executeListsOutdent,
  executeListsRestart,
  executeListsSetType,
} from './lists/lists.js';
import { executeReplace, type ReplaceInput } from './replace/replace.js';
import type { CreateAdapter, CreateApi } from './create/create.js';
import {
  executeCreateParagraph,
  executeCreateHeading,
  executeCreateTable,
  executeCreateSectionBreak,
} from './create/create.js';
import type { BlocksAdapter, BlocksApi } from './blocks/blocks.js';
import { executeBlocksDelete } from './blocks/blocks.js';
import type { BlocksDeleteInput, BlocksDeleteResult } from './types/blocks.types.js';
import type { CreateHeadingInput, CreateHeadingResult } from './types/create.types.js';
import type {
  CreateTableInput,
  CreateTableResult,
  TableLocator,
  TableMutationResult,
  TablesConvertFromTextInput,
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
  TablesGetInput,
  TablesGetOutput,
  TablesGetCellsInput,
  TablesGetCellsOutput,
  TablesGetPropertiesInput,
  TablesGetPropertiesOutput,
} from './types/table-operations.types.js';
import type {
  TrackChangesAdapter,
  TrackChangesApi,
  TrackChangesGetInput,
  TrackChangesListInput,
  ReviewDecideInput,
} from './track-changes/track-changes.js';
import {
  executeTrackChangesGet,
  executeTrackChangesList,
  executeTrackChangesDecide,
} from './track-changes/track-changes.js';
import type { MutationOptions, RevisionGuardOptions, WriteAdapter } from './write/write.js';
import {
  executeCapabilities,
  type CapabilitiesAdapter,
  type DocumentApiCapabilities,
} from './capabilities/capabilities.js';
import type { OperationId } from './contract/types.js';
import type { DynamicInvokeRequest, InvokeRequest, InvokeResult } from './contract/operation-registry.js';
import { buildDispatchTable } from './invoke/invoke.js';
import { executeTableOperation } from './tables/tables.js';
import type { SectionsAdapter, SectionsApi } from './sections/sections.js';
import type {
  CreateSectionBreakInput,
  CreateSectionBreakResult,
  DocumentMutationResult,
  SectionInfo,
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
  SectionMutationResult,
} from './sections/sections.types.js';
import {
  executeSectionsClearHeaderFooterRef,
  executeSectionsClearPageBorders,
  executeSectionsGet,
  executeSectionsList,
  executeSectionsSetBreakType,
  executeSectionsSetColumns,
  executeSectionsSetHeaderFooterMargins,
  executeSectionsSetHeaderFooterRef,
  executeSectionsSetLineNumbering,
  executeSectionsSetLinkToPrevious,
  executeSectionsSetOddEvenHeadersFooters,
  executeSectionsSetPageBorders,
  executeSectionsSetPageMargins,
  executeSectionsSetPageNumbering,
  executeSectionsSetPageSetup,
  executeSectionsSetSectionDirection,
  executeSectionsSetTitlePage,
  executeSectionsSetVerticalAlign,
} from './sections/sections.js';

export type { FindAdapter, FindOptions } from './find/find.js';
export type { GetNodeAdapter, GetNodeByIdInput } from './get-node/get-node.js';
export type { GetTextAdapter, GetTextInput } from './get-text/get-text.js';
export type { InfoAdapter, InfoInput } from './info/info.js';
export type { WriteAdapter, WriteRequest } from './write/write.js';
export type {
  FormatAdapter,
  FormatInlineAliasApi,
  FormatInlineAliasInput,
  FormatBoldInput,
  FormatItalicInput,
  FormatUnderlineInput,
  FormatStrikethroughInput,
  StyleApplyInput,
  StyleApplyOptions,
  FormatAlignInput,
} from './format/format.js';
export { ALIGNMENTS, type Alignment } from './format/format.js';
export type {
  InlineRunPatch,
  InlineRunPatchKey,
  InlinePropertyStorage,
  InlinePropertyType,
  InlinePropertyCarrier,
  InlinePropertyRegistryEntry,
  UnderlinePatch,
  ShadingPatch,
  BorderPatch,
  FitTextPatch,
  LangPatch,
  RFontsPatch,
  EastAsianLayoutPatch,
  StylisticSetPatch,
} from './format/inline-run-patch.js';
export {
  INLINE_PROPERTY_REGISTRY,
  INLINE_PROPERTY_KEY_SET,
  INLINE_PROPERTY_BY_KEY,
  INLINE_PROPERTY_KEYS_BY_STORAGE,
  validateInlineRunPatch,
  buildInlineRunPatchSchema,
} from './format/inline-run-patch.js';
export { PROPERTY_REGISTRY } from './styles/styles.js';
export type {
  PropertyDefinition,
  ObjectSchema,
  StylesAdapter,
  StylesApplyInput,
  StylesApplyRunInput,
  StylesApplyParagraphInput,
  StylesApplyOptions,
  StylesApplyReceipt,
  StylesBooleanState,
  StylesNumberState,
  StylesEnumState,
  StylesObjectState,
  StylesStateMap,
  StylesChannel,
  StylesJustification,
  StylesRunPatch,
  StylesParagraphPatch,
  StylesTargetResolution,
  StylesApplyReceiptSuccess,
  StylesApplyReceiptFailure,
  NormalizedStylesApplyOptions,
} from './styles/styles.js';
export type { CreateAdapter } from './create/create.js';
export type {
  TrackChangesAdapter,
  TrackChangesGetInput,
  TrackChangesListInput,
  TrackChangesAcceptInput,
  TrackChangesRejectInput,
  TrackChangesAcceptAllInput,
  TrackChangesRejectAllInput,
  ReviewDecideInput,
} from './track-changes/track-changes.js';
export type { BlocksAdapter } from './blocks/blocks.js';
export type { ListsAdapter } from './lists/lists.js';
export type { SectionsAdapter } from './sections/sections.js';
export type {
  ListInsertInput,
  ListItemAddress,
  ListItemInfo,
  ListKind,
  ListsExitResult,
  ListsGetInput,
  ListsInsertResult,
  ListsListQuery,
  ListsListResult,
  ListsMutateItemResult,
  ListSetTypeInput,
  ListTargetInput,
} from './lists/lists.types.js';
export { LIST_KINDS, LIST_INSERT_POSITIONS } from './lists/lists.types.js';
export type {
  CreateSectionBreakInput,
  CreateSectionBreakResult,
  DocumentMutationResult,
  SectionAddress,
  SectionBorderSpec,
  SectionBreakCreateLocation,
  SectionBreakType,
  SectionColumns,
  SectionDirection,
  SectionDomain,
  SectionHeaderFooterKind,
  SectionHeaderFooterMargins,
  SectionHeaderFooterRefs,
  SectionHeaderFooterVariant,
  SectionInfo,
  SectionLineNumbering,
  SectionLineNumberRestart,
  SectionMutationResult,
  SectionOrientation,
  SectionPageBorders,
  SectionPageMargins,
  SectionPageNumbering,
  SectionPageNumberingFormat,
  SectionPageSetup,
  SectionRangeDomain,
  SectionTargetInput,
  SectionVerticalAlign,
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
} from './sections/sections.types.js';
export type {
  CommentsCreateInput,
  CommentsPatchInput,
  CommentsDeleteInput,
  CommentsAdapter,
  GetCommentInput,
  // Legacy input types — exported for internal adapter use, not part of the contract.
  AddCommentInput,
  EditCommentInput,
  ReplyToCommentInput,
  MoveCommentInput,
  ResolveCommentInput,
  RemoveCommentInput,
  SetCommentInternalInput,
  GoToCommentInput,
  SetCommentActiveInput,
} from './comments/comments.js';
export type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments/comments.types.js';
export { DocumentApiValidationError } from './errors.js';
export type { InsertInput, InsertContentType } from './insert/insert.js';
export type { ReplaceInput } from './replace/replace.js';
export type { DeleteInput } from './delete/delete.js';

export interface TablesApi {
  convertFromText(input: TablesConvertFromTextInput, options?: MutationOptions): TableMutationResult;
  delete(input: TableLocator, options?: MutationOptions): TableMutationResult;
  clearContents(input: TableLocator, options?: MutationOptions): TableMutationResult;
  move(input: TablesMoveInput, options?: MutationOptions): TableMutationResult;
  split(input: TablesSplitInput, options?: MutationOptions): TableMutationResult;
  convertToText(input: TablesConvertToTextInput, options?: MutationOptions): TableMutationResult;
  setLayout(input: TablesSetLayoutInput, options?: MutationOptions): TableMutationResult;
  insertRow(input: TablesInsertRowInput, options?: MutationOptions): TableMutationResult;
  deleteRow(input: TablesDeleteRowInput, options?: MutationOptions): TableMutationResult;
  setRowHeight(input: TablesSetRowHeightInput, options?: MutationOptions): TableMutationResult;
  distributeRows(input: TablesDistributeRowsInput, options?: MutationOptions): TableMutationResult;
  setRowOptions(input: TablesSetRowOptionsInput, options?: MutationOptions): TableMutationResult;
  insertColumn(input: TablesInsertColumnInput, options?: MutationOptions): TableMutationResult;
  deleteColumn(input: TablesDeleteColumnInput, options?: MutationOptions): TableMutationResult;
  setColumnWidth(input: TablesSetColumnWidthInput, options?: MutationOptions): TableMutationResult;
  distributeColumns(input: TablesDistributeColumnsInput, options?: MutationOptions): TableMutationResult;
  insertCell(input: TablesInsertCellInput, options?: MutationOptions): TableMutationResult;
  deleteCell(input: TablesDeleteCellInput, options?: MutationOptions): TableMutationResult;
  mergeCells(input: TablesMergeCellsInput, options?: MutationOptions): TableMutationResult;
  unmergeCells(input: TablesUnmergeCellsInput, options?: MutationOptions): TableMutationResult;
  splitCell(input: TablesSplitCellInput, options?: MutationOptions): TableMutationResult;
  setCellProperties(input: TablesSetCellPropertiesInput, options?: MutationOptions): TableMutationResult;
  sort(input: TablesSortInput, options?: MutationOptions): TableMutationResult;
  setAltText(input: TablesSetAltTextInput, options?: MutationOptions): TableMutationResult;
  setStyle(input: TablesSetStyleInput, options?: MutationOptions): TableMutationResult;
  clearStyle(input: TablesClearStyleInput, options?: MutationOptions): TableMutationResult;
  setStyleOption(input: TablesSetStyleOptionInput, options?: MutationOptions): TableMutationResult;
  setBorder(input: TablesSetBorderInput, options?: MutationOptions): TableMutationResult;
  clearBorder(input: TablesClearBorderInput, options?: MutationOptions): TableMutationResult;
  applyBorderPreset(input: TablesApplyBorderPresetInput, options?: MutationOptions): TableMutationResult;
  setShading(input: TablesSetShadingInput, options?: MutationOptions): TableMutationResult;
  clearShading(input: TablesClearShadingInput, options?: MutationOptions): TableMutationResult;
  setTablePadding(input: TablesSetTablePaddingInput, options?: MutationOptions): TableMutationResult;
  setCellPadding(input: TablesSetCellPaddingInput, options?: MutationOptions): TableMutationResult;
  setCellSpacing(input: TablesSetCellSpacingInput, options?: MutationOptions): TableMutationResult;
  clearCellSpacing(input: TablesClearCellSpacingInput, options?: MutationOptions): TableMutationResult;
  get(input: TablesGetInput): TablesGetOutput;
  getCells(input: TablesGetCellsInput): TablesGetCellsOutput;
  getProperties(input: TablesGetPropertiesInput): TablesGetPropertiesOutput;
}

export type TablesAdapter = TablesApi;

/**
 * Callable capability accessor returned by `createDocumentApi`.
 *
 * Can be invoked directly (`capabilities()`) or via the `.get()` alias.
 */
export interface CapabilitiesApi {
  (): DocumentApiCapabilities;
  get(): DocumentApiCapabilities;
}

export interface QueryApi {
  match(input: QueryMatchInput): QueryMatchOutput;
}

export interface MutationsApi {
  preview(input: MutationsPreviewInput): MutationsPreviewOutput;
  apply(input: MutationsApplyInput): PlanReceipt;
}

export interface QueryAdapter {
  match(input: QueryMatchInput): QueryMatchOutput;
}

export interface MutationsAdapter {
  preview(input: MutationsPreviewInput): MutationsPreviewOutput;
  apply(input: MutationsApplyInput): PlanReceipt;
}

/**
 * The Document API interface for querying and inspecting document nodes.
 */
export interface DocumentApi {
  /**
   * Find nodes in the document matching a query.
   * @param query - A full query object specifying selection criteria.
   * @returns The query result containing matches and metadata.
   */
  find(query: Query): FindOutput;
  /**
   * Find nodes in the document matching a selector with optional options.
   * @param selector - A selector specifying what to find.
   * @param options - Optional find options (limit, offset, within, etc.).
   * @returns The query result containing matches and metadata.
   */
  find(selector: Selector, options?: FindOptions): FindOutput;
  /**
   * Get detailed information about a specific node by its address.
   * @param address - The node address to resolve.
   * @returns Full node information including typed properties.
   */
  getNode(address: NodeAddress): NodeInfo;
  /**
   * Get detailed information about a block node by its ID.
   * @param input - The node-id input payload.
   * @returns Full node information including typed properties.
   */
  getNodeById(input: GetNodeByIdInput): NodeInfo;
  /**
   * Return the full document text content.
   */
  getText(input: GetTextInput): string;
  /**
   * Return document summary info used by `doc.info`.
   */
  info(input: InfoInput): DocumentInfo;
  /**
   * Comment operations.
   */
  comments: CommentsApi;
  /**
   * Insert text at a target location.
   * If target is omitted, adapters resolve a deterministic default insertion point.
   */
  insert(input: InsertInput, options?: MutationOptions): TextMutationReceipt;
  /**
   * Replace text at a target range.
   */
  replace(input: ReplaceInput, options?: MutationOptions): TextMutationReceipt;
  /**
   * Delete text at a target range.
   */
  delete(input: DeleteInput, options?: MutationOptions): TextMutationReceipt;
  /**
   * Formatting operations.
   */
  format: FormatApi;
  /**
   * Stylesheet operations (docDefaults, style definitions).
   */
  styles: StylesApi;
  /**
   * Tracked-change operations (list, get, decide).
   */
  trackChanges: TrackChangesApi;
  /**
   * Block-level structural operations (delete whole blocks).
   */
  blocks: BlocksApi;
  /**
   * Structural creation operations.
   */
  create: CreateApi;
  /**
   * List item operations.
   */
  lists: ListsApi;
  /**
   * Section structure and page setup operations.
   */
  sections: SectionsApi;
  /**
   * Table operations.
   */
  tables: TablesApi;
  /**
   * Selector-based query with cardinality contracts for mutation targeting.
   */
  query: QueryApi;
  /**
   * Mutation plan engine — preview and apply atomic mutation plans.
   */
  mutations: MutationsApi;
  /**
   * Runtime capability introspection.
   *
   * Callable directly (`capabilities()`) or via `.get()`.
   */
  capabilities: CapabilitiesApi;
  /**
   * Dynamically dispatch any operation by its operation ID.
   *
   * For TypeScript consumers, the return type narrows based on the operationId.
   * For dynamic callers (AI agents, automation), accepts {@link DynamicInvokeRequest}
   * with `unknown` input. Invalid inputs produce adapter-level errors.
   *
   * @param request - Operation envelope with operationId, input, and optional options.
   * @returns The operation-specific result payload from the dispatched handler.
   * @throws {Error} When operationId is unknown.
   */
  invoke<T extends OperationId>(request: InvokeRequest<T>): InvokeResult<T>;
  invoke(request: DynamicInvokeRequest): unknown;
}

export interface DocumentApiAdapters {
  find: FindAdapter;
  getNode: GetNodeAdapter;
  getText: GetTextAdapter;
  info: InfoAdapter;
  capabilities: CapabilitiesAdapter;
  comments: CommentsAdapter;
  write: WriteAdapter;
  format: FormatAdapter;
  styles: StylesAdapter;
  trackChanges: TrackChangesAdapter;
  create: CreateAdapter;
  blocks: BlocksAdapter;
  lists: ListsAdapter;
  sections: SectionsAdapter;
  tables: TablesAdapter;
  query: QueryAdapter;
  mutations: MutationsAdapter;
}

/**
 * Creates a Document API instance from the provided adapters.
 *
 * @param adapters - Engine-specific adapters (find, getNode, comments, write, format, trackChanges, create, lists, tables).
 * @returns A {@link DocumentApi} instance.
 *
 * @example
 * ```ts
 * const api = createDocumentApi(adapters);
 * const result = api.find({ nodeType: 'heading' });
 * for (const item of result.items) {
 *   const node = api.getNode(item.address);
 *   console.log(node.properties);
 * }
 * ```
 */
function buildFormatInlineAliasApi(adapter: FormatAdapter): FormatInlineAliasApi {
  return Object.fromEntries(
    INLINE_PROPERTY_REGISTRY.map((entry) => {
      const key = entry.key as InlineRunPatchKey;
      const handler = (input: FormatInlineAliasInput<typeof key>, options?: MutationOptions) =>
        executeInlineAlias(adapter, key, input, options);
      return [key, handler];
    }),
  ) as FormatInlineAliasApi;
}

export function createDocumentApi(adapters: DocumentApiAdapters): DocumentApi {
  const capFn = () => executeCapabilities(adapters.capabilities);
  const capabilities: CapabilitiesApi = Object.assign(capFn, { get: capFn });
  const inlineAliasApi = buildFormatInlineAliasApi(adapters.format);

  const api: DocumentApi = {
    find(selectorOrQuery: Selector | Query, options?: FindOptions): FindOutput {
      return executeFind(adapters.find, selectorOrQuery, options);
    },
    getNode(address: NodeAddress): NodeInfo {
      return executeGetNode(adapters.getNode, address);
    },
    getNodeById(input: GetNodeByIdInput): NodeInfo {
      return executeGetNodeById(adapters.getNode, input);
    },
    getText(input: GetTextInput): string {
      return executeGetText(adapters.getText, input);
    },
    info(input: InfoInput): DocumentInfo {
      return executeInfo(adapters.info, input);
    },
    comments: {
      create(input: CommentsCreateInput, options?: RevisionGuardOptions): Receipt {
        return executeCommentsCreate(adapters.comments, input, options);
      },
      patch(input: CommentsPatchInput, options?: RevisionGuardOptions): Receipt {
        return executeCommentsPatch(adapters.comments, input, options);
      },
      delete(input: CommentsDeleteInput, options?: RevisionGuardOptions): Receipt {
        return executeCommentsDelete(adapters.comments, input, options);
      },
      get(input: GetCommentInput): CommentInfo {
        return executeGetComment(adapters.comments, input);
      },
      list(query?: CommentsListQuery): CommentsListResult {
        return executeListComments(adapters.comments, query);
      },
    },
    insert(input: InsertInput, options?: MutationOptions): TextMutationReceipt {
      return executeInsert(adapters.write, input, options);
    },
    replace(input: ReplaceInput, options?: MutationOptions): TextMutationReceipt {
      return executeReplace(adapters.write, input, options);
    },
    delete(input: DeleteInput, options?: MutationOptions): TextMutationReceipt {
      return executeDelete(adapters.write, input, options);
    },
    format: {
      ...inlineAliasApi,
      strikethrough(input: FormatStrikethroughInput, options?: MutationOptions): TextMutationReceipt {
        return executeInlineAlias(adapters.format, 'strike', { ...input, value: true }, options);
      },
      apply(input: StyleApplyInput, options?: MutationOptions): TextMutationReceipt {
        return executeStyleApply(adapters.format, input, options);
      },
      align(input: FormatAlignInput, options?: MutationOptions): TextMutationReceipt {
        return executeAlign(adapters.format, input, options);
      },
    },
    styles: {
      apply(input: StylesApplyInput, options?: StylesApplyOptions): StylesApplyReceipt {
        return executeStylesApply(adapters.styles, input, options);
      },
    },
    trackChanges: {
      list(input?: TrackChangesListInput): TrackChangesListResult {
        return executeTrackChangesList(adapters.trackChanges, input);
      },
      get(input: TrackChangesGetInput): TrackChangeInfo {
        return executeTrackChangesGet(adapters.trackChanges, input);
      },
      decide(input: ReviewDecideInput, options?: RevisionGuardOptions): Receipt {
        return executeTrackChangesDecide(adapters.trackChanges, input, options);
      },
    },
    blocks: {
      delete(input: BlocksDeleteInput, options?: MutationOptions): BlocksDeleteResult {
        return executeBlocksDelete(adapters.blocks, input, options);
      },
    },
    create: {
      paragraph(input: CreateParagraphInput, options?: MutationOptions): CreateParagraphResult {
        return executeCreateParagraph(adapters.create, input, options);
      },
      heading(input: CreateHeadingInput, options?: MutationOptions): CreateHeadingResult {
        return executeCreateHeading(adapters.create, input, options);
      },
      table(input: CreateTableInput, options?: MutationOptions): CreateTableResult {
        return executeCreateTable(adapters.create, input, options);
      },
      sectionBreak(input: CreateSectionBreakInput, options?: MutationOptions): CreateSectionBreakResult {
        return executeCreateSectionBreak(adapters.create, input, options);
      },
    },
    capabilities,
    lists: {
      list(query?: ListsListQuery): ListsListResult {
        return executeListsList(adapters.lists, query);
      },
      get(input: ListsGetInput): ListItemInfo {
        return executeListsGet(adapters.lists, input);
      },
      insert(input: ListInsertInput, options?: MutationOptions): ListsInsertResult {
        return executeListsInsert(adapters.lists, input, options);
      },
      setType(input: ListSetTypeInput, options?: MutationOptions): ListsMutateItemResult {
        return executeListsSetType(adapters.lists, input, options);
      },
      indent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult {
        return executeListsIndent(adapters.lists, input, options);
      },
      outdent(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult {
        return executeListsOutdent(adapters.lists, input, options);
      },
      restart(input: ListTargetInput, options?: MutationOptions): ListsMutateItemResult {
        return executeListsRestart(adapters.lists, input, options);
      },
      exit(input: ListTargetInput, options?: MutationOptions): ListsExitResult {
        return executeListsExit(adapters.lists, input, options);
      },
    },
    sections: {
      list(query?: SectionsListQuery): SectionsListResult {
        return executeSectionsList(adapters.sections, query);
      },
      get(input: SectionsGetInput): SectionInfo {
        return executeSectionsGet(adapters.sections, input);
      },
      setBreakType(input: SectionsSetBreakTypeInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetBreakType(adapters.sections, input, options);
      },
      setPageMargins(input: SectionsSetPageMarginsInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetPageMargins(adapters.sections, input, options);
      },
      setHeaderFooterMargins(
        input: SectionsSetHeaderFooterMarginsInput,
        options?: MutationOptions,
      ): SectionMutationResult {
        return executeSectionsSetHeaderFooterMargins(adapters.sections, input, options);
      },
      setPageSetup(input: SectionsSetPageSetupInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetPageSetup(adapters.sections, input, options);
      },
      setColumns(input: SectionsSetColumnsInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetColumns(adapters.sections, input, options);
      },
      setLineNumbering(input: SectionsSetLineNumberingInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetLineNumbering(adapters.sections, input, options);
      },
      setPageNumbering(input: SectionsSetPageNumberingInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetPageNumbering(adapters.sections, input, options);
      },
      setTitlePage(input: SectionsSetTitlePageInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetTitlePage(adapters.sections, input, options);
      },
      setOddEvenHeadersFooters(
        input: SectionsSetOddEvenHeadersFootersInput,
        options?: MutationOptions,
      ): DocumentMutationResult {
        return executeSectionsSetOddEvenHeadersFooters(adapters.sections, input, options);
      },
      setVerticalAlign(input: SectionsSetVerticalAlignInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetVerticalAlign(adapters.sections, input, options);
      },
      setSectionDirection(input: SectionsSetSectionDirectionInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetSectionDirection(adapters.sections, input, options);
      },
      setHeaderFooterRef(input: SectionsSetHeaderFooterRefInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetHeaderFooterRef(adapters.sections, input, options);
      },
      clearHeaderFooterRef(input: SectionsClearHeaderFooterRefInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsClearHeaderFooterRef(adapters.sections, input, options);
      },
      setLinkToPrevious(input: SectionsSetLinkToPreviousInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetLinkToPrevious(adapters.sections, input, options);
      },
      setPageBorders(input: SectionsSetPageBordersInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsSetPageBorders(adapters.sections, input, options);
      },
      clearPageBorders(input: SectionsClearPageBordersInput, options?: MutationOptions): SectionMutationResult {
        return executeSectionsClearPageBorders(adapters.sections, input, options);
      },
    },
    tables: {
      convertFromText(input, options?) {
        return executeTableOperation(
          'tables.convertFromText',
          adapters.tables.convertFromText.bind(adapters.tables),
          input,
          options,
        );
      },
      delete(input, options?) {
        return executeTableOperation('tables.delete', adapters.tables.delete.bind(adapters.tables), input, options);
      },
      clearContents(input, options?) {
        return executeTableOperation(
          'tables.clearContents',
          adapters.tables.clearContents.bind(adapters.tables),
          input,
          options,
        );
      },
      move(input, options?) {
        return executeTableOperation('tables.move', adapters.tables.move.bind(adapters.tables), input, options);
      },
      split(input, options?) {
        return executeTableOperation('tables.split', adapters.tables.split.bind(adapters.tables), input, options);
      },
      convertToText(input, options?) {
        return executeTableOperation(
          'tables.convertToText',
          adapters.tables.convertToText.bind(adapters.tables),
          input,
          options,
        );
      },
      setLayout(input, options?) {
        return executeTableOperation(
          'tables.setLayout',
          adapters.tables.setLayout.bind(adapters.tables),
          input,
          options,
        );
      },
      insertRow(input, options?) {
        return executeTableOperation(
          'tables.insertRow',
          adapters.tables.insertRow.bind(adapters.tables),
          input,
          options,
        );
      },
      deleteRow(input, options?) {
        return executeTableOperation(
          'tables.deleteRow',
          adapters.tables.deleteRow.bind(adapters.tables),
          input,
          options,
        );
      },
      setRowHeight(input, options?) {
        return executeTableOperation(
          'tables.setRowHeight',
          adapters.tables.setRowHeight.bind(adapters.tables),
          input,
          options,
        );
      },
      distributeRows(input, options?) {
        return executeTableOperation(
          'tables.distributeRows',
          adapters.tables.distributeRows.bind(adapters.tables),
          input,
          options,
        );
      },
      setRowOptions(input, options?) {
        return executeTableOperation(
          'tables.setRowOptions',
          adapters.tables.setRowOptions.bind(adapters.tables),
          input,
          options,
        );
      },
      insertColumn(input, options?) {
        return executeTableOperation(
          'tables.insertColumn',
          adapters.tables.insertColumn.bind(adapters.tables),
          input,
          options,
        );
      },
      deleteColumn(input, options?) {
        return executeTableOperation(
          'tables.deleteColumn',
          adapters.tables.deleteColumn.bind(adapters.tables),
          input,
          options,
        );
      },
      setColumnWidth(input, options?) {
        return executeTableOperation(
          'tables.setColumnWidth',
          adapters.tables.setColumnWidth.bind(adapters.tables),
          input,
          options,
        );
      },
      distributeColumns(input, options?) {
        return executeTableOperation(
          'tables.distributeColumns',
          adapters.tables.distributeColumns.bind(adapters.tables),
          input,
          options,
        );
      },
      insertCell(input, options?) {
        return executeTableOperation(
          'tables.insertCell',
          adapters.tables.insertCell.bind(adapters.tables),
          input,
          options,
        );
      },
      deleteCell(input, options?) {
        return executeTableOperation(
          'tables.deleteCell',
          adapters.tables.deleteCell.bind(adapters.tables),
          input,
          options,
        );
      },
      mergeCells(input, options?) {
        return executeTableOperation(
          'tables.mergeCells',
          adapters.tables.mergeCells.bind(adapters.tables),
          input,
          options,
        );
      },
      unmergeCells(input, options?) {
        return executeTableOperation(
          'tables.unmergeCells',
          adapters.tables.unmergeCells.bind(adapters.tables),
          input,
          options,
        );
      },
      splitCell(input, options?) {
        return executeTableOperation(
          'tables.splitCell',
          adapters.tables.splitCell.bind(adapters.tables),
          input,
          options,
        );
      },
      setCellProperties(input, options?) {
        return executeTableOperation(
          'tables.setCellProperties',
          adapters.tables.setCellProperties.bind(adapters.tables),
          input,
          options,
        );
      },
      sort(input, options?) {
        return executeTableOperation('tables.sort', adapters.tables.sort.bind(adapters.tables), input, options);
      },
      setAltText(input, options?) {
        return executeTableOperation(
          'tables.setAltText',
          adapters.tables.setAltText.bind(adapters.tables),
          input,
          options,
        );
      },
      setStyle(input, options?) {
        return executeTableOperation('tables.setStyle', adapters.tables.setStyle.bind(adapters.tables), input, options);
      },
      clearStyle(input, options?) {
        return executeTableOperation(
          'tables.clearStyle',
          adapters.tables.clearStyle.bind(adapters.tables),
          input,
          options,
        );
      },
      setStyleOption(input, options?) {
        return executeTableOperation(
          'tables.setStyleOption',
          adapters.tables.setStyleOption.bind(adapters.tables),
          input,
          options,
        );
      },
      setBorder(input, options?) {
        return executeTableOperation(
          'tables.setBorder',
          adapters.tables.setBorder.bind(adapters.tables),
          input,
          options,
        );
      },
      clearBorder(input, options?) {
        return executeTableOperation(
          'tables.clearBorder',
          adapters.tables.clearBorder.bind(adapters.tables),
          input,
          options,
        );
      },
      applyBorderPreset(input, options?) {
        return executeTableOperation(
          'tables.applyBorderPreset',
          adapters.tables.applyBorderPreset.bind(adapters.tables),
          input,
          options,
        );
      },
      setShading(input, options?) {
        return executeTableOperation(
          'tables.setShading',
          adapters.tables.setShading.bind(adapters.tables),
          input,
          options,
        );
      },
      clearShading(input, options?) {
        return executeTableOperation(
          'tables.clearShading',
          adapters.tables.clearShading.bind(adapters.tables),
          input,
          options,
        );
      },
      setTablePadding(input, options?) {
        return executeTableOperation(
          'tables.setTablePadding',
          adapters.tables.setTablePadding.bind(adapters.tables),
          input,
          options,
        );
      },
      setCellPadding(input, options?) {
        return executeTableOperation(
          'tables.setCellPadding',
          adapters.tables.setCellPadding.bind(adapters.tables),
          input,
          options,
        );
      },
      setCellSpacing(input, options?) {
        return executeTableOperation(
          'tables.setCellSpacing',
          adapters.tables.setCellSpacing.bind(adapters.tables),
          input,
          options,
        );
      },
      clearCellSpacing(input, options?) {
        return executeTableOperation(
          'tables.clearCellSpacing',
          adapters.tables.clearCellSpacing.bind(adapters.tables),
          input,
          options,
        );
      },
      get(input) {
        return adapters.tables.get(input);
      },
      getCells(input) {
        return adapters.tables.getCells(input);
      },
      getProperties(input) {
        return adapters.tables.getProperties(input);
      },
    },
    query: {
      match(input: QueryMatchInput): QueryMatchOutput {
        return adapters.query.match(input);
      },
    },
    mutations: {
      preview(input: MutationsPreviewInput): MutationsPreviewOutput {
        return adapters.mutations.preview(input);
      },
      apply(input: MutationsApplyInput): PlanReceipt {
        return adapters.mutations.apply(input);
      },
    },
    invoke(request: DynamicInvokeRequest): unknown {
      if (!Object.prototype.hasOwnProperty.call(dispatch, request.operationId)) {
        throw new Error(`Unknown operationId: "${request.operationId}"`);
      }
      // Safe: InvokeRequest<T> provides caller-side type safety.
      // Dynamic callers accept adapter-level validation.
      const handler = dispatch[request.operationId] as unknown as (input: unknown, options?: unknown) => unknown;
      return handler(request.input, request.options);
    },
  };

  const dispatch = buildDispatchTable(api);

  return api;
}
