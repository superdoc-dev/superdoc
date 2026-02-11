import { beforeEach, it, expect } from 'vitest';
import { translator } from './pict-translator.js';

import { createPict, createRect, createShape, createGroup, createTextbox } from '@tests/helpers/pict-helpers';
import { createRels } from '@tests/helpers/rels-helpers';

describe('w:pict translator', () => {
  let mockImageId;
  let mockDocx;

  describe('encode', () => {
    beforeEach(() => {
      mockImageId = 'rId12345';
      mockDocx = {
        ...createRels({ rels: { [mockImageId]: 'media/image1.png' } }),
      };
    });

    it('returns empty result when nodes array is empty', () => {
      const result = translator.encode({ nodes: [] });
      expect(result).toBeUndefined();
    });

    it('returns empty result when first node is not w:pict', () => {
      const result = translator.encode({ nodes: [{ name: 'w:p' }] });
      expect(result).toBeUndefined();
    });

    it('returns empty result when w:pict is empty', () => {
      const pictNode = {
        name: 'w:pict',
        elements: [],
      };
      const result = translator.encode({ nodes: [pictNode] });
      expect(result).toBeUndefined();
    });

    describe('with v:shape child', () => {
      describe('with v:imagedata', () => {
        it('returns an image', () => {
          const pictNode = createPict([
            createShape([{ name: 'v:imagedata', attributes: { 'r:id': mockImageId } }, { name: 'v:fill' }]),
          ]);
          const result = translator.encode({ nodes: [pictNode], docx: mockDocx });

          expect(result).toBeDefined();
          expect(result.type).toBe('image');
          // TODO: more assertions
        });
      });

      describe('with v:textpath', () => {
        it('returns an image', () => {
          const pictNode = createPict([createShape([{ name: 'v:textpath', attributes: { string: 'Hello world' } }])]);
          const result = translator.encode({ nodes: [pictNode] });

          expect(result).toBeDefined();
          expect(result.type).toBe('image');
          // TODO: more assertions
        });
      });

      describe('with v:textbox', () => {
        it('returns a shapeContainer', () => {
          const pictNode = createPict([createShape([{ name: 'v:textbox', attributes: {} }])]);
          const result = translator.encode({ nodes: [pictNode] });

          expect(result).toBeDefined();
          expect(result.type).toBe('shapeContainer');
          // TODO: more assertions
        });
      });
    });

    describe('with v:rect child', () => {
      it('returns a contentBlock', () => {
        const pictNode = createPict([createRect()]);
        const result = translator.encode({ nodes: [pictNode] });

        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('contentBlock');
        // TODO: more assertions
      });
    });
  });
});
