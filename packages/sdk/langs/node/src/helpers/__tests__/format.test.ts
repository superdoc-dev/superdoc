import { describe, expect, test, mock } from 'bun:test';
import { formatBold, formatItalic, formatUnderline, formatStrikethrough } from '../format.js';
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
  test('formatBold calls format.apply with marks.bold=true', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatBold(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.marks).toEqual({ bold: true });
    expect(calls[0].params.blockId).toBe('p1');
    expect(calls[0].params.start).toBe(0);
    expect(calls[0].params.end).toBe(5);
  });

  test('formatItalic calls format.apply with marks.italic=true', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatItalic(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.marks).toEqual({ italic: true });
  });

  test('formatUnderline calls format.apply with marks.underline=true', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatUnderline(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.marks).toEqual({ underline: true });
  });

  test('formatStrikethrough calls format.apply with marks.strike=true', async () => {
    const { invoke, calls } = createMockInvoke();
    await formatStrikethrough(invoke, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].spec.operationId).toBe('doc.format.apply');
    expect(calls[0].params.marks).toEqual({ strike: true });
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
    expect(calls[0].params.marks).toEqual({ bold: true });
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
});
