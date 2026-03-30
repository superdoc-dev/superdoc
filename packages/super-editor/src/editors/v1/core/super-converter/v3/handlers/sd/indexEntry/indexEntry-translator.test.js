import { describe, it, expect, vi } from 'vitest';
import { config, translator } from './index.js';

describe('sd:indexEntry translator', () => {
  describe('config', () => {
    it('has correct XML and SD node names', () => {
      expect(config.xmlName).toBe('sd:indexEntry');
      expect(config.sdNodeOrKeyName).toBe('indexEntry');
    });
  });

  describe('encode', () => {
    it('encodes sd:indexEntry node to SuperDoc indexEntry node', () => {
      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue([{ type: 'text', text: 'hidden' }]),
      };

      const result = config.encode({
        nodes: [
          {
            name: 'sd:indexEntry',
            attributes: {
              instruction: 'XE "Term"',
            },
            elements: [{ name: 'w:r', elements: [] }],
          },
        ],
        nodeListHandler: mockNodeListHandler,
      });

      expect(result.type).toBe('indexEntry');
      expect(result.attrs.instruction).toBe('XE "Term"');
    });

    it('preserves instruction tokens when present', () => {
      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue([]),
      };

      const instructionTokens = [{ type: 'text', text: 'XE "Term:Subterm"' }];

      const result = config.encode({
        nodes: [
          {
            name: 'sd:indexEntry',
            attributes: {
              instruction: 'XE "Term:Subterm"',
              instructionTokens,
            },
            elements: [],
          },
        ],
        nodeListHandler: mockNodeListHandler,
      });

      expect(result.attrs.instructionTokens).toEqual(instructionTokens);
    });

    it('captures marks from node', () => {
      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue([]),
      };

      const marks = [{ type: 'bold' }, { type: 'italic' }];

      const result = config.encode({
        nodes: [
          {
            name: 'sd:indexEntry',
            attributes: {
              instruction: 'XE "Term"',
            },
            marks,
            elements: [],
          },
        ],
        nodeListHandler: mockNodeListHandler,
      });

      expect(result.attrs.marksAsAttrs).toEqual(marks);
    });

    it('handles missing instruction attribute', () => {
      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue([]),
      };

      const result = config.encode({
        nodes: [
          {
            name: 'sd:indexEntry',
            attributes: {},
            elements: [],
          },
        ],
        nodeListHandler: mockNodeListHandler,
      });

      expect(result.attrs.instruction).toBe('');
      expect(result.attrs.instructionTokens).toBeNull();
    });
  });

  describe('decode', () => {
    it('decodes indexEntry node back to OOXML field structure', () => {
      const mockParams = {
        node: {
          type: 'indexEntry',
          attrs: {
            instruction: 'XE "Term"',
          },
          content: [],
        },
      };

      const result = config.decode(mockParams);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3); // begin, instrText, separate, end runs

      // Should have fldChar begin
      const beginRun = result.find(
        (el) =>
          el.name === 'w:r' &&
          el.elements?.some((e) => e.name === 'w:fldChar' && e.attributes?.['w:fldCharType'] === 'begin'),
      );
      expect(beginRun).toBeDefined();

      // Should have instrText
      const instrRun = result.find((el) => el.name === 'w:r' && el.elements?.some((e) => e.name === 'w:instrText'));
      expect(instrRun).toBeDefined();

      // Should have fldChar separate
      const separateRun = result.find(
        (el) =>
          el.name === 'w:r' &&
          el.elements?.some((e) => e.name === 'w:fldChar' && e.attributes?.['w:fldCharType'] === 'separate'),
      );
      expect(separateRun).toBeDefined();

      // Should have fldChar end
      const endRun = result.find(
        (el) =>
          el.name === 'w:r' &&
          el.elements?.some((e) => e.name === 'w:fldChar' && e.attributes?.['w:fldCharType'] === 'end'),
      );
      expect(endRun).toBeDefined();
    });

    it('includes rPr elements in runs', () => {
      const mockParams = {
        node: {
          type: 'indexEntry',
          attrs: {
            instruction: 'XE "Term"',
            marksAsAttrs: [],
          },
          content: [],
        },
      };

      const result = config.decode(mockParams);

      // Each run should have rPr element
      const runsWithRPr = result.filter((el) => el.name === 'w:r' && el.elements?.some((e) => e.name === 'w:rPr'));
      expect(runsWithRPr.length).toBeGreaterThan(0);
    });

    it('reconstructs instruction tokens with tabs', () => {
      const instructionTokens = [{ type: 'text', text: 'XE "' }, { type: 'tab' }, { type: 'text', text: '"' }];

      const mockParams = {
        node: {
          type: 'indexEntry',
          attrs: {
            instruction: 'XE "\t"',
            instructionTokens,
          },
          content: [],
        },
      };

      const result = config.decode(mockParams);

      // Find the instruction run
      const instrRun = result.find(
        (el) => el.name === 'w:r' && el.elements?.some((e) => e.name === 'w:instrText' || e.name === 'w:tab'),
      );

      expect(instrRun).toBeDefined();

      // Should contain w:tab element
      const hasTab = instrRun.elements.some((e) => e.name === 'w:tab');
      expect(hasTab).toBe(true);
    });

    it('includes instruction text in instrText element', () => {
      const mockParams = {
        node: {
          type: 'indexEntry',
          attrs: {
            instruction: 'XE "My Term"',
          },
          content: [],
        },
      };

      const result = config.decode(mockParams);

      // Find instrText element
      const instrRun = result.find((el) => el.name === 'w:r' && el.elements?.some((e) => e.name === 'w:instrText'));

      expect(instrRun).toBeDefined();
      const instrText = instrRun.elements.find((e) => e.name === 'w:instrText');
      expect(instrText.elements[0].text).toBe('XE "My Term"');
    });
  });

  describe('translator instance', () => {
    it('creates valid NodeTranslator instance', () => {
      expect(translator).toBeDefined();
      expect(translator.xmlName).toBe('sd:indexEntry');
      expect(translator.sdNodeOrKeyName).toBe('indexEntry');
    });
  });
});
