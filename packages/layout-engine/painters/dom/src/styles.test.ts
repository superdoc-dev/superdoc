import { describe, expect, it } from 'vitest';
import { ensureNativeSelectionStyles } from './styles.js';

/**
 * Tests for style injection functions.
 * Focuses on ensureNativeSelectionStyles which prevents "double selection" artifacts.
 *
 * NOTE: These functions use module-level flags for idempotency, so they can only
 * be called once per test run. The tests verify behavior on the actual document
 * that gets modified on first call.
 */
describe('ensureNativeSelectionStyles', () => {
  it('injects native selection styles into document head', () => {
    // Use the real document since module-level flag prevents testing with fresh docs
    ensureNativeSelectionStyles(document);

    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.tagName).toBe('STYLE');
    expect(styleEl?.parentElement).toBe(document.head);
  });

  it('injects styles only once (idempotent behavior)', () => {
    // Call multiple times - should still only have one style element
    ensureNativeSelectionStyles(document);
    ensureNativeSelectionStyles(document);
    ensureNativeSelectionStyles(document);

    const styleElements = document.querySelectorAll('[data-superdoc-native-selection-styles="true"]');
    expect(styleElements.length).toBe(1);
  });

  it('does nothing when document is null', () => {
    // Should not throw
    expect(() => ensureNativeSelectionStyles(null)).not.toThrow();
  });

  it('does nothing when document is undefined', () => {
    // Should not throw
    expect(() => ensureNativeSelectionStyles(undefined)).not.toThrow();
  });

  it('injected CSS contains ::selection pseudo-element for Chromium/WebKit', () => {
    ensureNativeSelectionStyles(document);

    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    expect(cssText).toContain('::selection');
    expect(cssText).toContain('.superdoc-layout *::selection');
    expect(cssText).toContain('background: transparent');
  });

  it('injected CSS contains ::-moz-selection pseudo-element for Firefox', () => {
    ensureNativeSelectionStyles(document);

    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    expect(cssText).toContain('::-moz-selection');
    expect(cssText).toContain('.superdoc-layout *::-moz-selection');
    expect(cssText).toContain('background: transparent');
  });

  it('injected styles target layout engine content specifically', () => {
    ensureNativeSelectionStyles(document);

    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    // Should scope to .superdoc-layout to avoid affecting other page content
    expect(cssText).toContain('.superdoc-layout');
  });

  it('sets background to transparent to hide native selection highlight', () => {
    ensureNativeSelectionStyles(document);

    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    // Count occurrences - should have 2 (one for ::selection, one for ::-moz-selection)
    const matches = cssText.match(/background:\s*transparent/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(2);
  });

  it('maintains proper CSS structure with both browser-specific selectors', () => {
    ensureNativeSelectionStyles(document);

    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    const cssText = styleEl?.textContent ?? '';

    // Verify CSS structure is well-formed
    expect(cssText).toMatch(/\.superdoc-layout\s+\*::selection\s*\{/);
    expect(cssText).toMatch(/\.superdoc-layout\s+\*::-moz-selection\s*\{/);
  });

  it('uses data attribute for identification to avoid conflicts', () => {
    ensureNativeSelectionStyles(document);

    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    expect(styleEl?.getAttribute('data-superdoc-native-selection-styles')).toBe('true');
  });

  it('appends to head preserving existing head children', () => {
    ensureNativeSelectionStyles(document);

    // Verify the style element is in the head
    const styleEl = document.querySelector('[data-superdoc-native-selection-styles="true"]');
    expect(styleEl).not.toBeNull();
    expect(document.head.contains(styleEl)).toBe(true);
  });
});
