import { describe, it, expect } from 'vitest';
import { translator } from './ind-translator';

describe('Indentation Translator', () => {
  describe('encode', () => {
    it('should encode an XML node with all indentation attributes', () => {
      const xmlNode = {
        name: 'w:ind',
        attributes: {
          'w:end': '100',
          'w:endChars': '50',
          'w:firstLine': '200',
          'w:firstLineChars': '100',
          'w:hanging': '300',
          'w:hangingChars': '150',
          'w:left': '400',
          'w:leftChars': '200',
          'w:right': '500',
          'w:rightChars': '250',
          'w:start': '600',
          'w:startChars': '300',
        },
      };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({
        end: 100,
        endChars: 50,
        firstLine: 200,
        firstLineChars: 100,
        hanging: 300,
        hangingChars: 150,
        left: 400,
        leftChars: 200,
        right: 500,
        rightChars: 250,
        start: 600,
        startChars: 300,
      });
    });

    it('should encode an XML node with partial indentation attributes', () => {
      const xmlNode = {
        name: 'w:ind',
        attributes: {
          'w:left': '100',
          'w:right': '200',
        },
      };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({
        left: 100,
        right: 200,
      });
    });

    it('should return an empty object if no indentation attributes are present', () => {
      const xmlNode = {
        name: 'w:ind',
        attributes: {},
      };
      const result = translator.encode({ nodes: [xmlNode] });
      expect(result).toEqual({});
    });
  });

  describe('decode', () => {
    it('should decode a SuperDoc node with all indentation attributes', () => {
      const superDocNode = {
        attrs: {
          indent: {
            end: 100,
            endChars: 50,
            firstLine: 200,
            firstLineChars: 100,
            hanging: 300,
            hangingChars: 150,
            left: 400,
            leftChars: 200,
            right: 500,
            rightChars: 250,
            start: 600,
            startChars: 300,
          },
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toEqual({
        attributes: {
          'w:end': '100',
          'w:endChars': '50',
          'w:firstLine': '200',
          'w:firstLineChars': '100',
          'w:hanging': '300',
          'w:hangingChars': '150',
          'w:left': '400',
          'w:leftChars': '200',
          'w:right': '500',
          'w:rightChars': '250',
          'w:start': '600',
          'w:startChars': '300',
        },
      });
    });

    it('should decode a SuperDoc node with partial indentation attributes', () => {
      const superDocNode = {
        attrs: {
          indent: {
            left: 100,
            right: 200,
          },
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toEqual({
        attributes: {
          'w:left': '100',
          'w:right': '200',
        },
      });
    });

    it('should return undefined if no indentation attributes are present in SuperDoc node', () => {
      const superDocNode = {
        attrs: {
          // No indentation attribute
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toBeUndefined();
    });

    it('should return undefined if indentation attribute is an empty object', () => {
      const superDocNode = {
        attrs: {
          indent: {},
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toBeUndefined();
    });
  });
});
