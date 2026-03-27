/**
 * Test utilities for managing global DOM objects during headless tests.
 *
 * This module provides helpers for saving, deleting, and restoring DOM globals
 * (window, document, navigator) in Node.js test environments. This is essential
 * for testing code that conditionally uses DOM APIs based on their availability.
 */

import { resetDOMCache } from '../../utils/canUseDOM.js';

/**
 * Captures the current state of DOM-related global objects.
 *
 * This function stores references to window, document, and navigator globals,
 * including proper handling of property descriptors for navigator (which may
 * be defined with getters/setters).
 *
 * @returns {{window: Window | undefined, document: Document | undefined, navigatorDescriptor: PropertyDescriptor | undefined}} An object containing the original global values and descriptors
 * @returns {Window | undefined} return.window - Original globalThis.window value
 * @returns {Document | undefined} return.document - Original globalThis.document value
 * @returns {PropertyDescriptor | undefined} return.navigatorDescriptor - Property descriptor for navigator
 *
 * @example
 * ```js
 * const originalGlobals = captureOriginalGlobals();
 * // ... modify globals for testing ...
 * restoreOriginalGlobals(originalGlobals);
 * ```
 */
export const captureOriginalGlobals = () => {
  return {
    window: globalThis.window,
    document: globalThis.document,
    navigatorDescriptor: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  };
};

/**
 * Removes DOM-related globals from globalThis.
 *
 * This function deletes window, document, and navigator from the global scope,
 * simulating a pure Node.js environment without any DOM APIs. Useful for testing
 * headless mode behavior.
 *
 * @returns {void}
 *
 * @example
 * ```js
 * beforeEach(() => {
 *   removeDOMGlobals();
 *   expect(globalThis.window).toBeUndefined();
 * });
 * ```
 */
export const removeDOMGlobals = () => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.navigator;
  resetDOMCache();
};

/**
 * Restores DOM-related globals to their original state.
 *
 * This function uses the snapshot created by captureOriginalGlobals() to restore
 * window, document, and navigator to their pre-test state. Properly handles the
 * case where a global was originally undefined vs. having a specific value.
 *
 * For navigator, this function correctly restores property descriptors, which is
 * important because navigator may be defined with custom getters/setters.
 *
 * @param {{window: Window | undefined, document: Document | undefined, navigatorDescriptor: PropertyDescriptor | undefined}} originalGlobals - The snapshot object returned by captureOriginalGlobals()
 * @param {Window | undefined} originalGlobals.window - Original window value to restore
 * @param {Document | undefined} originalGlobals.document - Original document value to restore
 * @param {PropertyDescriptor | undefined} originalGlobals.navigatorDescriptor - Original navigator descriptor
 * @returns {void}
 *
 * @example
 * ```js
 * const originalGlobals = captureOriginalGlobals();
 *
 * beforeEach(() => {
 *   removeDOMGlobals();
 * });
 *
 * afterEach(() => {
 *   restoreOriginalGlobals(originalGlobals);
 * });
 * ```
 */
export const restoreOriginalGlobals = (originalGlobals) => {
  if (originalGlobals.window === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalGlobals.window;
  }

  if (originalGlobals.document === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = originalGlobals.document;
  }

  if (originalGlobals.navigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalGlobals.navigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
};

/**
 * Creates a pair of beforeEach/afterEach hooks that manage DOM globals lifecycle.
 *
 * This utility function returns an object with setup and teardown functions that
 * can be used directly in test suites. The setup function removes DOM globals,
 * and the teardown function restores them.
 *
 * @returns {{setup: () => void, teardown: () => void}} An object containing setup and teardown functions
 * @returns {() => void} return.setup - Function to call in beforeEach (removes DOM globals)
 * @returns {() => void} return.teardown - Function to call in afterEach (restores DOM globals)
 *
 * @example
 * ```js
 * import { createDOMGlobalsLifecycle } from './dom-globals-test-utils.js';
 *
 * describe('My headless tests', () => {
 *   const domLifecycle = createDOMGlobalsLifecycle();
 *
 *   beforeEach(() => {
 *     domLifecycle.setup();
 *   });
 *
 *   afterEach(() => {
 *     domLifecycle.teardown();
 *   });
 *
 *   it('works without DOM', () => {
 *     expect(globalThis.window).toBeUndefined();
 *   });
 * });
 * ```
 */
export const createDOMGlobalsLifecycle = () => {
  const originalGlobals = captureOriginalGlobals();

  return {
    setup: () => {
      removeDOMGlobals();
    },
    teardown: () => {
      restoreOriginalGlobals(originalGlobals);
    },
  };
};
