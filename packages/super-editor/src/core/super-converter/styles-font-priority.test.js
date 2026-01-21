/**
 * Test suite for font-size priority and inline property override behavior.
 *
 * These tests verify that inline direct formatting (e.g., w:sz) correctly overrides
 * properties from character styles (e.g., w:rStyle) in OOXML documents.
 *
 * Context: In OOXML, when a run has both a character style reference (w:rStyle)
 * AND inline direct formatting (e.g., w:sz, w:b), the inline formatting must take
 * precedence according to the OOXML specification.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { resolveRunProperties, combineRunProperties } from './styles.js';

beforeAll(() => {
  vi.stubGlobal('SuperConverter', {
    toCssFontFamily: (font) => font,
  });
});

const buildTranslatedLinkedStyles = (styles = {}) => ({
  docDefaults: {
    runProperties: {},
    paragraphProperties: {},
  },
  latentStyles: {},
  styles: {
    Normal: {
      styleId: 'Normal',
      type: 'paragraph',
      default: true,
      name: 'Normal',
      runProperties: {},
      paragraphProperties: {},
    },
    DefaultParagraphFont: {
      styleId: 'DefaultParagraphFont',
      type: 'character',
      default: true,
      name: 'Default Paragraph Font',
      runProperties: {},
      paragraphProperties: {},
    },
    ...styles,
  },
});

describe('resolveRunProperties - inline property priority', () => {
  /**
   * Test that inline w:sz (direct formatting) overrides character style fontSize.
   * This tests the exact scenario from hyperlink-font-size.docx:
   * - Paragraph style p1 has rPr with sz=18 (9pt)
   * - Character style s1 has sz=18 (9pt)
   * - Inline run has rStyle=s1 AND sz=24 (12pt)
   * - Expected: fontSize should be 24 (12pt from inline), not 18 (from style)
   */
  it('should prioritize inline fontSize over character style fontSize', () => {
    const translatedLinkedStyles = buildTranslatedLinkedStyles({
      p1: {
        styleId: 'p1',
        type: 'paragraph',
        basedOn: 'Normal',
        runProperties: {
          fontSize: 18,
        },
        paragraphProperties: {},
      },
      s1: {
        styleId: 's1',
        type: 'character',
        basedOn: 'DefaultParagraphFont',
        runProperties: {
          fontSize: 18,
        },
        paragraphProperties: {},
      },
    });

    const params = {
      translatedLinkedStyles,
      translatedNumbering: { definitions: {}, abstracts: {} },
    };

    // Inline run properties: has BOTH styleId (s1) AND inline fontSize (24)
    const inlineRpr = {
      styleId: 's1', // Character style with fontSize: 18
      fontSize: 24, // Inline direct formatting: 12pt (should win!)
      bold: true,
    };

    // Resolved paragraph properties (from p1 style)
    const resolvedPpr = {
      styleId: 'p1',
    };

    const result = resolveRunProperties(params, inlineRpr, resolvedPpr);

    // The inline fontSize (24) should override the character style fontSize (18)
    expect(result.fontSize).toBe(24);
    expect(result.bold).toBe(true);
  });

  it('should use character style fontSize when no inline fontSize is specified', () => {
    const params = {
      translatedLinkedStyles: buildTranslatedLinkedStyles({
        s1: {
          styleId: 's1',
          type: 'character',
          basedOn: 'DefaultParagraphFont',
          runProperties: {
            fontSize: 18,
          },
          paragraphProperties: {},
        },
      }),
      translatedNumbering: { definitions: {}, abstracts: {} },
    };

    // Inline run properties: ONLY has styleId, NO inline fontSize
    const inlineRpr = {
      styleId: 's1',
      bold: true,
      // NO fontSize here - should use character style's fontSize
    };

    const resolvedPpr = {};

    const result = resolveRunProperties(params, inlineRpr, resolvedPpr);

    // Should use character style fontSize (18)
    expect(result.fontSize).toBe(18);
    expect(result.bold).toBe(true);
  });

  it('should handle hyperlink character style with color and underline', () => {
    const params = {
      translatedLinkedStyles: buildTranslatedLinkedStyles({
        Hyperlink: {
          styleId: 'Hyperlink',
          type: 'character',
          basedOn: 'DefaultParagraphFont',
          runProperties: {
            color: { val: '0000FF' },
            underline: { 'w:val': 'single' },
          },
          paragraphProperties: {},
        },
      }),
      translatedNumbering: { definitions: {}, abstracts: {} },
    };

    const inlineRpr = {
      styleId: 'Hyperlink',
    };

    const resolvedPpr = {};

    const result = resolveRunProperties(params, inlineRpr, resolvedPpr);

    // Should resolve color and underline from Hyperlink style
    expect(result.color).toEqual({ val: '0000FF' });
    expect(result.underline).toEqual({ 'w:val': 'single' });
  });

  it('should test combineProperties with fontSize override', async () => {
    const chain = [
      { fontSize: 18, color: { val: 'FF0000' } }, // from character style
      { fontSize: 24, bold: true, color: { val: '00FF00' } }, // from inline (should win)
    ];

    const result = combineRunProperties(chain);

    // fontSize should be 24 (from inline)
    expect(result.fontSize).toBe(24);
    // bold should be true (from inline)
    expect(result.bold).toBe(true);
    // color should be fully replaced by inline version (not merged)
    expect(result.color).toEqual({ val: '00FF00' });
  });

  it('should ensure all inline properties override character style properties', () => {
    const params = {
      translatedLinkedStyles: buildTranslatedLinkedStyles({
        s1: {
          styleId: 's1',
          type: 'character',
          basedOn: 'DefaultParagraphFont',
          runProperties: {
            fontSize: 18,
            bold: true,
            italic: true,
          },
          paragraphProperties: {},
        },
      }),
      translatedNumbering: { definitions: {}, abstracts: {} },
    };

    // Inline run properties: override fontSize, bold, italic with different values
    const inlineRpr = {
      styleId: 's1',
      fontSize: 24, // Override to 12pt
      bold: false, // Override to NOT bold
      italic: true, // Keep italic (matches style, but should still use inline value)
      strike: true, // New property not in style
    };

    const resolvedPpr = {};

    const result = resolveRunProperties(params, inlineRpr, resolvedPpr);

    // All inline properties should win
    expect(result.fontSize).toBe(24);
    expect(result.bold).toBe(false);
    expect(result.italic).toBe(true);
    expect(result.strike).toBe(true);
  });
});
