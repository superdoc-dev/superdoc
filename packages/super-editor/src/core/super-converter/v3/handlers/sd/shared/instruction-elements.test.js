import { describe, it, expect } from 'vitest';
import { buildInstructionElements } from './instruction-elements.js';

describe('buildInstructionElements', () => {
  describe('without instruction tokens', () => {
    it('creates single w:instrText element from instruction string', () => {
      const result = buildInstructionElements('INDEX \\h', null);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('w:instrText');
      expect(result[0].attributes).toEqual({ 'xml:space': 'preserve' });
      expect(result[0].elements[0].type).toBe('text');
      expect(result[0].elements[0].text).toBe('INDEX \\h');
    });

    it('handles undefined instruction', () => {
      const result = buildInstructionElements(undefined, null);

      expect(result).toHaveLength(1);
      expect(result[0].elements[0].text).toBe('');
    });

    it('handles null instruction', () => {
      const result = buildInstructionElements(null, null);

      expect(result).toHaveLength(1);
      expect(result[0].elements[0].text).toBe('');
    });

    it('handles empty instruction string', () => {
      const result = buildInstructionElements('', null);

      expect(result).toHaveLength(1);
      expect(result[0].elements[0].text).toBe('');
    });
  });

  describe('with instruction tokens', () => {
    it('creates elements from text tokens', () => {
      const tokens = [
        { type: 'text', text: 'INDEX \\e "' },
        { type: 'text', text: '"' },
      ];

      const result = buildInstructionElements('INDEX \\e ""', tokens);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('w:instrText');
      expect(result[0].elements[0].text).toBe('INDEX \\e "');
      expect(result[1].name).toBe('w:instrText');
      expect(result[1].elements[0].text).toBe('"');
    });

    it('creates w:tab element for tab tokens', () => {
      const tokens = [{ type: 'tab' }];

      const result = buildInstructionElements('', tokens);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('w:tab');
      expect(result[0].elements).toEqual([]);
    });

    it('handles mixed text and tab tokens', () => {
      const tokens = [{ type: 'text', text: 'INDEX \\e "' }, { type: 'tab' }, { type: 'text', text: '"' }];

      const result = buildInstructionElements('INDEX \\e "\t"', tokens);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('w:instrText');
      expect(result[0].elements[0].text).toBe('INDEX \\e "');
      expect(result[1].name).toBe('w:tab');
      expect(result[2].name).toBe('w:instrText');
      expect(result[2].elements[0].text).toBe('"');
    });

    it('handles empty tokens array', () => {
      const result = buildInstructionElements('INDEX', []);

      // Empty array falls through to instruction string fallback
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('w:instrText');
      expect(result[0].elements[0].text).toBe('INDEX');
    });

    it('handles token with undefined text', () => {
      const tokens = [{ type: 'text' }];

      const result = buildInstructionElements('', tokens);

      expect(result).toHaveLength(1);
      expect(result[0].elements[0].text).toBe('');
    });

    it('handles unknown token types', () => {
      const tokens = [{ type: 'unknown' }];

      const result = buildInstructionElements('', tokens);

      // Unknown types are treated as text with empty content
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('w:instrText');
    });
  });

  describe('xml:space preserve attribute', () => {
    it('includes xml:space preserve on all instrText elements', () => {
      const tokens = [
        { type: 'text', text: 'A' },
        { type: 'text', text: 'B' },
      ];

      const result = buildInstructionElements('', tokens);

      result
        .filter((el) => el.name === 'w:instrText')
        .forEach((el) => {
          expect(el.attributes['xml:space']).toBe('preserve');
        });
    });
  });
});
