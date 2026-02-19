import type {
  BlockNodeType as DocumentApiBlockNodeType,
  CreateParagraphInput as DocumentApiCreateParagraphInput,
  CreateParagraphResult as DocumentApiCreateParagraphResult,
  ListInsertInput as DocumentApiListInsertInput,
  ListItemAddress as DocumentApiListItemAddress,
  ListItemInfo as DocumentApiListItemInfo,
  ListKind as DocumentApiListKind,
  ListSetTypeInput as DocumentApiListSetTypeInput,
  ListsExitResult as DocumentApiListsExitResult,
  ListsGetInput as DocumentApiListsGetInput,
  ListsInsertResult as DocumentApiListsInsertResult,
  ListsListQuery as DocumentApiListsListQuery,
  ListsListResult as DocumentApiListsListResult,
  ListsMutateItemResult as DocumentApiListsMutateItemResult,
  ListTargetInput as DocumentApiListTargetInput,
  NodeAddress as DocumentApiNodeAddress,
  NodeKind as DocumentApiNodeKind,
  NodeType as DocumentApiNodeType,
  Query as DocumentApiQuery,
  QueryResult as DocumentApiQueryResult,
  Selector as DocumentApiSelector,
  TextAddress as DocumentApiTextAddress,
} from '@superdoc/document-api';
import type { CollaborationSessionPool } from '../host/collab-session-pool';

export type NodeKind = DocumentApiNodeKind;
export type NodeType = DocumentApiNodeType;
export type BlockNodeType = DocumentApiBlockNodeType;
export type NodeAddress = DocumentApiNodeAddress;
export type TextAddress = DocumentApiTextAddress;
export type CreateParagraphInput = DocumentApiCreateParagraphInput;
export type CreateParagraphResult = DocumentApiCreateParagraphResult;
export type ListItemAddress = DocumentApiListItemAddress;
export type ListItemInfo = DocumentApiListItemInfo;
export type ListKind = DocumentApiListKind;
export type ListsListQuery = DocumentApiListsListQuery;
export type ListsListResult = DocumentApiListsListResult;
export type ListsGetInput = DocumentApiListsGetInput;
export type ListInsertInput = DocumentApiListInsertInput;
export type ListSetTypeInput = DocumentApiListSetTypeInput;
export type ListTargetInput = DocumentApiListTargetInput;
export type ListsInsertResult = DocumentApiListsInsertResult;
export type ListsMutateItemResult = DocumentApiListsMutateItemResult;
export type ListsExitResult = DocumentApiListsExitResult;
export type Selector = DocumentApiSelector;
export type Query = DocumentApiQuery;
export type QueryResult = DocumentApiQueryResult;

export type OutputMode = 'json' | 'pretty';
export type ExecutionMode = 'oneshot' | 'host';

export interface GlobalOptions {
  output: OutputMode;
  timeoutMs?: number;
  sessionId?: string;
  help: boolean;
}

export interface CliIO {
  stdout(message: string): void;
  stderr(message: string): void;
  readStdinBytes(): Promise<Uint8Array>;
  now(): number;
}

export interface CommandExecution {
  command: string;
  data: unknown;
  pretty: string;
}

export interface CommandContext {
  io: CliIO;
  timeoutMs?: number;
  sessionId?: string;
  executionMode?: ExecutionMode;
  collabSessionPool?: CollaborationSessionPool;
}

export interface DocumentSourceMeta {
  source: 'path' | 'stdin';
  path?: string;
  byteLength: number;
}
