import { describe, expect, it, mock } from 'bun:test';
import {
  executeCommentsCreate,
  executeCommentsPatch,
  executeCommentsDelete,
  executeGetComment,
  executeListComments,
} from './comments.js';

const stubAdapter = () =>
  ({
    add: mock(() => ({ success: true })),
    edit: mock(() => ({ success: true })),
    reply: mock(() => ({ success: true })),
    move: mock(() => ({ success: true })),
    resolve: mock(() => ({ success: true })),
    remove: mock(() => ({ success: true })),
    setInternal: mock(() => ({ success: true })),
    setActive: mock(() => ({ success: true })),
    goTo: mock(() => ({ success: true })),
    get: mock(() => ({ commentId: 'c1', status: 'open' })),
    list: mock(() => ({ items: [], total: 0 })),
  }) as any;

describe('executeCommentsCreate validation', () => {
  it('rejects null input with INVALID_INPUT', () => {
    expect(() => executeCommentsCreate(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects non-string text with INVALID_INPUT', () => {
    const target = { kind: 'text', blockId: 'b1', range: { start: 0, end: 5 } };
    expect(() => executeCommentsCreate(stubAdapter(), { text: 123, target } as any)).toThrow(/text must be a string/);
  });

  it('uses INVALID_INPUT code (not INVALID_TARGET) for input shape errors', () => {
    try {
      executeCommentsCreate(stubAdapter(), null as any);
    } catch (e: any) {
      expect(e.code).toBe('INVALID_INPUT');
    }
  });
});

describe('executeCommentsPatch validation', () => {
  it('rejects null input', () => {
    expect(() => executeCommentsPatch(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects non-string text', () => {
    expect(() => executeCommentsPatch(stubAdapter(), { commentId: 'c1', text: 123 } as any)).toThrow(
      /text must be a string/,
    );
  });

  it('rejects non-boolean isInternal', () => {
    expect(() => executeCommentsPatch(stubAdapter(), { commentId: 'c1', isInternal: 'yes' } as any)).toThrow(
      /isInternal must be a boolean/,
    );
  });

  it('rejects invalid status', () => {
    expect(() => executeCommentsPatch(stubAdapter(), { commentId: 'c1', status: 'open' } as any)).toThrow(
      /must be "resolved"/,
    );
  });

  it('accepts valid text patch', () => {
    const adapter = stubAdapter();
    executeCommentsPatch(adapter, { commentId: 'c1', text: 'updated' });
    expect(adapter.edit).toHaveBeenCalled();
  });

  it('accepts valid isInternal patch', () => {
    const adapter = stubAdapter();
    executeCommentsPatch(adapter, { commentId: 'c1', isInternal: true });
    expect(adapter.setInternal).toHaveBeenCalled();
  });
});

describe('executeCommentsDelete validation', () => {
  it('rejects null input', () => {
    expect(() => executeCommentsDelete(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects non-string commentId', () => {
    expect(() => executeCommentsDelete(stubAdapter(), { commentId: 42 } as any)).toThrow(/non-empty string/);
  });

  it('rejects empty commentId', () => {
    expect(() => executeCommentsDelete(stubAdapter(), { commentId: '' })).toThrow(/non-empty string/);
  });

  it('accepts valid input', () => {
    const adapter = stubAdapter();
    executeCommentsDelete(adapter, { commentId: 'c1' });
    expect(adapter.remove).toHaveBeenCalledWith({ commentId: 'c1' }, undefined);
  });
});

describe('executeGetComment validation', () => {
  it('rejects null input', () => {
    expect(() => executeGetComment(stubAdapter(), null as any)).toThrow(/non-null object/);
  });

  it('rejects non-string commentId', () => {
    expect(() => executeGetComment(stubAdapter(), { commentId: 42 } as any)).toThrow(/non-empty string/);
  });

  it('accepts valid input', () => {
    const adapter = stubAdapter();
    executeGetComment(adapter, { commentId: 'c1' });
    expect(adapter.get).toHaveBeenCalled();
  });
});

describe('executeListComments validation', () => {
  it('accepts undefined query', () => {
    const adapter = stubAdapter();
    executeListComments(adapter);
    expect(adapter.list).toHaveBeenCalled();
  });

  it('rejects non-object query', () => {
    expect(() => executeListComments(stubAdapter(), 'bad' as any)).toThrow(/must be an object/);
  });

  it('accepts valid query', () => {
    const adapter = stubAdapter();
    executeListComments(adapter, { includeResolved: true });
    expect(adapter.list).toHaveBeenCalledWith({ includeResolved: true });
  });
});
