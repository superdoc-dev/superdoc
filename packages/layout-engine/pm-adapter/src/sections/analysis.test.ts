/**
 * Tests for Section Analysis Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldIgnoreSectionBreak,
  findParagraphsWithSectPr,
  buildSectionRangesFromParagraphs,
  publishSectionMetadata,
  createFinalSectionFromBodySectPr,
  createDefaultFinalSection,
  analyzeSectionRanges,
} from './analysis.js';
import type { PMNode, AdapterOptions } from '../types.js';
import type { SectionRange, SectPrElement } from './types.js';
import { SectionType, DEFAULT_PARAGRAPH_SECTION_TYPE, DEFAULT_BODY_SECTION_TYPE } from './types.js';
import * as breaksModule from './breaks.js';
import * as extractionModule from './extraction.js';

// Mock the breaks and extraction modules
vi.mock('./breaks.js', () => ({
  isSectPrElement: vi.fn(),
  hasSectPr: vi.fn(),
  getSectPrFromNode: vi.fn(),
}));

vi.mock('./extraction.js', () => ({
  extractSectionData: vi.fn(),
}));

describe('analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== shouldIgnoreSectionBreak Tests ====================
  describe('shouldIgnoreSectionBreak', () => {
    it('should return true when paragraph has no sectPr', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello' }],
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 1, false);

      expect(result).toBe(true);
    });

    it('should return true when sectPr has no elements and no margins and not last paragraph', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 2, true);

      expect(result).toBe(true);
    });

    it('should return false when sectPr has elements', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [{ type: 'element', name: 'w:pgSz', attributes: { w: '12240', h: '15840' } }],
            },
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 1, false);

      expect(result).toBe(false);
    });

    it('should return false when sectPr has normalized margins (header)', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
          sectionMargins: {
            header: 100,
            footer: null,
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 2, true);

      expect(result).toBe(false);
    });

    it('should return false when sectPr has normalized margins (footer)', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
          sectionMargins: {
            header: null,
            footer: 50,
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 2, true);

      expect(result).toBe(false);
    });

    it('should return false when it is last paragraph break without hasBodySectPr', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 2, 3, false);

      expect(result).toBe(false);
    });

    it('should return true when it is last paragraph break with hasBodySectPr', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 2, 3, true);

      expect(result).toBe(true);
    });

    it('should handle paragraph without attrs', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 1, false);

      expect(result).toBe(true);
    });

    it('should handle paragraph with empty attrs', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {},
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 1, false);

      expect(result).toBe(true);
    });

    it('should handle sectPr with both header and footer margins', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
          sectionMargins: {
            header: 100,
            footer: 50,
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 1, true);

      expect(result).toBe(false);
    });

    it('should return true when margins are both null', () => {
      const paragraph: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
          sectionMargins: {
            header: null,
            footer: null,
          },
        },
      };

      const result = shouldIgnoreSectionBreak(paragraph, 0, 2, true);

      expect(result).toBe(true);
    });
  });

  // ==================== findParagraphsWithSectPr Tests ====================
  describe('findParagraphsWithSectPr', () => {
    beforeEach(() => {
      vi.mocked(breaksModule.hasSectPr).mockReturnValue(false);
    });

    it('should return empty array when document has no content', () => {
      const doc: PMNode = {
        type: 'doc',
      };

      const result = findParagraphsWithSectPr(doc);

      expect(result.paragraphs).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should return empty array when document has no paragraphs', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'heading', level: 1, content: [] }],
      };

      const result = findParagraphsWithSectPr(doc);

      expect(result.paragraphs).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should return empty array when no paragraphs have sectPr', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Para 2' }] },
        ],
      };

      const result = findParagraphsWithSectPr(doc);

      expect(result.paragraphs).toEqual([]);
      expect(result.totalCount).toBe(2);
    });

    it('should find single paragraph with sectPr', () => {
      vi.mocked(breaksModule.hasSectPr).mockReturnValue(false);
      const para1 = { type: 'paragraph', content: [{ type: 'text', text: 'Para 1' }] };
      const para2 = { type: 'paragraph', content: [{ type: 'text', text: 'Para 2' }] };

      vi.mocked(breaksModule.hasSectPr).mockImplementation((node) => node === para2);

      const doc: PMNode = {
        type: 'doc',
        content: [para1, para2],
      };

      const result = findParagraphsWithSectPr(doc);

      expect(result.paragraphs).toHaveLength(1);
      expect(result.paragraphs[0]).toEqual({ index: 1, node: para2 });
      expect(result.totalCount).toBe(2);
    });

    it('should find multiple paragraphs with sectPr', () => {
      const para1 = { type: 'paragraph', content: [{ type: 'text', text: 'Para 1' }] };
      const para2 = { type: 'paragraph', content: [{ type: 'text', text: 'Para 2' }] };
      const para3 = { type: 'paragraph', content: [{ type: 'text', text: 'Para 3' }] };

      vi.mocked(breaksModule.hasSectPr).mockImplementation((node) => node === para1 || node === para3);

      const doc: PMNode = {
        type: 'doc',
        content: [para1, para2, para3],
      };

      const result = findParagraphsWithSectPr(doc);

      expect(result.paragraphs).toHaveLength(2);
      expect(result.paragraphs[0]).toEqual({ index: 0, node: para1 });
      expect(result.paragraphs[1]).toEqual({ index: 2, node: para3 });
      expect(result.totalCount).toBe(3);
    });

    it('should skip non-paragraph nodes', () => {
      const para1 = { type: 'paragraph', content: [] };
      const para2 = { type: 'paragraph', content: [] };

      vi.mocked(breaksModule.hasSectPr).mockImplementation((node) => node === para2);

      const doc: PMNode = {
        type: 'doc',
        content: [para1, { type: 'heading', level: 1, content: [] }, para2, { type: 'blockquote', content: [] }],
      };

      const result = findParagraphsWithSectPr(doc);

      expect(result.paragraphs).toHaveLength(1);
      expect(result.paragraphs[0]).toEqual({ index: 1, node: para2 });
      expect(result.totalCount).toBe(2);
    });

    it('should include paragraphs inside index nodes', () => {
      const para1 = { type: 'paragraph', content: [] };
      const para2 = { type: 'paragraph', content: [] };
      const para3 = { type: 'paragraph', content: [] };

      vi.mocked(breaksModule.hasSectPr).mockImplementation((node) => node === para2);

      const doc: PMNode = {
        type: 'doc',
        content: [para1, { type: 'index', content: [para2, para3] }],
      };

      const result = findParagraphsWithSectPr(doc);

      expect(result.paragraphs).toEqual([{ index: 1, node: para2 }]);
      expect(result.totalCount).toBe(3);
    });
  });

  // ==================== buildSectionRangesFromParagraphs Tests ====================
  describe('buildSectionRangesFromParagraphs', () => {
    beforeEach(() => {
      vi.mocked(extractionModule.extractSectionData).mockReturnValue(null);
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);
      vi.mocked(breaksModule.hasSectPr).mockReturnValue(true);
    });

    it('should return empty array when no paragraphs provided', () => {
      const result = buildSectionRangesFromParagraphs([], false);

      expect(result).toEqual([]);
    });

    it('should skip paragraphs that should be ignored', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [],
            },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      vi.mocked(extractionModule.extractSectionData).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, true);

      expect(result).toEqual([]);
    });

    it('should build single section range', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: {
              type: 'element',
              name: 'w:sectPr',
              elements: [{ type: 'element', name: 'w:pgSz' }],
            },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];
      const sectPr: SectPrElement = { type: 'element', name: 'w:sectPr', elements: [] };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
        headerPx: 100,
        footerPx: 50,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(sectPr);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        sectionIndex: 0,
        startParagraphIndex: 0,
        endParagraphIndex: 0,
        margins: { header: 100, footer: 50 },
        type: SectionType.NEXT_PAGE,
      });
    });

    it('should build multiple section ranges', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };
      const para2: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [
        { index: 2, node: para1 },
        { index: 5, node: para2 },
      ];

      const sectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(sectPr);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        sectionIndex: 0,
        startParagraphIndex: 0,
        endParagraphIndex: 2,
      });
      expect(result[1]).toMatchObject({
        sectionIndex: 1,
        startParagraphIndex: 3,
        endParagraphIndex: 5,
      });
    });

    it('should handle null margins', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result[0].margins).toBeNull();
    });

    it('should extract page margins even without header/footer margins', () => {
      // Regression test: Some documents specify page margins (top/right/bottom/left)
      // without header/footer margins. These should still be extracted.
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      // Mock section data with page margins but no header/footer margins
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.CONTINUOUS,
        titlePg: false,
        // No headerPx or footerPx
        topPx: 85, // ~1300 twips
        bottomPx: 18, // ~280 twips
        leftPx: 85, // ~1275 twips (asymmetric)
        rightPx: 47, // ~708 twips (asymmetric)
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      // Margins should NOT be null - they should contain the page margins
      expect(result[0].margins).not.toBeNull();
      expect(result[0].margins).toEqual({
        header: 0, // Default when not specified
        footer: 0, // Default when not specified
        top: 85,
        bottom: 18,
        left: 85,
        right: 47,
      });
    });

    it('should extract only header margin when specified without footer or page margins', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      // Only header margin specified
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
        headerPx: 72, // Only header specified
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result[0].margins).not.toBeNull();
      expect(result[0].margins).toEqual({
        header: 72,
        footer: 0, // Default when not specified
        top: undefined,
        bottom: undefined,
        left: undefined,
        right: undefined,
      });
    });

    it('should extract only footer margin when specified without header or page margins', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      // Only footer margin specified
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
        footerPx: 36, // Only footer specified
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result[0].margins).not.toBeNull();
      expect(result[0].margins).toEqual({
        header: 0, // Default when not specified
        footer: 36,
        top: undefined,
        bottom: undefined,
        left: undefined,
        right: undefined,
      });
    });

    it('should extract only one page margin when specified (e.g., only topPx)', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      // Only top margin specified
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.CONTINUOUS,
        titlePg: false,
        topPx: 100, // Only top specified
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result[0].margins).not.toBeNull();
      expect(result[0].margins).toEqual({
        header: 0, // Default when not specified
        footer: 0, // Default when not specified
        top: 100,
        bottom: undefined,
        left: undefined,
        right: undefined,
      });
    });

    it('should create margins object with explicit zero values', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      // Explicit zero values for all margins
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
        headerPx: 0,
        footerPx: 0,
        topPx: 0,
        bottomPx: 0,
        leftPx: 0,
        rightPx: 0,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      // Should still create margins object even with all zeros
      expect(result[0].margins).not.toBeNull();
      expect(result[0].margins).toEqual({
        header: 0,
        footer: 0,
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      });
    });

    it('should handle mixed header and page margins', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      // Mix of header/footer and page margins
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
        headerPx: 72,
        footerPx: 36,
        topPx: 144,
        leftPx: 90,
        // No right or bottom specified
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result[0].margins).not.toBeNull();
      expect(result[0].margins).toEqual({
        header: 72,
        footer: 36,
        top: 144,
        bottom: undefined,
        left: 90,
        right: undefined,
      });
    });

    it('should use default section type when not provided', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        titlePg: false,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result[0].type).toBe(DEFAULT_PARAGRAPH_SECTION_TYPE);
    });

    it('should include optional section data', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      const paragraphs = [{ index: 0, node: para1 }];

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.CONTINUOUS,
        titlePg: true,
        headerPx: 100,
        footerPx: 50,
        pageSizePx: { w: 12240, h: 15840 },
        orientation: 'landscape',
        columnsPx: { count: 2, gap: 100 },
        headerRefs: { default: 'header1' },
        footerRefs: { default: 'footer1' },
        numbering: { format: 'decimal', start: 1 },
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const result = buildSectionRangesFromParagraphs(paragraphs, false);

      expect(result[0]).toMatchObject({
        titlePg: true,
        margins: { header: 100, footer: 50 },
        pageSize: { w: 12240, h: 15840 },
        orientation: 'landscape',
        columns: { count: 2, gap: 100 },
        headerRefs: { default: 'header1' },
        footerRefs: { default: 'footer1' },
        numbering: { format: 'decimal', start: 1 },
      });
    });
  });

  // ==================== publishSectionMetadata Tests ====================
  describe('publishSectionMetadata', () => {
    it('should do nothing when options is undefined', () => {
      const ranges: SectionRange[] = [
        {
          sectionIndex: 0,
          startParagraphIndex: 0,
          endParagraphIndex: 1,
          sectPr: null,
          margins: null,
          pageSize: null,
          orientation: null,
          columns: null,
          type: SectionType.NEXT_PAGE,
          titlePg: false,
        },
      ];

      expect(() => publishSectionMetadata(ranges, undefined)).not.toThrow();
    });

    it('should do nothing when sectionMetadata is not provided in options', () => {
      const ranges: SectionRange[] = [];
      const options: AdapterOptions = {};

      expect(() => publishSectionMetadata(ranges, options)).not.toThrow();
    });

    it('should clear existing metadata', () => {
      const ranges: SectionRange[] = [];
      const metadata: Array<Record<string, unknown>> = [{ sectionIndex: 0 }];
      const options: AdapterOptions = { sectionMetadata: metadata };

      publishSectionMetadata(ranges, options);

      expect(metadata).toHaveLength(0);
    });

    it('should publish single section metadata', () => {
      const ranges: SectionRange[] = [
        {
          sectionIndex: 0,
          startParagraphIndex: 0,
          endParagraphIndex: 1,
          sectPr: null,
          margins: null,
          pageSize: null,
          orientation: null,
          columns: null,
          type: SectionType.NEXT_PAGE,
          titlePg: false,
          headerRefs: { default: 'header1' },
          footerRefs: { default: 'footer1' },
          numbering: { format: 'decimal' },
        },
      ];
      const metadata: Array<Record<string, unknown>> = [];
      const options: AdapterOptions = { sectionMetadata: metadata };

      publishSectionMetadata(ranges, options);

      expect(metadata).toHaveLength(1);
      expect(metadata[0]).toEqual({
        sectionIndex: 0,
        headerRefs: { default: 'header1' },
        footerRefs: { default: 'footer1' },
        numbering: { format: 'decimal' },
        titlePg: false,
      });
    });

    it('should publish multiple sections metadata', () => {
      const ranges: SectionRange[] = [
        {
          sectionIndex: 0,
          startParagraphIndex: 0,
          endParagraphIndex: 5,
          sectPr: null,
          margins: null,
          pageSize: null,
          orientation: null,
          columns: null,
          type: SectionType.NEXT_PAGE,
          titlePg: false,
          headerRefs: { default: 'header1' },
        },
        {
          sectionIndex: 1,
          startParagraphIndex: 6,
          endParagraphIndex: 10,
          sectPr: null,
          margins: null,
          pageSize: null,
          orientation: null,
          columns: null,
          type: SectionType.CONTINUOUS,
          titlePg: false,
          footerRefs: { default: 'footer2' },
        },
      ];
      const metadata: Array<Record<string, unknown>> = [];
      const options: AdapterOptions = { sectionMetadata: metadata };

      publishSectionMetadata(ranges, options);

      expect(metadata).toHaveLength(2);
      expect(metadata[0].sectionIndex).toBe(0);
      expect(metadata[1].sectionIndex).toBe(1);
    });
  });

  // ==================== createFinalSectionFromBodySectPr Tests ====================
  describe('createFinalSectionFromBodySectPr', () => {
    beforeEach(() => {
      vi.mocked(extractionModule.extractSectionData).mockReturnValue(null);
    });

    it('should return null when extraction fails', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue(null);

      const result = createFinalSectionFromBodySectPr(bodySectPr, 0, 10, 0);

      expect(result).toBeNull();
    });

    it('should create final section from bodySectPr', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        titlePg: false,
        headerPx: 100,
        footerPx: 50,
      });

      const result = createFinalSectionFromBodySectPr(bodySectPr, 5, 10, 2);

      expect(result).not.toBeNull();
      expect(result!.sectionIndex).toBe(2);
      expect(result!.startParagraphIndex).toBe(5);
      expect(result!.endParagraphIndex).toBe(9);
      expect(result!.type).toBe(DEFAULT_BODY_SECTION_TYPE);
      expect(result!.margins).toEqual({ header: 100, footer: 50 });
    });

    it('should use provided sectionIndex', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        titlePg: false,
      });

      const result = createFinalSectionFromBodySectPr(bodySectPr, 0, 10, 5);

      expect(result!.sectionIndex).toBe(5);
    });

    it('should include extracted section data', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        titlePg: true,
        pageSizePx: { w: 12240, h: 15840 },
        orientation: 'landscape',
        columnsPx: { count: 2, gap: 100 },
        headerRefs: { default: 'header1', first: 'headerFirst' },
        footerRefs: { default: 'footer1' },
        numbering: { format: 'decimal', start: 5 },
      });

      const result = createFinalSectionFromBodySectPr(bodySectPr, 0, 10, 0);

      expect(result!.titlePg).toBe(true);
      expect(result!.pageSize).toEqual({ w: 12240, h: 15840 });
      expect(result!.orientation).toBe('landscape');
      expect(result!.columns).toEqual({ count: 2, gap: 100 });
      expect(result!.headerRefs).toEqual({ default: 'header1', first: 'headerFirst' });
      expect(result!.footerRefs).toEqual({ default: 'footer1' });
      expect(result!.numbering).toEqual({ format: 'decimal', start: 5 });
    });

    it('should respect body section type from extracted data', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        titlePg: false,
        type: SectionType.NEXT_PAGE,
      });

      const result = createFinalSectionFromBodySectPr(bodySectPr, 0, 10, 0);

      expect(result!.type).toBe(SectionType.NEXT_PAGE);
    });

    it('should use default body section type when no type is provided', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        titlePg: false,
        // No type provided
      });

      const result = createFinalSectionFromBodySectPr(bodySectPr, 0, 10, 0);

      expect(result!.type).toBe(DEFAULT_BODY_SECTION_TYPE);
    });
  });

  // ==================== createDefaultFinalSection Tests ====================
  describe('createDefaultFinalSection', () => {
    it('should create default final section', () => {
      const result = createDefaultFinalSection(5, 10, 0);

      expect(result).toMatchObject({
        sectionIndex: 0,
        startParagraphIndex: 5,
        endParagraphIndex: 9,
        sectPr: null,
        margins: null,
        pageSize: null,
        orientation: null,
        columns: null,
        type: DEFAULT_BODY_SECTION_TYPE,
        titlePg: false,
        headerRefs: undefined,
        footerRefs: undefined,
      });
    });

    it('should use provided sectionIndex', () => {
      const result = createDefaultFinalSection(0, 10, 5);

      expect(result.sectionIndex).toBe(5);
    });

    it('should calculate correct paragraph range', () => {
      const result = createDefaultFinalSection(7, 15, 0);

      expect(result.startParagraphIndex).toBe(7);
      expect(result.endParagraphIndex).toBe(14);
    });

    it('should always use CONTINUOUS type', () => {
      const result = createDefaultFinalSection(0, 10, 0);

      expect(result.type).toBe(SectionType.CONTINUOUS);
    });

    it('should have false titlePg', () => {
      const result = createDefaultFinalSection(0, 10, 0);

      expect(result.titlePg).toBe(false);
    });
  });

  // ==================== analyzeSectionRanges Tests ====================
  describe('analyzeSectionRanges', () => {
    beforeEach(() => {
      vi.mocked(breaksModule.isSectPrElement).mockReturnValue(false);
      vi.mocked(breaksModule.hasSectPr).mockReturnValue(false);
      vi.mocked(extractionModule.extractSectionData).mockReturnValue(null);
    });

    it('should return empty array when no paragraphs with sectPr', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
      };

      const result = analyzeSectionRanges(doc);

      expect(result).toEqual([]);
    });

    it('should analyze single section', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      vi.mocked(breaksModule.hasSectPr).mockReturnValue(true);
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const doc: PMNode = {
        type: 'doc',
        content: [para1],
      };

      const result = analyzeSectionRanges(doc);

      expect(result).toHaveLength(2);
      expect(result[0].sectionIndex).toBe(0);
      expect(result[1].type).toBe(DEFAULT_PARAGRAPH_SECTION_TYPE);
      expect(result[1].sectionIndex).toBe(1);
    });

    it('should add body section when bodySectPr is provided', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(breaksModule.isSectPrElement).mockReturnValue(true);
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        titlePg: false,
        // No type provided, should use DEFAULT_BODY_SECTION_TYPE
      });

      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      const result = analyzeSectionRanges(doc, bodySectPr);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(DEFAULT_BODY_SECTION_TYPE);
    });

    it('should not add body section when bodySectPr is not SectPrElement', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      vi.mocked(breaksModule.isSectPrElement).mockReturnValue(false);

      const result = analyzeSectionRanges(doc, 'notASectPr');

      expect(result).toEqual([]);
    });

    it('should handle multiple paragraph sections with body section', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };
      const para2: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      vi.mocked(breaksModule.hasSectPr).mockImplementation((node) => node === para1 || node === para2);

      // Mock different return values for paragraph sections vs body section
      let callCount = 0;
      vi.mocked(extractionModule.extractSectionData).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // For paragraph sections
          return {
            type: SectionType.NEXT_PAGE,
            titlePg: false,
          };
        } else {
          // For body section - no type, should use DEFAULT_BODY_SECTION_TYPE
          return {
            titlePg: false,
          };
        }
      });

      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };
      vi.mocked(breaksModule.isSectPrElement).mockReturnValue(true);

      const doc: PMNode = {
        type: 'doc',
        content: [para1, para2],
      };

      const result = analyzeSectionRanges(doc, bodySectPr);

      expect(result).toHaveLength(3);
      expect(result[2].type).toBe(DEFAULT_BODY_SECTION_TYPE);
    });

    it('should calculate correct start paragraph index for body section', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      vi.mocked(breaksModule.hasSectPr).mockReturnValue(true);
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };
      vi.mocked(breaksModule.isSectPrElement).mockReturnValue(true);

      const doc: PMNode = {
        type: 'doc',
        content: [para1, { type: 'paragraph', content: [] }, { type: 'paragraph', content: [] }],
      };

      const result = analyzeSectionRanges(doc, bodySectPr);

      expect(result).toHaveLength(2);
      expect(result[1].startParagraphIndex).toBe(1);
    });

    it('should not add body section if extraction fails', () => {
      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };

      vi.mocked(breaksModule.isSectPrElement).mockReturnValue(true);
      vi.mocked(extractionModule.extractSectionData).mockReturnValue(null);

      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };

      const result = analyzeSectionRanges(doc, bodySectPr);

      expect(result).toEqual([]);
    });

    it('should clamp body section start index to paragraph count', () => {
      const para1: PMNode = {
        type: 'paragraph',
        attrs: {
          paragraphProperties: {
            sectPr: { type: 'element', name: 'w:sectPr', elements: [{}] },
          },
        },
      };

      vi.mocked(breaksModule.hasSectPr).mockReturnValue(true);
      vi.mocked(extractionModule.extractSectionData).mockReturnValue({
        type: SectionType.NEXT_PAGE,
        titlePg: false,
      });
      vi.mocked(breaksModule.getSectPrFromNode).mockReturnValue(null);

      const bodySectPr: SectPrElement = { type: 'element', name: 'w:sectPr' };
      vi.mocked(breaksModule.isSectPrElement).mockReturnValue(true);

      // Only 1 paragraph but section tries to start at index 2
      const doc: PMNode = {
        type: 'doc',
        content: [para1],
      };

      const result = analyzeSectionRanges(doc, bodySectPr);

      expect(result).toHaveLength(2);
      expect(result[1].startParagraphIndex).toBeLessThanOrEqual(1);
    });
  });
});
