import { describe, expect, test } from 'bun:test';
import {
  JsonRpcCode,
  hasRequestId,
  makeError,
  makeSuccess,
  parseJsonRpcLine,
  serializeFrame,
  type JsonRpcRequest,
} from '../../host/protocol';

describe('parseJsonRpcLine', () => {
  test('parses a valid request', () => {
    const line = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test', params: { a: 1 } });
    const result = parseJsonRpcLine(line);
    expect(result.error).toBeUndefined();
    expect(result.request).toEqual({ jsonrpc: '2.0', id: 1, method: 'test', params: { a: 1 } });
  });

  test('parses a notification (no id)', () => {
    const line = JSON.stringify({ jsonrpc: '2.0', method: 'notify' });
    const result = parseJsonRpcLine(line);
    expect(result.error).toBeUndefined();
    expect(result.request?.method).toBe('notify');
    expect(result.request?.id).toBeUndefined();
  });

  test('returns error for empty line', () => {
    const result = parseJsonRpcLine('');
    expect(result.request).toBeUndefined();
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
  });

  test('returns error for whitespace-only line', () => {
    const result = parseJsonRpcLine('   ');
    expect(result.request).toBeUndefined();
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
  });

  test('returns parse error for invalid JSON', () => {
    const result = parseJsonRpcLine('{broken');
    expect(result.request).toBeUndefined();
    expect(result.error?.code).toBe(JsonRpcCode.ParseError);
  });

  test('returns error for non-object JSON (array)', () => {
    const result = parseJsonRpcLine('[1,2,3]');
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
  });

  test('returns error for non-object JSON (string)', () => {
    const result = parseJsonRpcLine('"hello"');
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
  });

  test('returns error for wrong jsonrpc version', () => {
    const result = parseJsonRpcLine(JSON.stringify({ jsonrpc: '1.0', method: 'test' }));
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
    expect(result.error?.message).toContain('2.0');
  });

  test('returns error for missing method', () => {
    const result = parseJsonRpcLine(JSON.stringify({ jsonrpc: '2.0', id: 1 }));
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
  });

  test('returns error for empty method string', () => {
    const result = parseJsonRpcLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: '' }));
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
  });

  test('returns error for non-string method', () => {
    const result = parseJsonRpcLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 42 }));
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
  });

  test('returns error for invalid id type (boolean)', () => {
    const result = parseJsonRpcLine(JSON.stringify({ jsonrpc: '2.0', id: true, method: 'test' }));
    expect(result.error?.code).toBe(JsonRpcCode.InvalidRequest);
    expect(result.error?.message).toContain('id type');
  });

  test('accepts null id', () => {
    const result = parseJsonRpcLine(JSON.stringify({ jsonrpc: '2.0', id: null, method: 'test' }));
    expect(result.error).toBeUndefined();
    expect(result.request?.id).toBeNull();
  });

  test('accepts string id', () => {
    const result = parseJsonRpcLine(JSON.stringify({ jsonrpc: '2.0', id: 'abc', method: 'test' }));
    expect(result.error).toBeUndefined();
    expect(result.request?.id).toBe('abc');
  });
});

describe('makeSuccess', () => {
  test('creates a well-formed success response', () => {
    const result = makeSuccess(1, { ok: true });
    expect(result).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });

  test('handles null id', () => {
    const result = makeSuccess(null, 'data');
    expect(result.id).toBeNull();
  });
});

describe('makeError', () => {
  test('creates error response without data', () => {
    const result = makeError(1, -32600, 'bad request');
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32600, message: 'bad request' },
    });
  });

  test('creates error response with data', () => {
    const result = makeError(2, -32010, 'failed', { reason: 'timeout' });
    expect(result.error.data).toEqual({ reason: 'timeout' });
  });

  test('omits data field when undefined', () => {
    const result = makeError(3, -32600, 'bad');
    expect('data' in result.error).toBe(false);
  });
});

describe('serializeFrame', () => {
  test('produces newline-terminated JSON', () => {
    const frame = makeSuccess(1, 'ok');
    const serialized = serializeFrame(frame);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized)).toEqual(frame);
  });

  test('serializes error frames', () => {
    const frame = makeError(null, -32700, 'parse error');
    const serialized = serializeFrame(frame);
    expect(serialized.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(serialized);
    expect(parsed.error.code).toBe(-32700);
  });
});

describe('hasRequestId', () => {
  test('returns true when id is present', () => {
    const request: JsonRpcRequest = { jsonrpc: '2.0', id: 1, method: 'test' };
    expect(hasRequestId(request)).toBe(true);
  });

  test('returns true when id is null', () => {
    const request: JsonRpcRequest = { jsonrpc: '2.0', id: null, method: 'test' };
    expect(hasRequestId(request)).toBe(true);
  });

  test('returns false when id is absent', () => {
    const request: JsonRpcRequest = { jsonrpc: '2.0', method: 'test' };
    expect(hasRequestId(request)).toBe(false);
  });
});
