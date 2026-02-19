import { isRecord } from '../lib/guards';

/** Current host protocol version string. */
export const HOST_PROTOCOL_VERSION = '1.0';

/** JSON-RPC methods the host server supports. */
export const HOST_PROTOCOL_FEATURES = [
  'cli.invoke',
  'host.shutdown',
  'host.describe',
  'host.describe.command',
] as const;

/** Notification methods the host may emit to connected clients. */
export const HOST_PROTOCOL_NOTIFICATIONS = ['event.remoteChange', 'event.sessionClosed'] as const;

/** Maximum byte size for base64-decoded stdin payloads (32 MiB). */
export const DEFAULT_MAX_STDIN_BYTES = 32 * 1024 * 1024;

/** A JSON-RPC 2.0 request id — string, number, or null. */
export type JsonRpcId = string | number | null;

/** A JSON-RPC 2.0 request object. */
export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

/** A JSON-RPC 2.0 success response. */
export type JsonRpcSuccess = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

/** The `error` payload within a JSON-RPC 2.0 error response. */
export type JsonRpcErrorObject = {
  code: number;
  message: string;
  data?: unknown;
};

/** A JSON-RPC 2.0 error response. */
export type JsonRpcError = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: JsonRpcErrorObject;
};

/** A JSON-RPC 2.0 notification (no `id`). */
export type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

/** Standard and application-specific JSON-RPC error codes. */
export const JsonRpcCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  CliInvokeFailed: -32010,
  RequestTimeout: -32011,
  RequestTooLarge: -32012,
} as const;

/**
 * Parses a single newline-delimited JSON-RPC 2.0 frame.
 *
 * @param line - Raw line from the transport (may include whitespace)
 * @returns Either a parsed `request` or a structured `error` describing the parse failure
 */
export function parseJsonRpcLine(line: string): { request?: JsonRpcRequest; error?: JsonRpcErrorObject } {
  if (!line.trim()) {
    return {
      error: {
        code: JsonRpcCode.InvalidRequest,
        message: 'Invalid JSON-RPC request: empty frame.',
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return {
      error: {
        code: JsonRpcCode.ParseError,
        message: 'Parse error: invalid JSON.',
      },
    };
  }

  if (!isRecord(parsed)) {
    return {
      error: {
        code: JsonRpcCode.InvalidRequest,
        message: 'Invalid JSON-RPC request object.',
      },
    };
  }

  if (parsed.jsonrpc !== '2.0') {
    return {
      error: {
        code: JsonRpcCode.InvalidRequest,
        message: 'Invalid JSON-RPC version; expected "2.0".',
      },
    };
  }

  if (typeof parsed.method !== 'string' || parsed.method.length === 0) {
    return {
      error: {
        code: JsonRpcCode.InvalidRequest,
        message: 'Invalid JSON-RPC method.',
      },
    };
  }

  if ('id' in parsed) {
    const id = parsed.id;
    const validIdType = typeof id === 'string' || typeof id === 'number' || id === null;
    if (!validIdType) {
      return {
        error: {
          code: JsonRpcCode.InvalidRequest,
          message: 'Invalid JSON-RPC id type.',
        },
      };
    }
  }

  return {
    request: parsed as JsonRpcRequest,
  };
}

/**
 * Constructs a JSON-RPC 2.0 success response.
 *
 * @param id - The request id to echo back
 * @param result - The result payload
 * @returns A well-formed success response object
 */
export function makeSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * Constructs a JSON-RPC 2.0 error response.
 *
 * @param id - The request id to echo back (null for parse-level errors)
 * @param code - Numeric error code (see {@link JsonRpcCode})
 * @param message - Human-readable error description
 * @param data - Optional structured error payload
 * @returns A well-formed error response object
 */
export function makeError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcError {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

/**
 * Serializes a JSON-RPC response or notification to a newline-terminated JSON string.
 *
 * @param frame - The response or notification to serialize
 * @returns A single-line JSON string terminated by `\n`
 */
export function serializeFrame(frame: JsonRpcSuccess | JsonRpcError | JsonRpcNotification): string {
  return `${JSON.stringify(frame)}\n`;
}

/**
 * Type guard that checks whether a JSON-RPC request has an `id` field (i.e. is not a notification).
 *
 * @param request - The request to inspect
 * @returns `true` if the request carries an id and expects a response
 */
export function hasRequestId(request: JsonRpcRequest): request is JsonRpcRequest & { id: JsonRpcId } {
  return 'id' in request;
}
