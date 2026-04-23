import { describe, it, expect } from 'vitest';
import { isRef, isReactive } from 'vue';
import { useFloatingComment } from './use-floating-comment.js';

describe('useFloatingComment', () => {
  it('assigns the commentId as id', () => {
    const f = useFloatingComment({ commentId: 'c-1', text: 'hi' });
    expect(f.id).toBe('c-1');
  });

  it('exposes the params as a ref on comment', () => {
    const params = { commentId: 'c-1', text: 'hi' };
    const f = useFloatingComment(params);
    expect(isRef(f.comment)).toBe(true);
    expect(f.comment.value).toStrictEqual(params);
  });

  it('initializes a reactive position at origin', () => {
    const f = useFloatingComment({ commentId: 'c-1' });
    expect(isReactive(f.position)).toBe(true);
    expect(f.position).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
  });

  it('initializes offset as a ref at 0', () => {
    const f = useFloatingComment({ commentId: 'c-1' });
    expect(isRef(f.offset)).toBe(true);
    expect(f.offset.value).toBe(0);
  });

  it('allows position to be mutated reactively', () => {
    const f = useFloatingComment({ commentId: 'c-1' });
    f.position.top = 42;
    f.position.left = 10;
    expect(f.position.top).toBe(42);
    expect(f.position.left).toBe(10);
  });
});
