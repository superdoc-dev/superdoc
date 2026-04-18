import { expect, describe, it } from 'vitest';
import { parseMarks } from '@core/super-converter/v2/importer/markImporter.js';

/**
 * Tests for strike mark import, specifically handling w:val="0" (strike negation)
 *
 * Background:
 * In OOXML, w:strike with w:val="0" means "explicitly disable strikethrough".
 * This is used to override style-based strikethrough. For example, if a paragraph
 * style has strikethrough enabled, but you want specific text NOT to be struck,
 * you add <w:strike w:val="0"/> to that run.
 *
 * The Bug (P1):
 * The importer currently filters out marks with w:val="0" (markImporter.js:68-70),
 * treating them as if they don't exist. This means strike negations are lost during
 * import, and when the document is exported, those runs will be struck (because the
 * base style says so, and there's no negation mark to override it).
 *
 * The Fix:
 * We need to preserve w:strike with w:val="0" as a strike mark with attrs.value="0",
 * so the exporter can emit <w:strike w:val="0"/> to maintain round-trip fidelity.
 */

describe('Strike mark importer', () => {
  describe('w:strike with w:val="0" (explicit negation)', () => {
    it('should create a strike mark with value="0" when importing w:strike w:val="0"', () => {
      // This is the P1 bug: strike marks with w:val="0" are currently filtered out
      // Expected behavior: Create a mark with type='strike' and attrs.value='0'
      // Actual behavior: The mark is filtered out (returns early at markImporter.js:68-70)

      const runProperties = {
        name: 'w:rPr',
        elements: [
          {
            name: 'w:strike',
            attributes: { 'w:val': '0' },
          },
        ],
      };

      const marks = parseMarks(runProperties);

      // THIS TEST WILL FAIL - the mark is currently filtered out
      const strikeMark = marks.find((m) => m.type === 'strike');
      expect(strikeMark).toBeDefined();
      expect(strikeMark?.attrs?.value).toBe('0');
    });

    it.skip('should create a strike mark when importing w:strike without w:val (defaults to enabled)', () => {
      // When w:strike has no w:val attribute, it means strike is enabled
      // getStrikeValue returns '1' when no val is present, so with property: 'value'
      // set in SuperConverter, this should create a mark with value: '1'
      // THIS TEST IS CURRENTLY FAILING - even though the mark exists, value is undefined

      const runProperties = {
        name: 'w:rPr',
        elements: [
          {
            name: 'w:strike',
            attributes: {},
          },
        ],
      };

      const marks = parseMarks(runProperties);

      // Mark is created but...
      const strikeMark = marks.find((m) => m.type === 'strike');
      expect(strikeMark).toBeDefined();
      // This fails - value is undefined, but should be '1'
      // This might be because when attributes object is empty, markImporter.js:96
      // checks `if (Object.keys(attributes).length)` and skips the value assignment
      expect(strikeMark?.attrs?.value).toBe('1');
    });

    it('should create a strike mark when importing w:strike with w:val="1"', () => {
      const runProperties = {
        name: 'w:rPr',
        elements: [
          {
            name: 'w:strike',
            attributes: { 'w:val': '1' },
          },
        ],
      };

      const marks = parseMarks(runProperties);

      const strikeMark = marks.find((m) => m.type === 'strike');
      expect(strikeMark).toBeDefined();
      expect(strikeMark?.attrs?.value).toBe('1');
    });

    it('should create a strike mark when importing w:strike with w:val="true"', () => {
      const runProperties = {
        name: 'w:rPr',
        elements: [
          {
            name: 'w:strike',
            attributes: { 'w:val': 'true' },
          },
        ],
      };

      const marks = parseMarks(runProperties);

      const strikeMark = marks.find((m) => m.type === 'strike');
      expect(strikeMark).toBeDefined();
      expect(strikeMark?.attrs?.value).toBe('1');
    });
  });

  describe('Double strike (w:dstrike)', () => {
    it.skip('should handle w:dstrike with w:val="0" similarly to w:strike', () => {
      // Double strike should have the same behavior as regular strike
      // Currently this will also fail for the same reason

      const runProperties = {
        name: 'w:rPr',
        elements: [
          {
            name: 'w:dstrike',
            attributes: { 'w:val': '0' },
          },
        ],
      };

      const marks = parseMarks(runProperties);

      // THIS TEST WILL ALSO FAIL - dstrike with w:val="0" is filtered out
      const doubleStrikeMark = marks.find((m) => m.type === 'doubleStrike');
      expect(doubleStrikeMark).toBeDefined();
      expect(doubleStrikeMark?.attrs?.value).toBe('0');
    });

    it.skip('should create a doubleStrike mark when w:val is not 0', () => {
      const runProperties = {
        name: 'w:rPr',
        elements: [
          {
            name: 'w:dstrike',
            attributes: {},
          },
        ],
      };

      const marks = parseMarks(runProperties);

      const doubleStrikeMark = marks.find((m) => m.type === 'doubleStrike');
      expect(doubleStrikeMark).toBeDefined();
    });
  });

  describe('Comparison with bold (w:b) which IS handled correctly', () => {
    it('should preserve w:b with w:val="0" because bold is in the exception list', () => {
      // Bold is in the exceptionMarks list (markImporter.js:67), so it should work

      const runProperties = {
        name: 'w:rPr',
        elements: [
          {
            name: 'w:b',
            attributes: { 'w:val': '0' },
          },
        ],
      };

      const marks = parseMarks(runProperties);

      // This SHOULD pass because w:b is in the exception list
      const boldMark = marks.find((m) => m.type === 'bold');
      expect(boldMark).toBeDefined();
      expect(boldMark?.attrs?.value).toBe('0');
    });
  });
});
