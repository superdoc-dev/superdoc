vi.mock('../../../../exporter.js', () => {
  const processOutputMarks = vi.fn((marks) => marks || []);
  const generateRunProps = vi.fn((processedMarks) => ({
    name: 'w:rPr',
    elements: [],
  }));
  return { processOutputMarks, generateRunProps };
});

import { describe, it, expect } from 'vitest';
import { translator } from './pPr-translator.js';
import { NodeTranslator } from '@translator';

describe('w:pPr translator', () => {
  describe('config', () => {
    it('should have correct properties', () => {
      expect(translator.xmlName).toBe('w:pPr');
      expect(translator.sdNodeOrKeyName).toBe('paragraphProperties');
      expect(translator).toBeInstanceOf(NodeTranslator);
    });
  });

  describe('encode', () => {
    it('should encode a complex w:pPr element correctly', () => {
      const xmlNode = {
        name: 'w:pPr',
        elements: [
          { name: 'w:adjustRightInd' },
          { name: 'w:autoSpaceDE' },
          { name: 'w:autoSpaceDN' },
          { name: 'w:bidi' },
          { name: 'w:cnfStyle', attributes: { 'w:firstRow': '1' } },
          { name: 'w:contextualSpacing' },
          { name: 'w:divId', attributes: { 'w:val': '123' } },
          {
            name: 'w:framePr',
            attributes: { 'w:h': '100', 'w:wrap': 'around' },
          },
          {
            name: 'w:ind',
            attributes: { 'w:left': '100', 'w:firstLine': '50' },
          },
          { name: 'w:jc', attributes: { 'w:val': 'center' } },
          { name: 'w:keepLines' },
          { name: 'w:keepNext' },
          { name: 'w:kinsoku' },
          { name: 'w:mirrorIndents' },
          {
            name: 'w:numPr',
            elements: [
              { name: 'w:ilvl', attributes: { 'w:val': '0' } },
              { name: 'w:numId', attributes: { 'w:val': '1' } },
            ],
          },
          { name: 'w:outlineLvl', attributes: { 'w:val': '1' } },
          { name: 'w:overflowPunct' },
          {
            name: 'w:pBdr',
            elements: [{ name: 'w:bottom', attributes: { 'w:val': 'single' } }],
          },
          { name: 'w:pStyle', attributes: { 'w:val': 'Heading1' } },
          { name: 'w:pageBreakBefore' },
          { name: 'w:shd', attributes: { 'w:fill': 'FF0000' } },
          { name: 'w:snapToGrid' },
          {
            name: 'w:spacing',
            attributes: { 'w:after': '100', 'w:lineRule': 'auto' },
          },
          { name: 'w:suppressAutoHyphens' },
          { name: 'w:suppressLineNumbers' },
          { name: 'w:suppressOverlap' },
          {
            name: 'w:tabs',
            elements: [{ name: 'w:tab', attributes: { 'w:val': 'left', 'w:pos': '100' } }],
          },
          { name: 'w:textAlignment', attributes: { 'w:val': 'top' } },
          { name: 'w:textDirection', attributes: { 'w:val': 'lrTb' } },
          { name: 'w:textboxTightWrap', attributes: { 'w:val': 'all' } },
          { name: 'w:topLinePunct' },
          { name: 'w:widowControl' },
          { name: 'w:wordWrap' },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        adjustRightInd: true,
        autoSpaceDE: true,
        autoSpaceDN: true,
        rightToLeft: true,
        cnfStyle: { firstRow: true },
        contextualSpacing: true,
        divId: '123',
        framePr: { h: 100, wrap: 'around' },
        indent: { left: 100, firstLine: 50 },
        justification: 'center',
        keepLines: true,
        keepNext: true,
        kinsoku: true,
        mirrorIndents: true,
        numberingProperties: { ilvl: 0, numId: 1 },
        outlineLvl: 1,
        overflowPunct: true,
        borders: { bottom: { val: 'single' } },
        styleId: 'Heading1',
        pageBreakBefore: true,
        shading: { fill: 'FF0000' },
        snapToGrid: true,
        spacing: { after: 100, lineRule: 'auto' },
        suppressAutoHyphens: true,
        suppressLineNumbers: true,
        suppressOverlap: true,
        tabStops: [{ tab: { tabType: 'left', pos: 100 } }],
        textAlignment: 'top',
        textDirection: 'lrTb',
        textboxTightWrap: 'all',
        topLinePunct: true,
        widowControl: true,
        wordWrap: true,
      });
    });

    it('should handle missing and empty elements gracefully', () => {
      const xmlNode = {
        name: 'w:pPr',
        elements: [
          { name: 'w:adjustRightInd', attributes: { 'w:val': '0' } },
          { name: 'w:divId', attributes: {} },
          { name: 'w:numPr', elements: [] },
          { name: 'w:pBdr', elements: [] },
          { name: 'w:tabs', elements: [] },
        ],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toEqual({
        adjustRightInd: false,
        tabStops: [],
      });
    });

    it('should return undefined if no child properties are present', () => {
      const xmlNode = {
        name: 'w:pPr',
        elements: [],
      };

      const result = translator.encode({ nodes: [xmlNode] });

      expect(result).toBeUndefined();
    });
  });

  describe('decode', () => {
    it('should decode a complex paragraphProperties object correctly', () => {
      const superDocNode = {
        attrs: {
          paragraphProperties: {
            adjustRightInd: true,
            autoSpaceDE: true,
            autoSpaceDN: true,
            rightToLeft: true,
            cnfStyle: { firstRow: true },
            contextualSpacing: true,
            divId: '123',
            framePr: { h: 100, wrap: 'around' },
            indent: { left: 100, firstLine: 50 },
            justification: 'center',
            keepLines: true,
            keepNext: true,
            kinsoku: true,
            mirrorIndents: true,
            numberingProperties: { ilvl: 0, numId: 1 },
            outlineLvl: 1,
            overflowPunct: true,
            borders: { bottom: { val: 'single', color: 'FF0000', size: 8 } },
            styleId: 'Heading1',
            pageBreakBefore: true,
            shading: { fill: 'FF0000' },
            snapToGrid: true,
            spacing: { after: 100, lineRule: 'auto' },
            suppressAutoHyphens: true,
            suppressLineNumbers: true,
            suppressOverlap: true,
            tabStops: [],
            textAlignment: 'top',
            textDirection: 'lrTb',
            textboxTightWrap: 'all',
            topLinePunct: true,
            widowControl: true,
            wordWrap: true,
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result.name).toBe('w:pPr');
      expect(result.elements).toEqual(
        expect.arrayContaining([
          { name: 'w:adjustRightInd', attributes: {} },
          { name: 'w:autoSpaceDE', attributes: {} },
          { name: 'w:autoSpaceDN', attributes: {} },
          { name: 'w:bidi', attributes: {} },
          { name: 'w:cnfStyle', attributes: { 'w:firstRow': '1' } },
          { name: 'w:contextualSpacing', attributes: {} },
          { name: 'w:divId', attributes: { 'w:val': '123' } },
          { name: 'w:framePr', attributes: { 'w:h': '100', 'w:wrap': 'around' } },
          { name: 'w:ind', attributes: { 'w:left': '100', 'w:firstLine': '50' } },
          { name: 'w:jc', attributes: { 'w:val': 'center' } },
          { name: 'w:keepLines', attributes: {} },
          { name: 'w:keepNext', attributes: {} },
          { name: 'w:kinsoku', attributes: {} },
          { name: 'w:mirrorIndents', attributes: {} },
          {
            name: 'w:numPr',
            type: 'element',
            attributes: {},
            elements: [
              { name: 'w:ilvl', attributes: { 'w:val': '0' } },
              { name: 'w:numId', attributes: { 'w:val': '1' } },
            ],
          },
          { name: 'w:outlineLvl', attributes: { 'w:val': '1' } },
          { name: 'w:overflowPunct', attributes: {} },
          {
            name: 'w:pBdr',
            type: 'element',
            attributes: {},
            elements: [{ name: 'w:bottom', attributes: { 'w:val': 'single', 'w:color': 'FF0000', 'w:sz': '8' } }],
          },
          { name: 'w:pStyle', attributes: { 'w:val': 'Heading1' } },
          { name: 'w:pageBreakBefore', attributes: {} },
          { name: 'w:shd', attributes: { 'w:fill': 'FF0000' } },
          { name: 'w:snapToGrid', attributes: {} },
          { name: 'w:spacing', attributes: { 'w:after': '100', 'w:lineRule': 'auto' } },
          { name: 'w:suppressAutoHyphens', attributes: {} },
          { name: 'w:suppressLineNumbers', attributes: {} },
          { name: 'w:suppressOverlap', attributes: {} },
          { name: 'w:textAlignment', attributes: { 'w:val': 'top' } },
          { name: 'w:textDirection', attributes: { 'w:val': 'lrTb' } },
          { name: 'w:textboxTightWrap', attributes: { 'w:val': 'all' } },
          { name: 'w:topLinePunct', attributes: {} },
          { name: 'w:widowControl', attributes: {} },
          { name: 'w:wordWrap', attributes: {} },
        ]),
      );
      expect(result.elements.length).toBe(32);
    });

    it('should handle missing and falsy properties gracefully', () => {
      const superDocNode = {
        attrs: {
          paragraphProperties: {
            adjustRightInd: false,
            divId: undefined,
            numberingProperties: {},
            borders: {},
            tabStops: [],
          },
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toEqual({
        attributes: {},
        elements: [
          {
            attributes: {
              'w:val': '0',
            },
            name: 'w:adjustRightInd',
          },
        ],
        name: 'w:pPr',
        type: 'element',
      });
    });

    it('should return undefined if paragraphProperties is empty', () => {
      const superDocNode = {
        attrs: {
          paragraphProperties: {},
        },
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });

    it('should return undefined if paragraphProperties is missing', () => {
      const superDocNode = {
        attrs: {},
      };

      const result = translator.decode({ node: superDocNode });

      expect(result).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('maintains consistency for a complex object', () => {
      const initialParagraphProperties = {
        adjustRightInd: true,
        autoSpaceDE: true,
        autoSpaceDN: true,
        rightToLeft: true,
        cnfStyle: { firstRow: true, lastColumn: false, evenHBand: true },
        divId: '123',
        framePr: { h: 100, wrap: 'around' },
        indent: { left: 100, firstLine: 50 },
        justification: 'center',
        keepLines: true,
        keepNext: true,
        kinsoku: true,
        mirrorIndents: true,
        numberingProperties: { ilvl: 0, numId: 1 },
        outlineLvl: 1,
        overflowPunct: true,
        borders: { bottom: { val: 'single', color: '#FF0000', size: 8 } },
        styleId: 'Heading1',
        pageBreakBefore: true,
        shading: { fill: 'FF0000' },
        snapToGrid: true,
        spacing: { after: 100, lineRule: 'auto' },
        suppressAutoHyphens: true,
        suppressLineNumbers: true,
        suppressOverlap: true,
        tabStops: [{ tab: { tabType: 'left', pos: 100 } }],
        textAlignment: 'top',
        textDirection: 'lrTb',
        textboxTightWrap: 'all',
        topLinePunct: true,
        widowControl: true,
        wordWrap: true,
      };

      const decodedResult = translator.decode({ node: { attrs: { paragraphProperties: initialParagraphProperties } } });
      const encodeParams = { nodes: [decodedResult] };
      const encodedResult = translator.encode(encodeParams);

      // Remove undefined properties from borders for comparison
      const borders = encodedResult.borders;
      if (borders) {
        Object.keys(borders).forEach((borderKey) => {
          Object.keys(borders[borderKey]).forEach((key) => {
            if (borders[borderKey][key] === undefined) {
              delete borders[borderKey][key];
            }
          });
        });
      }

      expect(encodedResult).toEqual(initialParagraphProperties);
    });
  });
});
