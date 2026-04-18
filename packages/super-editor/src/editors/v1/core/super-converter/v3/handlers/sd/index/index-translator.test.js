import { describe, it, expect, vi } from 'vitest';
import { config, translator } from './index.js';

describe('sd:index translator', () => {
  describe('config', () => {
    it('has correct XML and SD node names', () => {
      expect(config.xmlName).toBe('sd:index');
      expect(config.sdNodeOrKeyName).toBe('index');
    });
  });

  describe('encode', () => {
    it('encodes sd:index node to SuperDoc index node', () => {
      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue([{ type: 'paragraph', content: [] }]),
      };

      const result = config.encode({
        nodes: [
          {
            name: 'sd:index',
            attributes: {
              instruction: 'INDEX \\e "\\t"',
            },
            elements: [{ name: 'w:p', elements: [] }],
          },
        ],
        nodeListHandler: mockNodeListHandler,
      });

      expect(result.type).toBe('index');
      expect(result.attrs.instruction).toBe('INDEX \\e "\\t"');
      expect(result.content).toEqual([{ type: 'paragraph', content: [] }]);
    });

    it('preserves instruction tokens when present', () => {
      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue([]),
      };

      const instructionTokens = [{ type: 'text', text: 'INDEX \\e "' }, { type: 'tab' }, { type: 'text', text: '"' }];

      const result = config.encode({
        nodes: [
          {
            name: 'sd:index',
            attributes: {
              instruction: 'INDEX \\e "\t"',
              instructionTokens,
            },
            elements: [],
          },
        ],
        nodeListHandler: mockNodeListHandler,
      });

      expect(result.attrs.instructionTokens).toEqual(instructionTokens);
    });

    it('handles missing instruction attribute', () => {
      const mockNodeListHandler = {
        handler: vi.fn().mockReturnValue([]),
      };

      const result = config.encode({
        nodes: [
          {
            name: 'sd:index',
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
    it('creates empty paragraph wrapper when content is empty', () => {
      const mockParams = {
        node: {
          type: 'index',
          attrs: {
            instruction: 'INDEX',
          },
          content: [],
        },
      };

      const result = config.decode(mockParams);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('w:p');

      // Should have fldChar begin, instrText, separate, and end
      const fldCharBegin = result[0].elements.find(
        (el) =>
          el.name === 'w:r' &&
          el.elements?.some((e) => e.name === 'w:fldChar' && e.attributes?.['w:fldCharType'] === 'begin'),
      );
      expect(fldCharBegin).toBeDefined();

      const fldCharEnd = result[0].elements.find(
        (el) =>
          el.name === 'w:r' &&
          el.elements?.some((e) => e.name === 'w:fldChar' && e.attributes?.['w:fldCharType'] === 'end'),
      );
      expect(fldCharEnd).toBeDefined();
    });

    it('reconstructs instruction tokens with tabs', () => {
      const instructionTokens = [{ type: 'text', text: 'INDEX \\e "' }, { type: 'tab' }, { type: 'text', text: '"' }];

      const mockParams = {
        node: {
          type: 'index',
          attrs: {
            instruction: 'INDEX \\e "\t"',
            instructionTokens,
          },
          content: [],
        },
      };

      const result = config.decode(mockParams);

      // Find the instruction run
      const firstPara = result[0];
      const instrRun = firstPara.elements.find(
        (el) => el.name === 'w:r' && el.elements?.some((e) => e.name === 'w:instrText' || e.name === 'w:tab'),
      );

      expect(instrRun).toBeDefined();

      // Should contain w:tab element
      const hasTab = instrRun.elements.some((e) => e.name === 'w:tab');
      expect(hasTab).toBe(true);
    });

    it('includes instruction text in field structure', () => {
      const mockParams = {
        node: {
          type: 'index',
          attrs: {
            instruction: 'INDEX \\h "A"',
          },
          content: [],
        },
      };

      const result = config.decode(mockParams);

      // Find instrText element
      const firstPara = result[0];
      const instrRun = firstPara.elements.find(
        (el) => el.name === 'w:r' && el.elements?.some((e) => e.name === 'w:instrText'),
      );

      expect(instrRun).toBeDefined();
      const instrText = instrRun.elements.find((e) => e.name === 'w:instrText');
      expect(instrText.elements[0].text).toBe('INDEX \\h "A"');
    });
  });

  describe('translator instance', () => {
    it('creates valid NodeTranslator instance', () => {
      expect(translator).toBeDefined();
      expect(translator.xmlName).toBe('sd:index');
      expect(translator.sdNodeOrKeyName).toBe('index');
    });
  });
});
