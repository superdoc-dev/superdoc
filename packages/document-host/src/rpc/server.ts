/**
 * Document host RPC server: dispatches the four document methods to live
 * sessions. Pure logic over `@superdoc/document-host` + `@superdoc/document-api`.
 * No transport details here (see stdio.ts), no CLI imports.
 */

import { randomUUID, createHash } from 'node:crypto';
import { openDocument, type DocumentSession } from '../index';
import { COMMAND_CATALOG } from '@superdoc/document-api';
import {
  Method,
  RpcCode,
  MAX_DOCX_BYTES,
  PROTOCOL_VERSION,
  isRecord,
  makeSuccess,
  makeError,
  type JsonRpcId,
  type JsonRpcResponse,
  type OpenSource,
} from './protocol';

/** Valid operation ids = the document API's operation catalog keys. */
const VALID_OPERATION_IDS: ReadonlySet<string> = new Set(Object.keys(COMMAND_CATALOG));

function estimateBase64Bytes(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - pad;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
function isStrictBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64_RE.test(value);
}

/**
 * Preserve a structured domain code/details from ANY error that carries a
 * string `code` - not just DocumentApiValidationError. Super-editor adapters
 * throw structured errors too, and agents need the code to drive repair.
 */
function extractDomainError(error: unknown): { domainCode?: string; details?: unknown } {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return { domainCode: code, details: (error as { details?: unknown }).details };
    }
  }
  return {};
}

function readId(request: Record<string, unknown>): JsonRpcId {
  const id = request.id;
  return typeof id === 'string' || typeof id === 'number' || id === null ? id : null;
}

export class DocumentHostServer {
  private readonly sessions = new Map<string, DocumentSession>();

  /** Live session count (diagnostics/tests). */
  get sessionCount(): number {
    return this.sessions.size;
  }

  async handle(request: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return makeError(null, RpcCode.InvalidRequest, 'Invalid JSON-RPC request.');
    }
    // A present `id` of a non-spec type (not string/number/null) is a malformed frame: reject it as
    // InvalidRequest rather than coercing it to null and running a side-effecting method on it.
    if ('id' in request && request.id !== null && typeof request.id !== 'string' && typeof request.id !== 'number') {
      return makeError(
        null,
        RpcCode.InvalidRequest,
        'Invalid JSON-RPC request: "id" must be a string, number, or null.',
      );
    }
    const id = readId(request);
    const params = request.params;

    try {
      switch (request.method) {
        case Method.Open:
          return await this.handleOpen(id, params);
        case Method.Invoke:
          return await this.handleInvoke(id, params);
        case Method.Export:
          return await this.handleExport(id, params);
        case Method.Close:
          return this.handleClose(id, params);
        case Method.Capabilities:
          return this.handleCapabilities(id);
        default:
          return makeError(id, RpcCode.MethodNotFound, `Method not found: ${request.method}`);
      }
    } catch (error) {
      return makeError(id, RpcCode.InternalError, errorMessage(error));
    }
  }

  /** Close every live session. Call on shutdown / stdin end. */
  closeAll(): void {
    for (const session of this.sessions.values()) {
      try {
        session.close();
      } catch {
        // best-effort cleanup
      }
    }
    this.sessions.clear();
  }

  private async handleOpen(id: JsonRpcId, params: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(params) || !isRecord(params.source)) {
      return makeError(
        id,
        RpcCode.InvalidParams,
        'open requires params.source: { kind: "blank" } | { kind: "docxBase64", data: string }.',
      );
    }
    const source = params.source as OpenSource;

    let bytes: Uint8Array | undefined;
    if (source.kind === 'blank') {
      bytes = undefined;
    } else if (source.kind === 'docxBase64') {
      if (typeof source.data !== 'string') {
        return makeError(id, RpcCode.InvalidParams, 'open: source.data must be a base64 string.');
      }
      if (!isStrictBase64(source.data)) {
        return makeError(id, RpcCode.InvalidParams, 'open: source.data is not valid base64.');
      }
      if (estimateBase64Bytes(source.data) > MAX_DOCX_BYTES) {
        return makeError(id, RpcCode.PayloadTooLarge, `open: docx exceeds ${MAX_DOCX_BYTES} bytes.`, {
          details: { maxBytes: MAX_DOCX_BYTES },
        });
      }
      const buf = Buffer.from(source.data, 'base64');
      if (buf.byteLength > MAX_DOCX_BYTES) {
        return makeError(id, RpcCode.PayloadTooLarge, `open: docx exceeds ${MAX_DOCX_BYTES} bytes.`, {
          details: { maxBytes: MAX_DOCX_BYTES, byteLength: buf.byteLength },
        });
      }
      bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } else {
      return makeError(id, RpcCode.InvalidParams, 'open: unknown source.kind.');
    }

    const documentId = typeof params.documentId === 'string' ? params.documentId : undefined;

    // Optional per-session author identity. Validate shape here so a malformed
    // user is a clean InvalidParams instead of leaking into the engine. Absent
    // user keeps env/default behavior (fully backward compatible).
    let user: { id?: string; name?: string } | undefined;
    if ('user' in params && params.user !== undefined) {
      if (!isRecord(params.user)) {
        return makeError(
          id,
          RpcCode.InvalidParams,
          'open: params.user must be an object with optional string id/name.',
        );
      }
      const { id: userId, name: userName } = params.user;
      if (userId !== undefined && typeof userId !== 'string') {
        return makeError(id, RpcCode.InvalidParams, 'open: params.user.id must be a string when provided.');
      }
      if (userName !== undefined && typeof userName !== 'string') {
        return makeError(id, RpcCode.InvalidParams, 'open: params.user.name must be a string when provided.');
      }
      user = {
        ...(userId !== undefined ? { id: userId } : {}),
        ...(userName !== undefined ? { name: userName } : {}),
      };
    }

    const openOptions = {
      ...(documentId ? { documentId } : {}),
      ...(user ? { user } : {}),
    };
    const session = await openDocument(bytes, openOptions);
    const sessionId = randomUUID();
    this.sessions.set(sessionId, session);
    return makeSuccess(id, { sessionId });
  }

  private async handleInvoke(id: JsonRpcId, params: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(params) || typeof params.sessionId !== 'string') {
      return makeError(id, RpcCode.InvalidParams, 'invoke requires params.sessionId (string).');
    }
    const sessionId = params.sessionId;
    const session = this.sessions.get(sessionId);
    if (!session) {
      return makeError(id, RpcCode.SessionNotFound, `Unknown session: ${sessionId}`, { sessionId });
    }
    if (typeof params.operationId !== 'string' || params.operationId.length === 0) {
      return makeError(id, RpcCode.InvalidParams, 'invoke requires params.operationId (string).', { sessionId });
    }
    const operationId = params.operationId;
    if (!VALID_OPERATION_IDS.has(operationId)) {
      return makeError(id, RpcCode.UnknownOperation, `Unknown operation: ${operationId}`, { operationId, sessionId });
    }

    // Forward input/options exactly as received (preserve missing vs {} vs null).
    const input = 'input' in params ? params.input : undefined;
    const options = 'options' in params ? params.options : undefined;

    try {
      const result = await session.invoke(operationId, input, options);
      return makeSuccess(id, { result });
    } catch (error) {
      const { domainCode, details } = extractDomainError(error);
      return makeError(id, RpcCode.OperationFailed, errorMessage(error), {
        ...(domainCode !== undefined ? { domainCode } : {}),
        ...(details !== undefined ? { details } : {}),
        operationId,
        sessionId,
      });
    }
  }

  private async handleExport(id: JsonRpcId, params: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(params) || typeof params.sessionId !== 'string') {
      return makeError(id, RpcCode.InvalidParams, 'export requires params.sessionId (string).');
    }
    const sessionId = params.sessionId;
    const session = this.sessions.get(sessionId);
    if (!session) {
      return makeError(id, RpcCode.SessionNotFound, `Unknown session: ${sessionId}`, { sessionId });
    }

    const bytes = await session.export();
    if (bytes.byteLength > MAX_DOCX_BYTES) {
      return makeError(id, RpcCode.PayloadTooLarge, `export: docx exceeds ${MAX_DOCX_BYTES} bytes.`, {
        sessionId,
        details: { maxBytes: MAX_DOCX_BYTES, byteLength: bytes.byteLength },
      });
    }
    const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return makeSuccess(id, {
      docxBase64: buf.toString('base64'),
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(buf).digest('hex'),
    });
  }

  private handleClose(id: JsonRpcId, params: unknown): JsonRpcResponse {
    if (!isRecord(params) || typeof params.sessionId !== 'string') {
      return makeError(id, RpcCode.InvalidParams, 'close requires params.sessionId (string).');
    }
    const sessionId = params.sessionId;
    const session = this.sessions.get(sessionId);
    if (!session) {
      return makeSuccess(id, { ok: true, alreadyClosed: true });
    }
    // Always drop the session from the map, even if close() throws, so a failed teardown cannot
    // leak a stale session in a long-lived host (the throw still surfaces via handle()'s catch).
    try {
      session.close();
      return makeSuccess(id, { ok: true });
    } finally {
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Handshake: report the protocol version, the method names, and the docx size
   * cap. No session is required and params are ignored, so a client can call it
   * before any `document.open` to verify compatibility and discover limits.
   */
  private handleCapabilities(id: JsonRpcId): JsonRpcResponse {
    return makeSuccess(id, {
      protocolVersion: PROTOCOL_VERSION,
      methods: [Method.Open, Method.Invoke, Method.Export, Method.Close, Method.Capabilities],
      maxDocxBytes: MAX_DOCX_BYTES,
    });
  }
}
