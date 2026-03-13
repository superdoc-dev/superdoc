import { describe, expect, test, mock } from 'bun:test';
import {
  formatBold,
  formatItalic,
  formatUnderline,
  formatStrikethrough,
  unformatBold,
  unformatItalic,
  unformatUnderline,
  unformatStrikethrough,
  clearBold,
  clearItalic,
  clearUnderline,
  clearStrikethrough,
} from '../format.js';
import type { OperationSpec, InvokeOptions } from '../../runtime/transport-common.js';

type InvokeFn = (spec: OperationSpec, params?: Record<string, unknown>, options?: InvokeOptions) => Promise<unknown>;

function createMockInvoke(): {
  invoke: InvokeFn;
  calls: Array<{ spec: OperationSpec; params: Record<string, unknown> }>;
} {
  const calls: Array<{ spec: OperationSpec; params: Record<string, unknown> }> = [];
  const invoke: InvokeFn = async (spec, params = {}) => {
    calls.push({ spec, params });
    return { success: true };
  };
  return { invoke, calls };
}

describe('format helpers', () => {
  test("formatBold calls format.apply with inline.bold='on'", async () => {
    const { invoke, calls } = createMockInvoke();
    await formatBold(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.inline).toEqual({ bold: 'on' });
    expect(calls[0].params.target).toEqual({ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } });
    expect(calls[0].params.blockId).toBeUndefined();
    expect(calls[0].params.start).toBeUndefined();
    expect(calls[0].params.end).toBeUndefined();
  });

  test("formatItalic calls format.apply with inline.italic='on'", async () => {
    const { invoke, calls } = createMockInvoke();
    await formatItalic(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.inline).toEqual({ italic: 'on' });
  });

  test("formatUnderline calls format.apply with inline.underline='on'", async () => {
    const { invoke, calls } = createMockInvoke();
    await formatUnderline(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.inline).toEqual({ underline: 'on' });
  });

  test("formatStrikethrough calls format.apply with inline.strike='on'", async () => {
    const { invoke, calls } = createMockInvoke();
    await formatStrikethrough(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.inline).toEqual({ strike: 'on' });
  });

  test('helpers pass through target address', async () => {
    const { invoke, calls } = createMockInvoke();
    const target = { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 10 } };
    await formatBold(invoke, { target });

    expect(calls[0].params.target).toEqual(target);
  });

  test('helpers pass through dryRun and changeMode', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatBold(invoke, { blockId: 'p1', start: 0, end: 5, dryRun: true, changeMode: 'tracked' });

    expect(calls[0].params.dryRun).toBe(true);
    expect(calls[0].params.changeMode).toBe('tracked');
  });

  test('helpers pass through sessionId and doc', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatItalic(invoke, { sessionId: 's_123', doc: '/path/to/doc.docx', blockId: 'p1', start: 0, end: 5 });

    expect(calls[0].params.sessionId).toBe('s_123');
    expect(calls[0].params.doc).toBe('/path/to/doc.docx');
  });

  test('helpers default to empty params', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatBold(invoke);

    expect(calls).toHaveLength(1);
    expect(calls[0].params.inline).toEqual({ bold: 'on' });
  });

  test('all helpers use the same operation spec', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatBold(invoke);
    await formatItalic(invoke);
    await formatUnderline(invoke);
    await formatStrikethrough(invoke);

    const specs = calls.map((c) => c.spec);
    expect(specs[0]).toBe(specs[1]);
    expect(specs[1]).toBe(specs[2]);
    expect(specs[2]).toBe(specs[3]);
  });

  test('helpers use format/apply command tokens', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatBold(invoke);

    expect(calls[0].spec.commandTokens).toEqual(['format', 'apply']);
  });

  test('unformat helpers apply OFF directives', async () => {
    const { invoke, calls } = createMockInvoke();
    await unformatBold(invoke, { blockId: 'p1', start: 0, end: 5 });
    await unformatItalic(invoke, { blockId: 'p1', start: 0, end: 5 });
    await unformatUnderline(invoke, { blockId: 'p1', start: 0, end: 5 });
    await unformatStrikethrough(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls[0].params.inline).toEqual({ bold: 'off' });
    expect(calls[1].params.inline).toEqual({ italic: 'off' });
    expect(calls[2].params.inline).toEqual({ underline: 'off' });
    expect(calls[3].params.inline).toEqual({ strike: 'off' });
  });

  test('clear helpers apply CLEAR directives', async () => {
    const { invoke, calls } = createMockInvoke();
    await clearBold(invoke, { blockId: 'p1', start: 0, end: 5 });
    await clearItalic(invoke, { blockId: 'p1', start: 0, end: 5 });
    await clearUnderline(invoke, { blockId: 'p1', start: 0, end: 5 });
    await clearStrikethrough(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls[0].params.inline).toEqual({ bold: 'clear' });
    expect(calls[1].params.inline).toEqual({ italic: 'clear' });
    expect(calls[2].params.inline).toEqual({ underline: 'clear' });
    expect(calls[3].params.inline).toEqual({ strike: 'clear' });
  });
});
