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
import type { InvokeOptions } from '../../runtime/transport-common.js';

/**
 * Simulates a bound `doc.format.apply` method — receives `(params, options)`.
 */
type BoundApplyFn = (params?: Record<string, unknown>, options?: InvokeOptions) => Promise<unknown>;

function createMockApply(): {
  apply: BoundApplyFn;
  calls: Array<{ params: Record<string, unknown>; options?: InvokeOptions }>;
} {
  const calls: Array<{ params: Record<string, unknown>; options?: InvokeOptions }> = [];
  const apply: BoundApplyFn = async (params = {}, options?) => {
    calls.push({ params, options });
    return { success: true };
  };
  return { apply, calls };
}

describe('format helpers', () => {
  test("formatBold calls apply with inline.bold='on'", async () => {
    const { apply, calls } = createMockApply();
    await formatBold(apply, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].params.inline).toEqual({ bold: 'on' });
    expect(calls[0].params.target).toEqual({ kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } });
    expect(calls[0].params.blockId).toBeUndefined();
    expect(calls[0].params.start).toBeUndefined();
    expect(calls[0].params.end).toBeUndefined();
  });

  test("formatItalic calls apply with inline.italic='on'", async () => {
    const { apply, calls } = createMockApply();
    await formatItalic(apply, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].params.inline).toEqual({ italic: 'on' });
  });

  test("formatUnderline calls apply with inline.underline='on'", async () => {
    const { apply, calls } = createMockApply();
    await formatUnderline(apply, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].params.inline).toEqual({ underline: 'on' });
  });

  test("formatStrikethrough calls apply with inline.strike='on'", async () => {
    const { apply, calls } = createMockApply();
    await formatStrikethrough(apply, { blockId: 'p1', start: 0, end: 5 });

    expect(calls).toHaveLength(1);
    expect(calls[0].params.inline).toEqual({ strike: 'on' });
  });

  test('helpers pass through target address', async () => {
    const { apply, calls } = createMockApply();
    const target = { kind: 'text' as const, blockId: 'p1', range: { start: 0, end: 10 } };
    await formatBold(apply, { target });

    expect(calls[0].params.target).toEqual(target);
  });

  test('helpers pass through dryRun and changeMode', async () => {
    const { apply, calls } = createMockApply();
    await formatBold(apply, { blockId: 'p1', start: 0, end: 5, dryRun: true, changeMode: 'tracked' });

    expect(calls[0].params.dryRun).toBe(true);
    expect(calls[0].params.changeMode).toBe('tracked');
  });

  test('helpers default to empty params', async () => {
    const { apply, calls } = createMockApply();
    await formatBold(apply);

    expect(calls).toHaveLength(1);
    expect(calls[0].params.inline).toEqual({ bold: 'on' });
  });

  test('helpers forward InvokeOptions to the bound method', async () => {
    const { apply, calls } = createMockApply();
    const opts: InvokeOptions = { timeout: 5000 };
    await formatBold(apply, { blockId: 'p1', start: 0, end: 5 }, opts);

    expect(calls[0].options).toBe(opts);
  });

  test('unformat helpers apply OFF directives', async () => {
    const { apply, calls } = createMockApply();
    await unformatBold(apply, { blockId: 'p1', start: 0, end: 5 });
    await unformatItalic(apply, { blockId: 'p1', start: 0, end: 5 });
    await unformatUnderline(apply, { blockId: 'p1', start: 0, end: 5 });
    await unformatStrikethrough(apply, { blockId: 'p1', start: 0, end: 5 });

    expect(calls[0].params.inline).toEqual({ bold: 'off' });
    expect(calls[1].params.inline).toEqual({ italic: 'off' });
    expect(calls[2].params.inline).toEqual({ underline: 'off' });
    expect(calls[3].params.inline).toEqual({ strike: 'off' });
  });

  test('clear helpers apply CLEAR directives', async () => {
    const { apply, calls } = createMockApply();
    await clearBold(apply, { blockId: 'p1', start: 0, end: 5 });
    await clearItalic(apply, { blockId: 'p1', start: 0, end: 5 });
    await clearUnderline(apply, { blockId: 'p1', start: 0, end: 5 });
    await clearStrikethrough(apply, { blockId: 'p1', start: 0, end: 5 });

    expect(calls[0].params.inline).toEqual({ bold: 'clear' });
    expect(calls[1].params.inline).toEqual({ italic: 'clear' });
    expect(calls[2].params.inline).toEqual({ underline: 'clear' });
    expect(calls[3].params.inline).toEqual({ strike: 'clear' });
  });

  test('bound method receives params directly (no OperationSpec as first arg)', async () => {
    // Regression: helpers must call apply(params, options), NOT apply(spec, params, options).
    // If FORMAT_APPLY_SPEC leaks into the params slot, the bound method receives the wrong data.
    const { apply, calls } = createMockApply();
    await formatBold(apply, { blockId: 'p1', start: 0, end: 5 });

    const params = calls[0].params;
    // Params must contain inline + target, NOT an operationId or commandTokens field
    expect(params).toHaveProperty('inline');
    expect(params).toHaveProperty('target');
    expect(params).not.toHaveProperty('operationId');
    expect(params).not.toHaveProperty('commandTokens');
  });
});
