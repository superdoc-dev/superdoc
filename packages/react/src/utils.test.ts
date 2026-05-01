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

  it('adopts a new reference on circular input (JSON.stringify throws)', () => {
    const circularA: { self?: unknown; name: string } = { name: 'a' };
    circularA.self = circularA;

    const { result, rerender } = renderHook(({ value }) => useMemoByValue(value), {
      initialProps: { value: circularA },
    });

    const circularB: { self?: unknown; name: string } = { name: 'a' };
    circularB.self = circularB;
    rerender({ value: circularB });
    // The compare throws; the hook falls back to adopting the new reference.
    expect(result.current).toBe(circularB);
  });
});
