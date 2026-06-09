import { describe, expect, it, mock } from 'bun:test';
import { executeTrackChangesGet, executeTrackChangesDecide } from './track-changes.js';

const stubAdapter = () =>
  ({
    list: mock(() => ({ items: [], total: 0 })),
    get: mock(() => ({ id: 'tc1' })),
    accept: mock(() => ({ success: true })),
    reject: mock(() => ({ success: true })),
    acceptAll: mock(() => ({ success: true })),
    rejectAll: mock(() => ({ success: true })),
  }) as any;

describe('executeTrackChangesGet validation', () => {
  it('rejects null input', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects undefined input', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), undefined as any)).toThrow(/non-null object/);
  });

  it('rejects non-string id', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), { id: 42 } as any)).toThrow(/non-empty string/);
  });

  it('rejects empty string id', () => {
    expect(() => executeTrackChangesGet(stubAdapter(), { id: '' })).toThrow(/non-empty string/);
  });

  it('accepts valid input', () => {
    const adapter = stubAdapter();
    executeTrackChangesGet(adapter, { id: 'tc-1' });
    expect(adapter.get).toHaveBeenCalledWith({ id: 'tc-1' });
  });
});

describe('executeTrackChangesDecide validation', () => {
  it('rejects null input', () => {
    expect(() => executeTrackChangesDecide(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects invalid decision', () => {
    expect(() => executeTrackChangesDecide(stubAdapter(), { decision: 'maybe', target: { id: 'tc1' } } as any)).toThrow(
      /must be "accept" or "reject"/,
    );
  });

  it('rejects missing target', () => {
    expect(() => executeTrackChangesDecide(stubAdapter(), { decision: 'accept' } as any)).toThrow(/target must be/);
  });

  it('routes canonical range targets to decideRange', () => {
    const adapter = {
      ...stubAdapter(),
      decideRange: mock(() => ({ success: true })),
    };

    const result = executeTrackChangesDecide(adapter, {
      decision: 'accept',
      target: {
        kind: 'range',
        range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 2 } }] },
      },
    });

    expect(result.success).toBe(true);
    expect(adapter.decideRange).toHaveBeenCalledWith(
      {
        decision: 'accept',
        range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 2 } }] },
      },
      undefined,
    );
  });

  it('fails closed when canonical range targets are not supported by the adapter', () => {
    const result = executeTrackChangesDecide(stubAdapter(), {
      decision: 'reject',
      target: {
        kind: 'range',
        range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 2 } }] },
      },
    });

    expect(result).toMatchObject({
      success: false,
      failure: { code: 'CAPABILITY_UNAVAILABLE' },
    });
  });

  it('routes scope: "all" targets with an explicit story filter to acceptAll/rejectAll', () => {
    const adapter = stubAdapter();
    const footnoteStory = { kind: 'story', storyType: 'footnote', noteId: '5' } as const;

    const accept = executeTrackChangesDecide(adapter, {
      decision: 'accept',
      target: { scope: 'all', story: footnoteStory },
    });
    const reject = executeTrackChangesDecide(adapter, {
      decision: 'reject',
      target: { scope: 'all', story: footnoteStory },
    });

    expect(accept.success).toBe(true);
    expect(reject.success).toBe(true);
    expect(adapter.acceptAll).toHaveBeenCalledWith({ story: footnoteStory }, undefined);
    expect(adapter.rejectAll).toHaveBeenCalledWith({ story: footnoteStory }, undefined);
  });

  it('rejects ambiguous targets that mix id and scope', () => {
    expect(() =>
      executeTrackChangesDecide(stubAdapter(), {
        decision: 'accept',
        target: { id: 'tc1', scope: 'all' },
      } as any),
    ).toThrow(/exactly one/);
  });

  it('fails closed with INVALID_INPUT for a partial-range qualifier on an id target', () => {
    const adapter = stubAdapter();
    const result = executeTrackChangesDecide(adapter, {
      decision: 'accept',
      target: { id: 'tc1', range: { kind: 'partial', start: 0, end: 2 } } as any,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.code).toBe('INVALID_INPUT');
    }
    // The whole change must not be resolved as a side effect.
    expect(adapter.accept).not.toHaveBeenCalled();
  });
});
