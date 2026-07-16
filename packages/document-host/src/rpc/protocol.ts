/**
 * JSON-RPC 2.0 framing and the document host method contract.
 *
 * A new, minimal protocol over `@superdoc/document-host`. No CLI argv, no
 * `cli.invoke` compatibility, no agent vocabulary, and no imports from CLI code.
 * Exactly five methods are exposed.
 */

export const PROTOCOL_VERSION = '1.0';

/** The five document methods. Nothing else is exposed over the wire. */
export const Method = {
  Open: 'document.open',
  Invoke: 'document.invoke',
  Export: 'document.export',
  Close: 'document.close',
  Capabilities: 'document.capabilities',
} as const;
export type MethodName = (typeof Method)[keyof typeof Method];

/** Max decoded size for an inbound (open) or outbound (export) .docx: 32 MiB. */
export const MAX_DOCX_BYTES = 32 * 1024 * 1024;

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}
export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}
export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: HostErrorData;
}
export interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcErrorObject;
}
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/**
 * Numeric error codes: JSON-RPC reserved (-326xx) plus a small app range
 * (-320xx). Domain failures from the document API keep their own code in
 * `data.domainCode` - it is never collapsed into the numeric code.
 */
export const RpcCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  SessionNotFound: -32000,
  UnknownOperation: -32010,
  PayloadTooLarge: -32020,
  OperationFailed: -32030,
} as const;

/** Structured context attached to every error so agents can recover. */
export interface HostErrorData {
  domainCode?: string;
  details?: unknown;
  operationId?: string;
  sessionId?: string;
}

/** Tagged union for the open source - no bare `bytes | "blank"` ambiguity. */
export type OpenSource = { kind: 'blank' } | { kind: 'docxBase64'; data: string };

export interface OpenParams {
  source: OpenSource;
  documentId?: string;
  /** Per-session author identity attributed to tracked changes and comments. */
  user?: { id?: string; name?: string };
}
export interface InvokeParams {
  sessionId: string;
  operationId: string;
  input?: unknown;
  options?: unknown;
}
export interface SessionParams {
  sessionId: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function makeSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

export function makeError(id: JsonRpcId, code: number, message: string, data?: HostErrorData): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

export function serializeFrame(frame: JsonRpcResponse): string {
  return `${JSON.stringify(frame)}\n`;
}
