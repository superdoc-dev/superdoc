import { describe, it, expect } from 'vitest';
import { mathNodeHandlerEntity } from './math-importer.js';

const { handler } = mathNodeHandlerEntity;

describe('mathNodeHandler', () => {
  describe('m:oMath (inline math)', () => {
    it('produces a mathInline node for m:oMath', () => {
      const oMathNode = {
        name: 'm:oMath',
        elements: [
          {
            name: 'm:r',
            elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x+1' }] }],
          },
        ],
      };

      const result = handler({ nodes: [oMathNode] });

      expect(result.consumed).toBe(1);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('mathInline');
      expect(result.nodes[0].attrs.textContent).toBe('x+1');
      expect(result.nodes[0].attrs.originalXml).toBeDefined();
      expect(result.nodes[0].attrs.originalXml.name).toBe('m:oMath');
    });

    it('preserves original XML for round-trip', () => {
      const oMathNode = {
        name: 'm:oMath',
        elements: [
          {
            name: 'm:sSup',
            elements: [
              {
                name: 'm:e',
                elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'x' }] }] }],
              },
              {
                name: 'm:sup',
                elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: '2' }] }] }],
              },
            ],
          },
        ],
      };

      const result = handler({ nodes: [oMathNode] });
      const original = result.nodes[0].attrs.originalXml;

      // originalXml should be a deep copy, not the same reference
      expect(original).not.toBe(oMathNode);
      expect(original.elements[0].name).toBe('m:sSup');
    });
  });

  describe('m:oMathPara (display math)', () => {
    it('produces a mathBlock node for m:oMathPara', () => {
      const oMathParaNode = {
        name: 'm:oMathPara',
        elements: [
          {
            name: 'm:oMathParaPr',
            elements: [{ name: 'm:jc', attributes: { 'm:val': 'right' } }],
          },
          {
            name: 'm:oMath',
            elements: [
              {
                name: 'm:r',
                elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'E=mc' }] }],
              },
            ],
          },
        ],
      };

      const result = handler({ nodes: [oMathParaNode] });

      expect(result.consumed).toBe(1);
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].type).toBe('mathBlock');
      expect(result.nodes[0].attrs.textContent).toBe('E=mc');
      expect(result.nodes[0].attrs.justification).toBe('right');
    });

    it('defaults justification to center when not specified', () => {
      const oMathParaNode = {
        name: 'm:oMathPara',
        elements: [
          {
            name: 'm:oMath',
            elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'y' }] }] }],
          },
        ],
      };

      const result = handler({ nodes: [oMathParaNode] });
      expect(result.nodes[0].attrs.justification).toBe('centerGroup');
    });

    it('captures paragraphProperties from extraParams', () => {
      const oMathParaNode = {
        name: 'm:oMathPara',
        elements: [
          {
            name: 'm:oMath',
            elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'z' }] }] }],
          },
        ],
      };

      const spacing = { before: 240, after: 160 };
      const result = handler({
        nodes: [oMathParaNode],
        extraParams: { inlineParagraphProperties: { spacing } },
      });

      expect(result.nodes[0].attrs.paragraphProperties).toEqual({ spacing });
    });

    it('sets paragraphProperties to null when extraParams is absent', () => {
      const oMathParaNode = {
        name: 'm:oMathPara',
        elements: [
          {
            name: 'm:oMath',
            elements: [{ name: 'm:r', elements: [{ name: 'm:t', elements: [{ type: 'text', text: 'w' }] }] }],
          },
        ],
      };

      const result = handler({ nodes: [oMathParaNode] });
      expect(result.nodes[0].attrs.paragraphProperties).toBeNull();
    });
  });

  describe('non-math elements', () => {
    it('returns consumed=0 for non-math elements', () => {
      const pNode = { name: 'w:p', elements: [] };
      const result = handler({ nodes: [pNode] });
      expect(result.consumed).toBe(0);
      expect(result.nodes).toHaveLength(0);
    });

    it('returns consumed=0 for empty nodes array', () => {
      const result = handler({ nodes: [] });
      expect(result.consumed).toBe(0);
    });
  });
});
