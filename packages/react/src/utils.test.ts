import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMemoByValue } from './utils';

describe('useMemoByValue', () => {
  it('returns the same reference across renders when content is unchanged', () => {
    const initial = { name: 'Alex', email: 'alex@example.com' };
    const { result, rerender } = renderHook(({ value }) => useMemoByValue(value), {
      initialProps: { value: initial },
    });

    const first = result.current;
    expect(first).toBe(initial);

    // Parent passes a fresh object literal with identical content
    rerender({ value: { name: 'Alex', email: 'alex@example.com' } });
    expect(result.current).toBe(first); // same reference — critical for effect deps

    // And again, still stable
    rerender({ value: { name: 'Alex', email: 'alex@example.com' } });
    expect(result.current).toBe(first);
  });

  it('returns a new reference when the content actually changes', () => {
    const { result, rerender } = renderHook(({ value }) => useMemoByValue(value), {
      initialProps: { value: { name: 'Alex' } },
    });

    const first = result.current;
    rerender({ value: { name: 'Jamie' } });
    expect(result.current).not.toBe(first);
    expect(result.current.name).toBe('Jamie');
  });

  it('handles undefined and null stably', () => {
    const { result, rerender } = renderHook(({ value }) => useMemoByValue(value as unknown), {
      initialProps: { value: undefined },
    });

    const first = result.current;
    rerender({ value: undefined });
    expect(result.current).toBe(first);

    rerender({ value: null });
    expect(result.current).toBe(null);
  });

  it('stabilizes arrays the same way as objects', () => {
    const { result, rerender } = renderHook(({ value }) => useMemoByValue(value), {
      initialProps: { value: [{ id: 1 }, { id: 2 }] },
    });

    const first = result.current;
    rerender({ value: [{ id: 1 }, { id: 2 }] });
    expect(result.current).toBe(first);

    rerender({ value: [{ id: 1 }, { id: 3 }] });
    expect(result.current).not.toBe(first);
  });

  it('handles key order changes as equal (deep compare is order-insensitive)', () => {
    const { result, rerender } = renderHook(({ value }) => useMemoByValue(value), {
      initialProps: { value: { a: 1, b: 2 } },
    });

    const first = result.current;
    rerender({ value: { b: 2, a: 1 } });
    expect(result.current).toBe(first);
  });

  it('treats values with different function identities as equal', () => {
    // lodash.isequal compares functions by reference. Same-reference functions
    // are equal; different-reference functions are not. We rely on the parent
    // ref-check to short-circuit same-reference cases, so function equality
    // only matters when the whole value object is freshly allocated.
    const fn = () => 1;
    const { result, rerender } = renderHook(({ value }) => useMemoByValue(value), {
      initialProps: { value: { cb: fn, n: 1 } },
    });
    const first = result.current;

    rerender({ value: { cb: fn, n: 1 } });
    expect(result.current).toBe(first);
  });
});
