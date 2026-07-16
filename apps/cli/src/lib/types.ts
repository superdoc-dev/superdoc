import type {
  BlockNodeType as DocumentApiBlockNodeType,
  CreateParagraphInput as DocumentApiCreateParagraphInput,
  CreateParagraphResult as DocumentApiCreateParagraphResult,
  ListInsertInput as DocumentApiListInsertInput,
  ListItemAddress as DocumentApiListItemAddress,
  ListItemInfo as DocumentApiListItemInfo,
  ListKind as DocumentApiListKind,
  ListsGetInput as DocumentApiListsGetInput,
  ListsInsertResult as DocumentApiListsInsertResult,
  ListsListQuery as DocumentApiListsListQuery,
  ListsListResult as DocumentApiListsListResult,
  ListsMutateItemResult as DocumentApiListsMutateItemResult,
  ListsSetTypeInput as DocumentApiListsSetTypeInput,
  ListTargetInput as DocumentApiListTargetInput,
  NodeAddress as DocumentApiNodeAddress,
  NodeKind as DocumentApiNodeKind,
  NodeType as DocumentApiNodeType,
  Query as DocumentApiQuery,
  FindOutput as DocumentApiFindOutput,
  Selector as DocumentApiSelector,
  TextAddress as DocumentApiTextAddress,
} from '@superdoc/document-api';
import type { SessionPool } from '../host/session-pool';

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
export type ListSetTypeInput = DocumentApiListsSetTypeInput;
export type ListTargetInput = DocumentApiListTargetInput;
export type ListsInsertResult = DocumentApiListsInsertResult;
export type ListsMutateItemResult = DocumentApiListsMutateItemResult;
export type Selector = DocumentApiSelector;
export type Query = DocumentApiQuery;
export type FindOutput = DocumentApiFindOutput;

/** User identity for attribution in comments, tracked changes, and collaboration presence. */
export type UserIdentity = { name: string; email: string };

/**
 * Runtime kind selected when opening a document. This branch is v1-only:
 * v1 wraps the legacy `Editor` + v1 Document API adapters. The field is
 * retained for forward/backward compatibility of persisted session metadata,
 * but `'v1'` is the only accepted value. Defaults to v1 when omitted.
 */
export type DocumentRuntimeKind = 'v1';

export type OutputMode = 'json' | 'pretty';
export type ExecutionMode = 'oneshot' | 'host';

export interface GlobalOptions {
  output: OutputMode;
  timeoutMs?: number;
  sessionId?: string;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

export interface CliIO {
  stdout(message: string): void;
  stderr(message: string): void;
  warn?(message: string): void;
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
  sessionPool?: SessionPool;
  /** Indicates whether command args came from direct CLI flags or `call --input-json`. */
  argumentSource?: 'cli' | 'input';
}

export interface DocumentSourceMeta {
  source: 'path' | 'stdin' | 'blank';
  path?: string;
  byteLength: number;
}
