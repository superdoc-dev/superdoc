/**
 * Canonical type-level mapping from OperationId to input, options, and output types.
 *
 * This interface is the single source of truth for the invoke dispatch layer.
 * The bidirectional completeness checks at the bottom of this file guarantee
 * that every OperationId has a registry entry and vice versa.
 */

import type { OperationId } from './types.js';

import type { NodeAddress, NodeInfo, QueryResult, Selector, Query } from '../types/index.js';
import type { TextMutationReceipt, Receipt } from '../types/receipt.js';
import type { DocumentInfo } from '../types/info.types.js';
import type {
  CreateParagraphInput,
  CreateParagraphResult,
  CreateHeadingInput,
  CreateHeadingResult,
} from '../types/create.types.js';

import type { FindOptions } from '../find/find.js';
import type { GetNodeByIdInput } from '../get-node/get-node.js';
import type { GetTextInput } from '../get-text/get-text.js';
import type { InfoInput } from '../info/info.js';
import type { InsertInput } from '../insert/insert.js';
import type { ReplaceInput } from '../replace/replace.js';
import type { DeleteInput } from '../delete/delete.js';
import type { MutationOptions } from '../write/write.js';
import type {
  FormatBoldInput,
  FormatItalicInput,
  FormatUnderlineInput,
  FormatStrikethroughInput,
} from '../format/format.js';
import type {
  AddCommentInput,
  EditCommentInput,
  ReplyToCommentInput,
  MoveCommentInput,
  ResolveCommentInput,
  RemoveCommentInput,
  SetCommentInternalInput,
  SetCommentActiveInput,
  GoToCommentInput,
  GetCommentInput,
} from '../comments/comments.js';
import type { CommentInfo, CommentsListQuery, CommentsListResult } from '../comments/comments.types.js';
import type {
  TrackChangesListInput,
  TrackChangesGetInput,
  TrackChangesAcceptInput,
  TrackChangesRejectInput,
  TrackChangesAcceptAllInput,
  TrackChangesRejectAllInput,
} from '../track-changes/track-changes.js';
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

export interface OperationRegistry {
  // --- Singleton reads ---
  find: { input: Selector | Query; options: FindOptions; output: QueryResult };
  getNode: { input: NodeAddress; options: never; output: NodeInfo };
  getNodeById: { input: GetNodeByIdInput; options: never; output: NodeInfo };
  getText: { input: GetTextInput; options: never; output: string };
  info: { input: InfoInput; options: never; output: DocumentInfo };

  // --- Singleton mutations ---
  insert: { input: InsertInput; options: MutationOptions; output: TextMutationReceipt };
  replace: { input: ReplaceInput; options: MutationOptions; output: TextMutationReceipt };
  delete: { input: DeleteInput; options: MutationOptions; output: TextMutationReceipt };

  // --- format.* ---
  'format.bold': { input: FormatBoldInput; options: MutationOptions; output: TextMutationReceipt };
  'format.italic': { input: FormatItalicInput; options: MutationOptions; output: TextMutationReceipt };
  'format.underline': { input: FormatUnderlineInput; options: MutationOptions; output: TextMutationReceipt };
  'format.strikethrough': { input: FormatStrikethroughInput; options: MutationOptions; output: TextMutationReceipt };

  // --- create.* ---
  'create.paragraph': { input: CreateParagraphInput; options: MutationOptions; output: CreateParagraphResult };
  'create.heading': { input: CreateHeadingInput; options: MutationOptions; output: CreateHeadingResult };

  // --- lists.* ---
  'lists.list': { input: ListsListQuery | undefined; options: never; output: ListsListResult };
  'lists.get': { input: ListsGetInput; options: never; output: ListItemInfo };
  'lists.insert': { input: ListInsertInput; options: MutationOptions; output: ListsInsertResult };
  'lists.setType': { input: ListSetTypeInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.indent': { input: ListTargetInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.outdent': { input: ListTargetInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.restart': { input: ListTargetInput; options: MutationOptions; output: ListsMutateItemResult };
  'lists.exit': { input: ListTargetInput; options: MutationOptions; output: ListsExitResult };

  // --- comments.* ---
  'comments.add': { input: AddCommentInput; options: never; output: Receipt };
  'comments.edit': { input: EditCommentInput; options: never; output: Receipt };
  'comments.reply': { input: ReplyToCommentInput; options: never; output: Receipt };
  'comments.move': { input: MoveCommentInput; options: never; output: Receipt };
  'comments.resolve': { input: ResolveCommentInput; options: never; output: Receipt };
  'comments.remove': { input: RemoveCommentInput; options: never; output: Receipt };
  'comments.setInternal': { input: SetCommentInternalInput; options: never; output: Receipt };
  'comments.setActive': { input: SetCommentActiveInput; options: never; output: Receipt };
  'comments.goTo': { input: GoToCommentInput; options: never; output: Receipt };
  'comments.get': { input: GetCommentInput; options: never; output: CommentInfo };
  'comments.list': { input: CommentsListQuery | undefined; options: never; output: CommentsListResult };

  // --- trackChanges.* ---
  'trackChanges.list': { input: TrackChangesListInput | undefined; options: never; output: TrackChangesListResult };
  'trackChanges.get': { input: TrackChangesGetInput; options: never; output: TrackChangeInfo };
  'trackChanges.accept': { input: TrackChangesAcceptInput; options: never; output: Receipt };
  'trackChanges.reject': { input: TrackChangesRejectInput; options: never; output: Receipt };
  'trackChanges.acceptAll': { input: TrackChangesAcceptAllInput; options: never; output: Receipt };
  'trackChanges.rejectAll': { input: TrackChangesRejectAllInput; options: never; output: Receipt };

  // --- capabilities ---
  'capabilities.get': { input: undefined; options: never; output: DocumentApiCapabilities };
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
