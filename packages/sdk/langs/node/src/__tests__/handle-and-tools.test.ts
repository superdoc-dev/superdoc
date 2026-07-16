import { describe, expect, test } from 'bun:test';
import type { BoundDocApi } from '../generated/client.js';
import { SuperDocClient, SuperDocDocument } from '../index.ts';
import { SuperDocCliError } from '../runtime/errors.js';
import { dispatchSuperDocTool } from '../tools.ts';

describe('SuperDocDocument', () => {
  test('exposes generated bound operations on the handle root', () => {
    const boundRuntime = {
      invoke: async () => ({}),
      markClosed: () => {},
    };
    const client = { removeHandle: () => {} };

    const doc = new SuperDocDocument(boundRuntime as any, 'session-1', { contextId: 'session-1' }, client as any);

    expect(typeof doc.getMarkdown).toBe('function');
    expect(typeof doc.query.match).toBe('function');
    expect(typeof doc.formatRange).toBe('function');
    expect('api' in (doc as unknown as Record<string, unknown>)).toBe(false);
  });

  test('formatRange delegates to the doc.formatRange operation, passing properties through', async () => {
    const calls: Array<{ operationId: string; params: unknown }> = [];
    const boundRuntime = {
      invoke: async (operation: { operationId: string }, params: unknown) => {
        calls.push({ operationId: operation.operationId, params });
        return { ok: true };
      },
      markClosed: () => {},
    };
    const client = { removeHandle: () => {} };

    const doc = new SuperDocDocument(boundRuntime as any, 'session-1', { contextId: 'session-1' }, client as any);
    const target = {
      kind: 'selection' as const,
      start: { kind: 'text' as const, blockId: 'p1', offset: 2 },
      end: { kind: 'text' as const, blockId: 'p1', offset: 5 },
    };

    const result = await doc.formatRange({
      target,
      properties: { bold: true, italic: false },
      changeMode: 'tracked',
      dryRun: true,
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        operationId: 'doc.formatRange',
        params: {
          target,
          properties: { bold: true, italic: false },
          changeMode: 'tracked',
          dryRun: true,
        },
      },
    ]);
  });
});

describe('SuperDocClient handle lifecycle', () => {
  test('invoke after close throws DOCUMENT_CLOSED with the attempted operation id', async () => {
    const client = new SuperDocClient({ env: { SUPERDOC_CLI_BIN: '/tmp/fake-cli' } });
    // Bypass the real CLI subprocess by stubbing the internal runtime and rawApi.
    (client as any).runtime = { invoke: async () => ({}) };
    (client as any).rawApi = { open: async () => ({ contextId: 'session-1' }) };

    const doc = await client.open({} as any);
    await doc.close();

    try {
      await doc.save();
      throw new Error('Expected doc.save() to throw on a closed handle.');
    } catch (error) {
      expect(error).toBeInstanceOf(SuperDocCliError);
      const cliError = error as SuperDocCliError;
      expect(cliError.code).toBe('DOCUMENT_CLOSED');
      expect(cliError.message).toContain('doc.save');
      expect(cliError.details).toEqual({ sessionId: 'session-1', operationId: 'doc.save' });
    }
  });
});

describe('dispatchSuperDocTool', () => {
  test('rejects an unknown tool name with TOOL_DISPATCH_NOT_FOUND', async () => {
    const documentHandle = {} as unknown as BoundDocApi;
    try {
      await dispatchSuperDocTool(documentHandle, 'superdoc_unknown_tool', {});
      throw new Error('Expected dispatchSuperDocTool to reject unknown tool.');
    } catch (error) {
      expect(error).toBeInstanceOf(SuperDocCliError);
      expect((error as SuperDocCliError).code).toBe('TOOL_DISPATCH_NOT_FOUND');
    }
  });

  test('rejects non-object args with INVALID_ARGUMENT', async () => {
    const documentHandle = {} as unknown as BoundDocApi;
    try {
      await dispatchSuperDocTool(
        documentHandle,
        'superdoc_inspect',
        'not-an-object' as unknown as Record<string, unknown>,
      );
      throw new Error('Expected dispatchSuperDocTool to reject non-object args.');
    } catch (error) {
      expect(error).toBeInstanceOf(SuperDocCliError);
      expect((error as SuperDocCliError).code).toBe('INVALID_ARGUMENT');
    }
  });
});
