import { describe, it, expect } from 'vitest';
import { pictNodeTypeStrategy } from './pict-node-type-strategy';
import { handleVRectImport } from './handle-v-rect-import';
import { handleShapeTextboxImport } from './handle-shape-textbox-import';
import { handleShapeImageWatermarkImport } from './handle-shape-image-watermark-import';

describe('pictNodeTypeStrategy', () => {
  const createNode = (elements = []) => ({
    elements,
  });

  const createRect = () => ({
    name: 'v:rect',
  });

  const createShape = (elements = []) => ({
    name: 'v:shape',
    elements,
  });

  const createGroup = () => ({
    name: 'v:group',
  });

  const createTextbox = () => ({
    name: 'v:textbox',
  });

  describe('rect handler', () => {
    it('should return contentBlock type when rect element exists', () => {
      const node = createNode([createRect()]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'contentBlock',
        handler: handleVRectImport,
      });
    });

    it('should prioritize rect over shape', () => {
      const node = createNode([createRect(), createShape([createTextbox()])]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'contentBlock',
        handler: handleVRectImport,
      });
    });

    it('should prioritize rect over group', () => {
      const node = createNode([createRect(), createGroup()]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'contentBlock',
        handler: handleVRectImport,
      });
    });
  });

  describe('shapeContainer handler', () => {
    it('should return shapeContainer type when shape contains textbox', () => {
      const node = createNode([createShape([createTextbox()])]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'shapeContainer',
        handler: handleShapeTextboxImport,
      });
    });

    it('should return unknown when shape exists but has no textbox', () => {
      const node = createNode([createShape([])]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'unknown',
        handler: null,
      });
    });

    it('should return image type when shape contains imagedata (watermarks)', () => {
      const node = createNode([createShape([{ name: 'v:imagedata' }, { name: 'v:fill' }])]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'image',
        handler: handleShapeImageWatermarkImport,
      });
    });
  });

  describe('image handler', () => {
    it('should return image type when shape contains imagedata', () => {
      const node = createNode([createShape([{ name: 'v:imagedata', attributes: { 'r:id': 'rId1' } }])]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'image',
        handler: handleShapeImageWatermarkImport,
      });
    });

    it('should prioritize textbox over imagedata when both present', () => {
      const node = createNode([createShape([createTextbox(), { name: 'v:imagedata' }])]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'shapeContainer',
        handler: handleShapeTextboxImport,
      });
    });

    it('should return image type for watermark with imagedata only', () => {
      const shape = {
        name: 'v:shape',
        attributes: {
          id: 'WordPictureWatermark100927634',
          'o:spid': '_x0000_s1027',
          type: '#_x0000_t75',
          style: 'position:absolute;width:466.55pt;height:233.25pt;z-index:-251653120',
        },
        elements: [
          {
            name: 'v:imagedata',
            attributes: {
              'r:id': 'rId1',
              'o:title': 'Balloons',
            },
          },
        ],
      };
      const node = createNode([shape]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'image',
        handler: handleShapeImageWatermarkImport,
      });
    });
  });

  describe('group handler', () => {
    it('should return unknown when only group exists', () => {
      const node = createNode([createGroup()]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'unknown',
        handler: null,
      });
    });
  });

  describe('unknown handler', () => {
    it('should return unknown when no elements exist', () => {
      const node = createNode([]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'unknown',
        handler: null,
      });
    });

    it('should return unknown when node has no elements property', () => {
      const node = {};

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'unknown',
        handler: null,
      });
    });

    it('should return unknown when only irrelevant elements exist', () => {
      const node = createNode([{ name: 'v:imagedata' }, { name: 'v:fill' }]);

      const result = pictNodeTypeStrategy(node);

      expect(result).toEqual({
        type: 'unknown',
        handler: null,
      });
    });
  });
});
