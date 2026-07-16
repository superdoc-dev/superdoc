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
      /accept, reject/,
    );
  });

  it('rejects missing target', () => {
    expect(() => executeTrackChangesDecide(stubAdapter(), { decision: 'accept' } as any)).toThrow(/target must be/);
  });

  it('rejects ambiguous legacy targets that provide both id and scope', () => {
    let caught: unknown;
    try {
      executeTrackChangesDecide(stubAdapter(), {
        decision: 'accept',
        target: { id: 'tc1', scope: 'all' },
      } as any);
    } catch (error) {
      caught = error;
    }
    expect((caught as { code?: string } | undefined)?.code).toBe('INVALID_TARGET');
    expect((caught as Error | undefined)?.message).toContain('exactly one selector');
  });

  it('rejects id-target side aliases "insert"/"delete" (canonical inserted/deleted only)', () => {
    // The published id-target side schema is strictly ['inserted','deleted'];
    // the runtime must not accept the looser aliases the schema forbids.
    for (const side of ['insert', 'delete']) {
      expect(() =>
        executeTrackChangesDecide(stubAdapter(), {
          decision: 'reject',
          target: { kind: 'id', id: 'tc1', side } as any,
        }),
      ).toThrow(/must be "inserted" or "deleted"/);
    }
  });

  it('forwards canonical id-target side "deleted" to the adapter', () => {
    const adapter = { ...stubAdapter(), decide: mock(() => ({ success: true })) };
    const result = executeTrackChangesDecide(adapter, {
      decision: 'reject',
      target: { kind: 'id', id: 'tc1', side: 'deleted' },
    });
    expect(result.success).toBe(true);
    expect((adapter.decide as any).mock.calls[0][0].target.side).toBe('deleted');
  });

  it('still accepts range-target side aliases (range validation is unchanged)', () => {
    const adapter = { ...stubAdapter(), decideRange: mock(() => ({ success: true })) };
    const result = executeTrackChangesDecide(adapter, {
      decision: 'reject',
      target: {
        kind: 'range',
        range: { kind: 'text', segments: [{ blockId: 'p1', range: { start: 0, end: 2 } }] },
        side: 'delete',
      } as any,
    });
    expect(result.success).toBe(true);
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

  it('promotes legacy partial id ranges into logical range targets without resolving the whole change', () => {
    const adapter = {
      ...stubAdapter(),
      decide: mock(() => ({ success: true })),
    };
    const result = executeTrackChangesDecide(adapter, {
      decision: 'accept',
      target: { id: 'tc1', range: { kind: 'partial', start: 0, end: 2 } } as any,
    });

    expect(result.success).toBe(true);
    expect(adapter.decide).toHaveBeenCalledWith(
      {
        decision: 'accept',
        target: {
          kind: 'range',
          range: { anchor: 'tc1', relativeStart: 0, relativeEnd: 2 },
        },
      },
      undefined,
    );
    expect(adapter.accept).not.toHaveBeenCalled();
  });

  it('forwards story and part on logical range decide targets', () => {
    const adapter = {
      ...stubAdapter(),
      decide: mock(() => ({ success: true })),
    };
    const footnoteStory = { kind: 'story', storyType: 'footnote', noteId: '5' } as const;

    const result = executeTrackChangesDecide(adapter, {
      decision: 'reject',
      target: {
        kind: 'range',
        range: { anchor: 'tc1', relativeStart: 1, relativeEnd: 4 },
        story: footnoteStory,
        part: 'word/footnotes.xml',
      },
    });

    expect(result.success).toBe(true);
    expect(adapter.decide).toHaveBeenCalledWith(
      {
        decision: 'reject',
        target: {
          kind: 'range',
          range: { anchor: 'tc1', relativeStart: 1, relativeEnd: 4 },
          story: footnoteStory,
          part: 'word/footnotes.xml',
        },
      },
      undefined,
    );
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
});
