import { describe, it, expect } from 'vitest';
import { translator } from './spacing-translator';

describe('Spacing Translator', () => {
  describe('encode', () => {
    it('should encode an XML node with all spacing attributes', () => {
      const xmlNode = {
        name: 'w:spacing',
        attributes: {
          'w:after': '100',
          'w:afterAutospacing': '1',
          'w:afterLines': '150',
          'w:before': '200',
          'w:beforeAutospacing': '0',
          'w:beforeLines': '250',
          'w:line': '300',
          'w:lineRule': 'auto',
        },
      };
      const encodedAttrs = translator.attributes.reduce((acc, attrHandler) => {
        const encoded = attrHandler.encode(xmlNode.attributes);
        if (encoded != null) {
          acc[attrHandler.sdName] = encoded;
        }
        return acc;
      }, {});
      const result = translator.encode({ nodes: [xmlNode] }, encodedAttrs);
      expect(result).toEqual({
        after: 100,
        afterAutospacing: true,
        afterLines: 150,
        before: 200,
        beforeAutospacing: false,
        beforeLines: 250,
        line: 300,
        lineRule: 'auto',
      });
    });

    it('should encode an XML node with partial spacing attributes', () => {
      const xmlNode = {
        name: 'w:spacing',
        attributes: {
          'w:after': '100',
          'w:before': '200',
        },
      };
      const encodedAttrs = translator.attributes.reduce((acc, attrHandler) => {
        const encoded = attrHandler.encode(xmlNode.attributes);
        if (encoded != null) {
          acc[attrHandler.sdName] = encoded;
        }
        return acc;
      }, {});
      const result = translator.encode({ nodes: [xmlNode] }, encodedAttrs);
      expect(result).toEqual({
        after: 100,
        before: 200,
      });
    });

    it('should return an empty object if no spacing attributes are present', () => {
      const xmlNode = {
        name: 'w:spacing',
        attributes: {},
      };
      const encodedAttrs = translator.attributes.reduce((acc, attrHandler) => {
        const encoded = attrHandler.encode(xmlNode.attributes);
        if (encoded != null) {
          acc[attrHandler.sdName] = encoded;
        }
        return acc;
      }, {});
      const result = translator.encode({ nodes: [xmlNode] }, encodedAttrs);
      expect(result).toEqual({});
    });
  });

  describe('decode', () => {
    it('should decode a SuperDoc node with all spacing attributes', () => {
      const superDocNode = {
        attrs: {
          spacing: {
            after: 100,
            afterAutospacing: true,
            afterLines: 150,
            before: 200,
            beforeAutospacing: false,
            beforeLines: 250,
            line: 300,
            lineRule: 'auto',
          },
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toEqual({
        attributes: {
          'w:after': '100',
          'w:afterAutospacing': '1',
          'w:afterLines': '150',
          'w:before': '200',
          'w:beforeAutospacing': '0',
          'w:beforeLines': '250',
          'w:line': '300',
          'w:lineRule': 'auto',
        },
      });
    });

    it('should decode a SuperDoc node with partial spacing attributes', () => {
      const superDocNode = {
        attrs: {
          spacing: {
            after: 100,
            before: 200,
          },
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toEqual({
        attributes: {
          'w:after': '100',
          'w:before': '200',
        },
      });
    });

    it('should return undefined if no spacing attributes are present in SuperDoc node', () => {
      const superDocNode = {
        attrs: {
          // No spacing attribute
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toBeUndefined();
    });

    it('should return undefined if spacing attribute is an empty object', () => {
      const superDocNode = {
        attrs: {
          spacing: {},
        },
      };
      const result = translator.decode({ node: superDocNode });
      expect(result).toBeUndefined();
    });
  });
});
