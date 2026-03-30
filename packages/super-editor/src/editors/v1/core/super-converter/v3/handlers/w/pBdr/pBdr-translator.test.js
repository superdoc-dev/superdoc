import { describe, it, expect } from 'vitest';
import { translator } from './pBdr-translator.js';

describe('w:pBdr translator', () => {
  describe('encode', () => {
    it('should encode a w:pBdr element with all child border properties', () => {
      const xmlNode = {
        name: 'w:pBdr',
        elements: [
          {
            name: 'w:bar',
            attributes: { 'w:val': 'single', 'w:color': 'FF0000', 'w:sz': '8' },
          },
          {
            name: 'w:between',
            attributes: { 'w:val': 'double', 'w:color': '00FF00', 'w:sz': '12' },
          },
          {
            name: 'w:bottom',
            attributes: { 'w:val': 'dashDot', 'w:color': '0000FF', 'w:sz': '16' },
          },
          {
            name: 'w:left',
            attributes: { 'w:val': 'dot', 'w:color': 'FFFF00', 'w:sz': '20' },
          },
          {
            name: 'w:right',
            attributes: { 'w:val': 'dashDotDot', 'w:color': 'FF00FF', 'w:sz': '24' },
          },
          {
            name: 'w:top',
            attributes: { 'w:val': 'triple', 'w:color': '00FFFF', 'w:sz': '28' },
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        bar: { val: 'single', color: '#FF0000', size: 8 },
        between: { val: 'double', color: '#00FF00', size: 12 },
        bottom: { val: 'dashDot', color: '#0000FF', size: 16 },
        left: { val: 'dot', color: '#FFFF00', size: 20 },
        right: { val: 'dashDotDot', color: '#FF00FF', size: 24 },
        top: { val: 'triple', color: '#00FFFF', size: 28 },
      });
    });

    it('should encode a w:pBdr element with partial child border properties', () => {
      const xmlNode = {
        name: 'w:pBdr',
        elements: [
          {
            name: 'w:bottom',
            attributes: { 'w:val': 'single', 'w:color': 'FF0000', 'w:sz': '8' },
          },
          {
            name: 'w:top',
            attributes: { 'w:val': 'double', 'w:color': '0000FF', 'w:sz': '16' },
          },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        bottom: { val: 'single', color: '#FF0000', size: 8 },
        top: { val: 'double', color: '#0000FF', size: 16 },
      });
    });

    it('should return undefined if no child border properties are present', () => {
      const xmlNode = {
        name: 'w:pBdr',
        elements: [],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('should decode a SuperDoc borders object with all properties', () => {
      const superDocNode = {
        attrs: {
          borders: {
            bar: { val: 'single', color: 'FF0000', size: 8 },
            between: { val: 'double', color: '00FF00', size: 12 },
            bottom: { val: 'dashDot', color: '0000FF', size: 16 },
            left: { val: 'dot', color: 'FFFF00', size: 20 },
            right: { val: 'dashDotDot', color: 'FF00FF', size: 24 },
            top: { val: 'triple', color: '00FFFF', size: 28 },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:pBdr',
        type: 'element',
        attributes: {},
        elements: [
          {
            name: 'w:bar',
            attributes: { 'w:val': 'single', 'w:color': 'FF0000', 'w:sz': '8' },
          },
          {
            name: 'w:between',
            attributes: { 'w:val': 'double', 'w:color': '00FF00', 'w:sz': '12' },
          },
          {
            name: 'w:bottom',
            attributes: { 'w:val': 'dashDot', 'w:color': '0000FF', 'w:sz': '16' },
          },
          {
            name: 'w:left',
            attributes: { 'w:val': 'dot', 'w:color': 'FFFF00', 'w:sz': '20' },
          },
          {
            name: 'w:right',
            attributes: { 'w:val': 'dashDotDot', 'w:color': 'FF00FF', 'w:sz': '24' },
          },
          {
            name: 'w:top',
            attributes: { 'w:val': 'triple', 'w:color': '00FFFF', 'w:sz': '28' },
          },
        ],
      });
    });

    it('should decode a SuperDoc borders object with partial properties', () => {
      const superDocNode = {
        attrs: {
          borders: {
            bottom: { val: 'single', color: 'FF0000', size: 8 },
            top: { val: 'double', color: '0000FF', size: 16 },
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        name: 'w:pBdr',
        type: 'element',
        attributes: {},
        elements: [
          {
            name: 'w:bottom',
            attributes: { 'w:val': 'single', 'w:color': 'FF0000', 'w:sz': '8' },
          },
          {
            name: 'w:top',
            attributes: { 'w:val': 'double', 'w:color': '0000FF', 'w:sz': '16' },
          },
        ],
      });
    });

    it('should return undefined if borders is empty', () => {
      const superDocNode = {
        attrs: {
          borders: {},
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });

    it('should return undefined if borders is missing', () => {
      const superDocNode = {
        attrs: {},
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });
  });
});
