/**
 * @vitest-environment node
 *
 * We use node environment instead of jsdom because:
 * 1. We're testing DOM detection logic by mocking globals
 * 2. jsdom conflicts with vi.stubGlobal during teardown
 * 3. Node environment gives us a clean slate to test all scenarios
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { canUseDOM, resetDOMCache } from './canUseDOM.js';

/**
 * Helper to safely override a global property for testing.
 * In jsdom, window and document are non-configurable, so we use vi.stubGlobal instead.
 */
const stubGlobals = {
  setWindow(value: unknown) {
    vi.stubGlobal('window', value);
  },

  setDocument(value: unknown) {
    vi.stubGlobal('document', value);
  },

  removeWindow() {
    // Use undefined to simulate missing window
    vi.stubGlobal('window', undefined);
  },

  removeDocument() {
    vi.stubGlobal('document', undefined);
  },

  restore() {
    vi.unstubAllGlobals();
  },
};

describe('canUseDOM', () => {
  beforeEach(() => {
    // Reset the cache before each test to ensure isolation
    resetDOMCache();
  });

  afterEach(() => {
    // Restore original globals after each test
    stubGlobals.restore();
  });

  afterAll(() => {
    // Final cleanup to ensure jsdom can tear down properly
    vi.unstubAllGlobals();
  });

  describe('DOM detection', () => {
    it('returns false when window is undefined', () => {
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      const result = canUseDOM();

      expect(result).toBe(false);
    });

    it('returns false when document is undefined', () => {
      // Create a mock window without document
      stubGlobals.setWindow({ setTimeout: () => 0 });
      stubGlobals.removeDocument();

      const result = canUseDOM();

      expect(result).toBe(false);
    });

    it('returns false when document.createElement is not a function', () => {
      // Create mock globals with document but no createElement
      stubGlobals.setWindow({});
      stubGlobals.setDocument({ querySelector: () => null });

      const result = canUseDOM();

      expect(result).toBe(false);
    });

    it('handles edge cases with globalThis check', () => {
      // globalThis should always be defined in modern environments
      // This test just verifies the function handles the check correctly
      const result = canUseDOM();
      expect(typeof result).toBe('boolean');
    });

    it('returns true when all DOM globals are present and functional', () => {
      // Create complete mock DOM environment
      stubGlobals.setWindow({
        setTimeout: () => 0,
        addEventListener: () => {},
      });
      stubGlobals.setDocument({
        createElement: () => ({ setAttribute: () => {} }),
        querySelector: () => null,
        addEventListener: () => {},
      });

      const result = canUseDOM();

      expect(result).toBe(true);
    });

    it('handles errors during detection gracefully', () => {
      // Create a scenario where accessing properties throws
      // We use a Proxy to throw on property access
      const throwingWindow = new Proxy(
        {},
        {
          get() {
            throw new Error('Access denied');
          },
        },
      );
      stubGlobals.setWindow(throwingWindow);

      const result = canUseDOM();

      expect(result).toBe(false);
    });
  });

  describe('caching behavior', () => {
    it('caches the result on first call', () => {
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      // First call - should detect and cache false
      const firstResult = canUseDOM();
      expect(firstResult).toBe(false);

      // Simulate DOM becoming available (this shouldn't affect cached result)
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: () => ({}),
      });

      // Second call - should return cached false despite DOM now being available
      const secondResult = canUseDOM();
      expect(secondResult).toBe(false);
    });

    it('caches positive results', () => {
      // Set up DOM environment
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: () => ({}),
      });

      // First call - should detect and cache true
      const firstResult = canUseDOM();
      expect(firstResult).toBe(true);

      // Remove DOM
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      // Second call - should return cached true despite DOM now being gone
      const secondResult = canUseDOM();
      expect(secondResult).toBe(true);
    });

    it('caches error results', () => {
      // Create a throwing scenario using a Proxy
      const throwingWindow = new Proxy(
        {},
        {
          get() {
            throw new Error('Access denied');
          },
        },
      );
      stubGlobals.setWindow(throwingWindow);

      // First call - should catch error and cache false
      const firstResult = canUseDOM();
      expect(firstResult).toBe(false);

      // Fix the property
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: () => ({}),
      });

      // Second call - should still return cached false
      const secondResult = canUseDOM();
      expect(secondResult).toBe(false);
    });
  });

  describe('resetDOMCache', () => {
    it('clears the cache allowing re-detection', () => {
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      // First call - cache false
      expect(canUseDOM()).toBe(false);

      // Add DOM
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: () => ({}),
      });

      // Should still be false (cached)
      expect(canUseDOM()).toBe(false);

      // Reset cache
      resetDOMCache();

      // Should now detect DOM and return true
      expect(canUseDOM()).toBe(true);
    });

    it('allows multiple resets', () => {
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      expect(canUseDOM()).toBe(false);

      resetDOMCache();
      resetDOMCache();
      resetDOMCache();

      // Should still work correctly
      expect(canUseDOM()).toBe(false);
    });

    it('can be called before first canUseDOM call', () => {
      // This should not throw
      expect(() => resetDOMCache()).not.toThrow();
    });
  });

  describe('real-world scenarios', () => {
    it('correctly identifies Node.js environment without DOM', () => {
      // In @vitest-environment node, window and document are undefined
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      expect(canUseDOM()).toBe(false);
    });

    it('correctly identifies JSDOM environment', () => {
      // Simulate JSDOM environment with createElement
      stubGlobals.setWindow({
        document: {
          createElement: () => ({}),
        },
      });
      stubGlobals.setDocument({
        createElement: () => ({}),
      });

      expect(canUseDOM()).toBe(true);
    });

    it('correctly identifies browser environment', () => {
      // Simulate browser with full DOM
      stubGlobals.setWindow({
        document: {
          createElement: (tag: string) => ({ tagName: tag }),
          querySelector: () => null,
          addEventListener: () => {},
        },
        addEventListener: () => {},
        location: { href: 'https://example.com' },
      });
      stubGlobals.setDocument({
        createElement: (tag: string) => ({ tagName: tag }),
        querySelector: () => null,
        addEventListener: () => {},
      });

      expect(canUseDOM()).toBe(true);
    });

    it('correctly identifies Web Worker environment (no document)', () => {
      // Web Workers have self and globalThis but no document or window
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      // Simulate Web Worker environment with self, postMessage, etc.
      vi.stubGlobal('self', {
        postMessage: () => {},
        addEventListener: () => {},
      });

      const result = canUseDOM();

      expect(result).toBe(false);
    });

    it('handles frozen window object', () => {
      // Create a frozen window-like object that cannot be modified
      const frozenWindow = Object.freeze({
        document: Object.freeze({
          createElement: () => ({}),
        }),
      });

      stubGlobals.setWindow(frozenWindow);
      stubGlobals.setDocument(frozenWindow.document);

      const result = canUseDOM();

      // Should still detect DOM availability
      expect(result).toBe(true);
    });

    it('handles sealed document object', () => {
      // Create a sealed document object (can modify properties but not add/remove)
      const sealedDocument = Object.seal({
        createElement: () => ({}),
        querySelector: () => null,
      });

      stubGlobals.setWindow({
        document: sealedDocument,
      });
      stubGlobals.setDocument(sealedDocument);

      const result = canUseDOM();

      expect(result).toBe(true);
    });

    it('handles restricted global objects with limited properties', () => {
      // Simulate a restricted environment with minimal window/document
      const restrictedWindow = {
        get document() {
          // Throw on access attempts
          throw new Error('Access to document is restricted');
        },
      };

      stubGlobals.setWindow(restrictedWindow);
      stubGlobals.removeDocument();

      const result = canUseDOM();

      // Should return false due to error during detection
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles concurrent calls correctly with caching', () => {
      // Set up DOM environment
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: () => ({}),
      });

      // Make multiple concurrent calls
      const results = [canUseDOM(), canUseDOM(), canUseDOM(), canUseDOM()];

      // All results should be consistent
      expect(results).toEqual([true, true, true, true]);
    });

    it('handles concurrent calls in headless mode', () => {
      stubGlobals.removeWindow();
      stubGlobals.removeDocument();

      // Make multiple concurrent calls
      const results = [canUseDOM(), canUseDOM(), canUseDOM()];

      // All results should be consistently false
      expect(results).toEqual([false, false, false]);
    });

    it('handles null prototype objects', () => {
      // Create objects with null prototype
      const nullProtoWindow = Object.create(null);
      nullProtoWindow.document = Object.create(null);
      nullProtoWindow.document.createElement = () => ({});

      stubGlobals.setWindow(nullProtoWindow);
      stubGlobals.setDocument(nullProtoWindow.document);

      const result = canUseDOM();

      expect(result).toBe(true);
    });

    it('handles document.createElement being null', () => {
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: null,
      });

      const result = canUseDOM();

      expect(result).toBe(false);
    });

    it('handles document.createElement being undefined', () => {
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: undefined,
      });

      const result = canUseDOM();

      expect(result).toBe(false);
    });

    it('handles document.createElement being a non-function', () => {
      stubGlobals.setWindow({});
      stubGlobals.setDocument({
        createElement: 'not a function',
      });

      const result = canUseDOM();

      expect(result).toBe(false);
    });

    it('handles Proxy-wrapped globals', () => {
      // Create a Proxy that intercepts property access
      const proxyDocument = new Proxy(
        { createElement: () => ({}) },
        {
          get(target, prop) {
            // Log access but allow it
            return target[prop as keyof typeof target];
          },
        },
      );

      stubGlobals.setWindow({
        document: proxyDocument,
      });
      stubGlobals.setDocument(proxyDocument);

      const result = canUseDOM();

      expect(result).toBe(true);
    });

    it('handles getters that throw on access', () => {
      // Create a throwing proxy for window
      const throwingWindow = new Proxy(
        {},
        {
          get() {
            throw new Error('Access denied');
          },
        },
      );
      stubGlobals.setWindow(throwingWindow);
      stubGlobals.removeDocument();

      // Call should fail gracefully due to throwing getter
      const result = canUseDOM();
      expect(result).toBe(false);
    });

    it('handles environment where globalThis itself is restricted', () => {
      // This test ensures the try-catch handles even extreme edge cases
      // We can't truly restrict globalThis in tests, but we verify the function works
      const result = canUseDOM();

      // Should return a boolean in all cases
      expect(typeof result).toBe('boolean');
    });
  });
});
