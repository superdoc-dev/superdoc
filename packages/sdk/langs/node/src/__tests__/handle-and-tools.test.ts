import { describe, expect, test } from 'bun:test';
import type { BoundDocApi } from '../generated/client.js';
import { SuperDocDocument } from '../index.ts';
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
    expect('api' in (doc as unknown as Record<string, unknown>)).toBe(false);
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
});
