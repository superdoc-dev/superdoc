import { describe, it, expect } from 'vitest';
import { shouldUseNativeCaretFallback } from './native-caret-fallback.js';

describe('shouldUseNativeCaretFallback', () => {
  it('returns false when selection is null', () => {
    expect(shouldUseNativeCaretFallback(null, 5)).toBe(false);
  });

  it('returns false when selection is undefined', () => {
    expect(shouldUseNativeCaretFallback(undefined, 5)).toBe(false);
  });

  it('returns false when selection is not collapsed', () => {
    // Even if the requested pos equals one of the selection endpoints, a range
    // selection means the user has multiple positions selected. The native
    // refinement should not fire.
    expect(shouldUseNativeCaretFallback({ empty: false, head: 5 }, 5)).toBe(false);
  });

  it('returns false when requested pos differs from selection head', () => {
    // SD-3170: arbitrary-position queries (remote cursors, vertical-nav
    // binary-search probes) must not get the native-selection rect.
    expect(shouldUseNativeCaretFallback({ empty: true, head: 5 }, 6)).toBe(false);
    expect(shouldUseNativeCaretFallback({ empty: true, head: 10 }, 4)).toBe(false);
  });

  it('returns true only for the local collapsed caret', () => {
    expect(shouldUseNativeCaretFallback({ empty: true, head: 5 }, 5)).toBe(true);
    expect(shouldUseNativeCaretFallback({ empty: true, head: 0 }, 0)).toBe(true);
  });

  it('treats head 0 distinctly from no selection', () => {
    // Boundary check: head: 0 with pos: 0 is a valid local caret.
    expect(shouldUseNativeCaretFallback({ empty: true, head: 0 }, 0)).toBe(true);
    // pos -1 (impossible PM position) is never the local caret.
    expect(shouldUseNativeCaretFallback({ empty: true, head: 0 }, -1)).toBe(false);
  });
});
