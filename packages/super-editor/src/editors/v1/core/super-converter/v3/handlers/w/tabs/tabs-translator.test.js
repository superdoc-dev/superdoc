import { describe, it, expect } from 'vitest';
import { translator } from './tabs-translator.js';

vi.mock('../../../../exporter.js', () => {
  const processOutputMarks = vi.fn((marks) => marks || []);
  const generateRunProps = vi.fn((processedMarks) => ({
    name: 'w:rPr',
    elements: [],
  }));
  return { processOutputMarks, generateRunProps };
});

describe('w:tabs translator', () => {
  describe('encode', () => {
    it('should encode a w:tabs element with multiple w:tab child properties', () => {
      const xmlNode = {
        name: 'w:tabs',
        elements: [
          {
            name: 'w:tab',
            attributes: { 'w:val': 'left', 'w:pos': '100', 'w:leader': 'dot' },
          },
          {
            name: 'w:tab',
            attributes: { 'w:val': 'center', 'w:pos': '200' },
          },
          {
            name: 'w:tab',
            attributes: { 'w:val': 'right', 'w:pos': '300', 'w:leader': 'hyphen' },
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual([
        { tab: { tabType: 'left', pos: 100, leader: 'dot' } },
        { tab: { tabType: 'center', pos: 200 } },
        { tab: { tabType: 'right', pos: 300, leader: 'hyphen' } },
      ]);
    });

    it('should encode a w:tabs element with partial w:tab attributes', () => {
      const xmlNode = {
        name: 'w:tabs',
        elements: [
          {
            name: 'w:tab',
            attributes: { 'w:pos': '150' },
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual([{ tab: { pos: 150 } }]);
    });

    it('should return an empty array if no w:tab child elements are present', () => {
      const xmlNode = {
        name: 'w:tabs',
        elements: [],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual([]);
    });
  });

  describe('decode', () => {
    it('should decode a SuperDoc array of tab objects into a w:tabs XML node', () => {
      const superDocNode = {
        attrs: {
          tabStops: [
            { tab: { tabType: 'left', pos: '100', leader: 'dot' } },
            { tab: { tabType: 'center', pos: '200' } },
          ],
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:tabs',
        attributes: {},
        elements: [
          { name: 'w:tab', attributes: { 'w:val': 'left', 'w:pos': '100', 'w:leader': 'dot' }, elements: [] },
          { name: 'w:tab', attributes: { 'w:val': 'center', 'w:pos': '200' }, elements: [] },
        ],
      });
    });

    it('should decode a SuperDoc array of tab objects with partial properties', () => {
      const superDocNode = {
        attrs: {
          tabStops: [{ tab: { pos: '150' } }],
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:tabs',
        attributes: {},
        elements: [{ name: 'w:tab', attributes: { 'w:pos': '150' }, elements: [] }],
      });
    });

    it('should return undefined if the SuperDoc array is empty', () => {
      const superDocNode = {
        attrs: {
          tabStops: [],
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });

    it('should return undefined if the tabs attribute is missing', () => {
      const superDocNode = {
        attrs: {},
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });
  });
});
