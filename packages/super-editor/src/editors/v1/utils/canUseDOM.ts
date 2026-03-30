/**
 * Cached result of DOM availability check for performance optimization.
 * Memoization is safe because DOM availability doesn't change during runtime.
 */
let domAvailabilityCache: boolean | null = null;

/**
 * Determines whether DOM APIs are available in the current environment.
 *
 * This utility detects whether the code is running in a browser-like environment
 * with a functional DOM, or in a headless environment (e.g., Node.js, server-side rendering).
 *
 * Returns `true` when:
 * - Running in a browser with full DOM support
 * - Running in a DOM-polyfilled environment (e.g., JSDOM in Node.js)
 *
 * Returns `false` when:
 * - Running in Node.js without DOM polyfills
 * - Running in a Web Worker (no document object)
 * - globalThis.window or globalThis.document are undefined
 *
 * The result is memoized after the first call for performance.
 *
 * @returns True if DOM APIs are available, false otherwise
 *
 * @example
 * ```typescript
 * if (canUseDOM()) {
 *   // Safe to use document.createElement, window, etc.
 *   const div = document.createElement('div');
 * } else {
 *   // Running in headless mode - use alternative logic
 * }
 * ```
 */
export const canUseDOM = (): boolean => {
  if (domAvailabilityCache !== null) {
    return domAvailabilityCache;
  }

  try {
    const hasDOM =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.window !== 'undefined' &&
      typeof globalThis.document !== 'undefined' &&
      typeof globalThis.document.createElement === 'function';

    domAvailabilityCache = hasDOM;
    return hasDOM;
  } catch {
    // If any error occurs during detection, assume DOM is not available
    domAvailabilityCache = false;
    return false;
  }
};

/**
 * Resets the internal cache used by canUseDOM().
 *
 * This function is primarily intended for testing scenarios where DOM globals
 * are dynamically added or removed during test execution. In production code,
 * the DOM availability should never change during runtime, so this reset
 * should not be necessary.
 *
 * After calling this function, the next invocation of canUseDOM() will
 * re-check DOM availability instead of returning the cached result.
 *
 * @example
 * ```typescript
 * // In a test file
 * import { canUseDOM, resetDOMCache } from './canUseDOM';
 *
 * beforeEach(() => {
 *   resetDOMCache(); // Clear cache between tests
 *   delete globalThis.window;
 *   delete globalThis.document;
 * });
 *
 * it('detects missing DOM', () => {
 *   expect(canUseDOM()).toBe(false);
 * });
 * ```
 */
export const resetDOMCache = (): void => {
  domAvailabilityCache = null;
};
