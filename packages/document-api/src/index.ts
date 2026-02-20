/**
 * Engine-agnostic Document API surface.
 */

export * from './types/index.js';
export * from './contract/index.js';
export * from './capabilities/capabilities.js';

import type {
  CreateParagraphInput,
  CreateParagraphResult,
  DocumentInfo,
  NodeAddress,
  NodeInfo,
  Query,
  QueryResult,
  Receipt,
  Selector,
  TextMutationReceipt,
  TrackChangeInfo,
  TrackChangesListResult,
} from './types/index.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments/comments.types.js';
import type {
  AddCommentInput,
  CommentsAdapter,
  CommentsApi,
  EditCommentInput,
  GetCommentInput,
  GoToCommentInput,
  MoveCommentInput,
  RemoveCommentInput,
  ReplyToCommentInput,
  ResolveCommentInput,
  SetCommentActiveInput,
  SetCommentInternalInput,
} from './comments/comments.js';
import {
  executeAddComment,
  executeEditComment,
  executeGetComment,
  executeGoToComment,
  executeListComments,
  executeMoveComment,
  executeRemoveComment,
  executeReplyToComment,
  executeResolveComment,
  executeSetCommentActive,
  executeSetCommentInternal,
} from './comments/comments.js';
import type { DeleteInput } from './delete/delete.js';
import { executeFind, type FindAdapter, type FindOptions } from './find/find.js';
import type {
  FormatAdapter,
  FormatApi,
  FormatBoldInput,
  FormatItalicInput,
  FormatUnderlineInput,
  FormatStrikethroughInput,
} from './format/format.js';
import {
  executeFormatBold,
  executeFormatItalic,
  executeFormatUnderline,
  executeFormatStrikethrough,
} from './format/format.js';
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
import { executeCreateParagraph, executeCreateHeading } from './create/create.js';
import type { CreateHeadingInput, CreateHeadingResult } from './types/create.types.js';
import type {
  TrackChangesAcceptAllInput,
  TrackChangesAcceptInput,
  TrackChangesAdapter,
  TrackChangesApi,
  TrackChangesGetInput,
  TrackChangesListInput,
  TrackChangesRejectAllInput,
  TrackChangesRejectInput,
} from './track-changes/track-changes.js';
import {
  executeTrackChangesAccept,
  executeTrackChangesAcceptAll,
  executeTrackChangesGet,
  executeTrackChangesList,
  executeTrackChangesReject,
  executeTrackChangesRejectAll,
} from './track-changes/track-changes.js';
import type { MutationOptions, WriteAdapter } from './write/write.js';
import {
  executeCapabilities,
  type CapabilitiesAdapter,
  type DocumentApiCapabilities,
} from './capabilities/capabilities.js';
import type { OperationId } from './contract/types.js';
import type { DynamicInvokeRequest, InvokeRequest, InvokeResult } from './contract/operation-registry.js';
import { buildDispatchTable } from './invoke/invoke.js';

export type { FindAdapter, FindOptions } from './find/find.js';
export type { GetNodeAdapter, GetNodeByIdInput } from './get-node/get-node.js';
export type { GetTextAdapter, GetTextInput } from './get-text/get-text.js';
export type { InfoAdapter, InfoInput } from './info/info.js';
export type { MutationOptions, WriteAdapter, WriteRequest } from './write/write.js';
export type {
  FormatAdapter,
  FormatBoldInput,
  FormatItalicInput,
  FormatUnderlineInput,
  FormatStrikethroughInput,
} from './format/format.js';
export type { CreateAdapter } from './create/create.js';
export type {
  TrackChangesAcceptAllInput,
  TrackChangesAcceptInput,
  TrackChangesAdapter,
  TrackChangesGetInput,
  TrackChangesListInput,
  TrackChangesRejectAllInput,
  TrackChangesRejectInput,
} from './track-changes/track-changes.js';
export type { ListsAdapter } from './lists/lists.js';
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
  AddCommentInput,
  CommentsAdapter,
  EditCommentInput,
  GetCommentInput,
  GoToCommentInput,
  MoveCommentInput,
  RemoveCommentInput,
  ReplyToCommentInput,
  ResolveCommentInput,
  SetCommentActiveInput,
  SetCommentInternalInput,
} from './comments/comments.js';
export type { CommentInfo, CommentsListQuery, CommentsListResult } from './comments/comments.types.js';
export { DocumentApiValidationError } from './errors.js';
export type { InsertInput } from './insert/insert.js';
export type { ReplaceInput } from './replace/replace.js';
export type { DeleteInput } from './delete/delete.js';

/**
 * Callable capability accessor returned by `createDocumentApi`.
 *
 * Can be invoked directly (`capabilities()`) or via the `.get()` alias.
 */
export interface CapabilitiesApi {
  (): DocumentApiCapabilities;
  get(): DocumentApiCapabilities;
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
  find(query: Query): QueryResult;
  /**
   * Find nodes in the document matching a selector with optional options.
   * @param selector - A selector specifying what to find.
   * @param options - Optional find options (limit, offset, within, etc.).
   * @returns The query result containing matches and metadata.
   */
  find(selector: Selector, options?: FindOptions): QueryResult;
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
   * Tracked-change lifecycle operations.
   */
  trackChanges: TrackChangesApi;
  /**
   * Structural creation operations.
   */
  create: CreateApi;
  /**
   * List item operations.
   */
  lists: ListsApi;
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
  trackChanges: TrackChangesAdapter;
  create: CreateAdapter;
  lists: ListsAdapter;
}

/**
 * Creates a Document API instance from the provided adapters.
 *
 * @param adapters - Engine-specific adapters (find, getNode, comments, write, format, trackChanges, create, lists).
 * @returns A {@link DocumentApi} instance.
 *
 * @example
 * ```ts
 * const api = createDocumentApi(adapters);
 * const result = api.find({ nodeType: 'heading' });
 * for (const address of result.matches) {
 *   const node = api.getNode(address);
 *   console.log(node.properties);
 * }
 * ```
 */
export function createDocumentApi(adapters: DocumentApiAdapters): DocumentApi {
  const capFn = () => executeCapabilities(adapters.capabilities);
  const capabilities: CapabilitiesApi = Object.assign(capFn, { get: capFn });

  const api: DocumentApi = {
    find(selectorOrQuery: Selector | Query, options?: FindOptions): QueryResult {
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
      add(input: AddCommentInput): Receipt {
        return executeAddComment(adapters.comments, input);
      },
      edit(input: EditCommentInput): Receipt {
        return executeEditComment(adapters.comments, input);
      },
      reply(input: ReplyToCommentInput): Receipt {
        return executeReplyToComment(adapters.comments, input);
      },
      move(input: MoveCommentInput): Receipt {
        return executeMoveComment(adapters.comments, input);
      },
      resolve(input: ResolveCommentInput): Receipt {
        return executeResolveComment(adapters.comments, input);
      },
      remove(input: RemoveCommentInput): Receipt {
        return executeRemoveComment(adapters.comments, input);
      },
      setInternal(input: SetCommentInternalInput): Receipt {
        return executeSetCommentInternal(adapters.comments, input);
      },
      setActive(input: SetCommentActiveInput): Receipt {
        return executeSetCommentActive(adapters.comments, input);
      },
      goTo(input: GoToCommentInput): Receipt {
        return executeGoToComment(adapters.comments, input);
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
      bold(input: FormatBoldInput, options?: MutationOptions): TextMutationReceipt {
        return executeFormatBold(adapters.format, input, options);
      },
      italic(input: FormatItalicInput, options?: MutationOptions): TextMutationReceipt {
        return executeFormatItalic(adapters.format, input, options);
      },
      underline(input: FormatUnderlineInput, options?: MutationOptions): TextMutationReceipt {
        return executeFormatUnderline(adapters.format, input, options);
      },
      strikethrough(input: FormatStrikethroughInput, options?: MutationOptions): TextMutationReceipt {
        return executeFormatStrikethrough(adapters.format, input, options);
      },
    },
    trackChanges: {
      list(input?: TrackChangesListInput): TrackChangesListResult {
        return executeTrackChangesList(adapters.trackChanges, input);
      },
      get(input: TrackChangesGetInput): TrackChangeInfo {
        return executeTrackChangesGet(adapters.trackChanges, input);
      },
      accept(input: TrackChangesAcceptInput): Receipt {
        return executeTrackChangesAccept(adapters.trackChanges, input);
      },
      reject(input: TrackChangesRejectInput): Receipt {
        return executeTrackChangesReject(adapters.trackChanges, input);
      },
      acceptAll(input: TrackChangesAcceptAllInput): Receipt {
        return executeTrackChangesAcceptAll(adapters.trackChanges, input);
      },
      rejectAll(input: TrackChangesRejectAllInput): Receipt {
        return executeTrackChangesRejectAll(adapters.trackChanges, input);
      },
    },
    create: {
      paragraph(input: CreateParagraphInput, options?: MutationOptions): CreateParagraphResult {
        return executeCreateParagraph(adapters.create, input, options);
      },
      heading(input: CreateHeadingInput, options?: MutationOptions): CreateHeadingResult {
        return executeCreateHeading(adapters.create, input, options);
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
