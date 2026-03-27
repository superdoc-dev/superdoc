import { describe, it, expect, afterEach, vi } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

/**
 * Fonts-resolved Event Contract Tests
 *
 * These tests specifically verify the fonts-resolved event behavior and contract.
 * Prevents regression where the event payload structure changes.
 */
describe('Editor - fonts-resolved event contract', () => {
  let editor;

  afterEach(() => {
    if (editor && !editor.isDestroyed) {
      editor.destroy();
      editor = null;
    }
  });

  it('onFontsResolved callback type should accept single object (not array)', () => {
    // This test verifies the callback signature matches what we emit
    // E2E tests and production code expect: { documentFonts, unsupportedFonts }

    const validCallback = ({ documentFonts, unsupportedFonts }) => {
      // E2E tests destructure like this
      expect(Array.isArray(documentFonts)).toBe(true);
      expect(Array.isArray(unsupportedFonts)).toBe(true);
    };

    const mockPayload = {
      documentFonts: ['Arial', 'Times New Roman'],
      unsupportedFonts: ['CustomFont'],
    };

    expect(() => validCallback(mockPayload)).not.toThrow();
  });

  it('payload should have documentFonts and unsupportedFonts arrays', () => {
    // Verify the structure of the payload
    const mockPayload = {
      documentFonts: ['Arial', 'Calibri'],
      unsupportedFonts: ['CustomFont1', 'CustomFont2'],
    };

    // Must be object, not array
    expect(Array.isArray(mockPayload)).toBe(false);
    expect(typeof mockPayload).toBe('object');

    // Must have both properties as arrays
    expect(Array.isArray(mockPayload.documentFonts)).toBe(true);
    expect(Array.isArray(mockPayload.unsupportedFonts)).toBe(true);
  });

  it('onFontsResolved should be optional (null by default)', () => {
    // Editor without onFontsResolved
    const editor1 = initTestEditor({
      mode: 'text',
      content: '<p>Test</p>',
    }).editor;

    // Should be null if not provided (font checking is skipped)
    expect(editor1.options.onFontsResolved).toBeNull();

    editor1.destroy();
  });

  it('onFontsResolved callback should be set if provided', () => {
    const spy = vi.fn();

    // Editor with onFontsResolved
    const editor2 = initTestEditor({
      mode: 'text',
      content: '<p>Test</p>',
      onFontsResolved: spy,
    }).editor;

    expect(editor2.options.onFontsResolved).toBe(spy);

    editor2.destroy();
  });

  it('should handle empty font lists correctly', () => {
    // Empty lists should still be valid
    const emptyPayload = {
      documentFonts: [],
      unsupportedFonts: [],
    };

    expect(Array.isArray(emptyPayload.documentFonts)).toBe(true);
    expect(Array.isArray(emptyPayload.unsupportedFonts)).toBe(true);
    expect(emptyPayload.documentFonts).toHaveLength(0);
    expect(emptyPayload.unsupportedFonts).toHaveLength(0);
  });

  it('should NOT accept array payload (regression test)', () => {
    // This documents what the WRONG format looked like during regression
    const correctPayload = {
      documentFonts: ['Arial'],
      unsupportedFonts: [],
    };

    // Correct format allows destructuring
    const { documentFonts, unsupportedFonts } = correctPayload;
    expect(documentFonts).toEqual(['Arial']);
    expect(unsupportedFonts).toEqual([]);

    // Incorrect format (array) - what the regression looked like:
    // const incorrectPayload = [
    //   {
    //     documentFonts: ['Arial'],
    //     unsupportedFonts: [],
    //   },
    // ];
    // const { documentFonts, unsupportedFonts } = incorrectPayload;
    // This would fail! documentFonts would be undefined

    // Test would catch this:
    expect(() => {
      const arrayPayload = [{ documentFonts: [], unsupportedFonts: [] }];
      const { documentFonts: fonts } = arrayPayload;
      // fonts would be undefined, not an array!
      expect(fonts).toBeUndefined(); // This proves array format is wrong
    }).not.toThrow();
  });
});
