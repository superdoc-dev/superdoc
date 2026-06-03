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

  test('formatRange delegates to doc.format.apply with inline properties', async () => {
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
        operationId: 'doc.format.apply',
        params: {
          target,
          inline: { bold: true, italic: false },
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
  test('dispatches against root-bound document methods', async () => {
    const calls: unknown[] = [];
    const args = { select: { type: 'text', pattern: 'termination' } };
    const documentHandle = {
      query: {
        match: async (args: unknown) => {
          calls.push(args);
          return { ok: true };
        },
      },
    } as unknown as BoundDocApi;

    const result = await dispatchSuperDocTool(documentHandle, 'superdoc_search', args);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([args]);
  });

  test('rejects legacy doc/session targeting args', async () => {
    const documentHandle = {
      query: {
        match: async () => ({ ok: true }),
      },
    } as unknown as BoundDocApi;

    try {
      await dispatchSuperDocTool(documentHandle, 'superdoc_search', { doc: './contract.docx' });
      throw new Error('Expected dispatchSuperDocTool to reject legacy doc/session args.');
    } catch (error) {
      expect(error).toBeInstanceOf(SuperDocCliError);
      expect((error as SuperDocCliError).code).toBe('INVALID_ARGUMENT');
    }
  });

  test('strips obviously corrupted nested keys before dispatch', async () => {
    const calls: unknown[] = [];
    const documentHandle = {
      mutations: {
        apply: async (args: unknown) => {
          calls.push(args);
          return { ok: true };
        },
      },
    } as unknown as BoundDocApi;

    const args = {
      action: 'apply',
      atomic: true,
      changeMode: 'tracked',
      steps: [
        {
          id: 'r1',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: 'paragraph', nodeId: '6F228706' },
          args: { replacement: { text: 'Replacement clause' } },
          '},{': ':',
        },
      ],
    };

    const result = await dispatchSuperDocTool(documentHandle, 'superdoc_mutations', args);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        atomic: true,
        changeMode: 'tracked',
        steps: [
          {
            id: 'r1',
            op: 'text.rewrite',
            where: { by: 'block', nodeType: 'paragraph', nodeId: '6F228706' },
            args: { replacement: { text: 'Replacement clause' } },
          },
        ],
      },
    ]);
  });
});
