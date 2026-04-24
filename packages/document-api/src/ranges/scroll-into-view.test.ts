import { describe, expect, it, mock } from 'bun:test';
import { executeScrollIntoView } from './scroll-into-view.js';
import type { RangeScrollAdapter, ScrollIntoViewInput, ScrollIntoViewOutput } from './ranges.types.js';

function makeAdapter(output: ScrollIntoViewOutput = { success: true }): RangeScrollAdapter & {
  scrollIntoView: ReturnType<typeof mock>;
} {
  const scrollIntoView = mock(async () => output);
  return { scrollIntoView } as unknown as RangeScrollAdapter & { scrollIntoView: ReturnType<typeof mock> };
}

async function expectValidationError(fn: () => Promise<unknown>, code: string, messageMatch: string): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}, nothing thrown`);
  } catch (err: unknown) {
    const e = err as { name?: string; code?: string; message?: string };
    expect(e.name).toBe('DocumentApiValidationError');
    expect(e.code).toBe(code);
    expect(e.message ?? '').toContain(messageMatch);
  }
}

describe('executeScrollIntoView — validation', () => {
  it('rejects a null / undefined input', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () => executeScrollIntoView(adapter, null as unknown as ScrollIntoViewInput),
      'INVALID_INPUT',
      'non-null object',
    );
    await expectValidationError(
      () => executeScrollIntoView(adapter, undefined as unknown as ScrollIntoViewInput),
      'INVALID_INPUT',
      'non-null object',
    );
  });

  it('rejects inputs with unknown fields', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () =>
        executeScrollIntoView(adapter, {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          somethingElse: true,
        } as unknown as ScrollIntoViewInput),
      'INVALID_INPUT',
      'Unknown field',
    );
  });

  it('rejects when target is missing', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () => executeScrollIntoView(adapter, {} as unknown as ScrollIntoViewInput),
      'INVALID_TARGET',
      'requires a target',
    );
  });

  it('rejects when target is malformed', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () => executeScrollIntoView(adapter, { target: { kind: 'nope' } } as unknown as ScrollIntoViewInput),
      'INVALID_TARGET',
      'TextAddress, TextTarget, or EntityAddress',
    );
  });

  it('rejects entity targets with unknown entityType', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () =>
        executeScrollIntoView(adapter, {
          target: { kind: 'entity', entityType: 'mystery', entityId: 'x_1' },
        } as unknown as ScrollIntoViewInput),
      'INVALID_TARGET',
      'TextAddress, TextTarget, or EntityAddress',
    );
  });

  it('rejects entity targets with empty entityId', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () =>
        executeScrollIntoView(adapter, {
          target: { kind: 'entity', entityType: 'comment', entityId: '' },
        } as unknown as ScrollIntoViewInput),
      'INVALID_TARGET',
      'TextAddress, TextTarget, or EntityAddress',
    );
  });

  it('rejects block outside the allowed enum', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () =>
        executeScrollIntoView(adapter, {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          block: 'top' as 'start',
        }),
      'INVALID_INPUT',
      'block must be',
    );
  });

  it('rejects behavior outside the allowed enum', async () => {
    const adapter = makeAdapter();
    await expectValidationError(
      () =>
        executeScrollIntoView(adapter, {
          target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
          behavior: 'instant' as 'auto',
        }),
      'INVALID_INPUT',
      'behavior must be',
    );
  });
});

describe('executeScrollIntoView — delegation', () => {
  it('accepts a TextAddress target and forwards it unchanged', async () => {
    const adapter = makeAdapter();
    const input: ScrollIntoViewInput = {
      target: { kind: 'text', blockId: 'p1', range: { start: 3, end: 9 } },
    };
    const out = await executeScrollIntoView(adapter, input);
    expect(out).toEqual({ success: true });
    expect(adapter.scrollIntoView).toHaveBeenCalledWith(input);
  });

  it('accepts a multi-segment TextTarget target', async () => {
    const adapter = makeAdapter();
    const input: ScrollIntoViewInput = {
      target: {
        kind: 'text',
        segments: [
          { blockId: 'p1', range: { start: 0, end: 5 } },
          { blockId: 'p2', range: { start: 0, end: 3 } },
        ],
      },
      block: 'start',
      behavior: 'auto',
    };
    const out = await executeScrollIntoView(adapter, input);
    expect(out).toEqual({ success: true });
    expect(adapter.scrollIntoView).toHaveBeenCalledWith(input);
  });

  it('accepts an EntityAddress (comment) target', async () => {
    const adapter = makeAdapter();
    const input: ScrollIntoViewInput = {
      target: { kind: 'entity', entityType: 'comment', entityId: 'c_1' },
    };
    await executeScrollIntoView(adapter, input);
    expect(adapter.scrollIntoView).toHaveBeenCalledWith(input);
  });

  it('accepts an EntityAddress (trackedChange) target', async () => {
    const adapter = makeAdapter();
    const input: ScrollIntoViewInput = {
      target: { kind: 'entity', entityType: 'trackedChange', entityId: 'tc_1' },
    };
    await executeScrollIntoView(adapter, input);
    expect(adapter.scrollIntoView).toHaveBeenCalledWith(input);
  });

  it('returns whatever the adapter returns (e.g. success: false)', async () => {
    const adapter = makeAdapter({ success: false });
    const out = await executeScrollIntoView(adapter, {
      target: { kind: 'text', blockId: 'p1', range: { start: 0, end: 5 } },
    });
    expect(out).toEqual({ success: false });
  });
});
