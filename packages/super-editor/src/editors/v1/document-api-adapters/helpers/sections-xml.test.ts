import { describe, expect, it } from 'vitest';
import { readSectPrPageNumbering, writeSectPrPageNumbering, type XmlElement } from './sections-xml.js';

describe('sections XML helpers', () => {
  describe('readSectPrPageNumbering', () => {
    it('should read chapter numbering attributes from pgNumType', () => {
      const sectPr: XmlElement = {
        name: 'w:sectPr',
        elements: [
          {
            name: 'w:pgNumType',
            attributes: {
              'w:start': '2',
              'w:fmt': 'upperRoman',
              'w:chapStyle': '1',
              'w:chapSep': 'colon',
            },
          },
        ],
      };

      expect(readSectPrPageNumbering(sectPr)).toEqual({
        start: 2,
        format: 'upperRoman',
        chapterStyle: 1,
        chapterSeparator: 'colon',
      });
    });

    it('should ignore invalid chapter numbering attributes', () => {
      const sectPr: XmlElement = {
        name: 'w:sectPr',
        elements: [
          {
            name: 'w:pgNumType',
            attributes: {
              'w:chapStyle': '0',
              'w:chapSep': 'slash',
            },
          },
        ],
      };

      expect(readSectPrPageNumbering(sectPr)).toBeUndefined();
    });
  });

  describe('writeSectPrPageNumbering', () => {
    it('should write chapter numbering attributes to pgNumType', () => {
      const sectPr: XmlElement = { name: 'w:sectPr', elements: [] };

      writeSectPrPageNumbering(sectPr, {
        chapterStyle: 2,
        chapterSeparator: 'enDash',
      });

      expect(sectPr.elements).toEqual([
        {
          type: 'element',
          name: 'w:pgNumType',
          attributes: {
            'w:chapStyle': '2',
            'w:chapSep': 'enDash',
          },
          elements: [],
        },
      ]);
    });
  });
});
