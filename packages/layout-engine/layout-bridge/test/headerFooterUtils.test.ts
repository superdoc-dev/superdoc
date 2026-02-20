import { describe, expect, it } from 'vitest';
import type { Layout } from '@superdoc/contracts';
import {
  defaultHeaderFooterIdentifier,
  extractIdentifierFromConverter,
  getHeaderFooterType,
  getHeaderFooterTypeForSection,
  resolveHeaderFooterForPage,
  resolveHeaderFooterForPageAndSection,
  buildMultiSectionIdentifier,
} from '../src/headerFooterUtils';
import type { SectionMetadata } from '@superdoc/contracts';

const makeLayout = (): Layout => ({
  pageSize: { w: 600, h: 800 },
  pages: [
    { number: 1, fragments: [] },
    { number: 2, fragments: [] },
    { number: 3, fragments: [] },
  ],
  headerFooter: {
    default: {
      height: 36,
      pages: [
        { number: 1, fragments: [] },
        { number: 2, fragments: [] },
        { number: 3, fragments: [] },
      ],
    },
    first: {
      height: 40,
      pages: [{ number: 1, fragments: [] }],
    },
    even: {
      height: 32,
      pages: [{ number: 2, fragments: [] }],
    },
    odd: {
      height: 32,
      pages: [{ number: 3, fragments: [] }],
    },
  },
});

describe('headerFooterUtils', () => {
  it('extracts identifiers from SuperConverter metadata', () => {
    const identifier = extractIdentifierFromConverter({
      headerIds: { default: 'rId1', first: 'rId2', even: 'rId3', odd: 'rId4', titlePg: true },
      footerIds: { default: 'rId10' },
      pageStyles: { alternateHeaders: true },
    });

    expect(identifier.headerIds).toMatchObject({
      default: 'rId1',
      first: 'rId2',
      even: 'rId3',
      odd: 'rId4',
    });
    expect(identifier.footerIds.default).toBe('rId10');
    expect(identifier.titlePg).toBe(true);
    expect(identifier.alternateHeaders).toBe(true);
  });

  it('resolves first/even/odd precedence', () => {
    const identifier = extractIdentifierFromConverter({
      headerIds: { default: 'rId1', first: 'rIdFirst', even: 'rIdEven', odd: 'rIdOdd', titlePg: true },
      pageStyles: { alternateHeaders: true },
    });

    expect(getHeaderFooterType(1, identifier)).toBe('first');
    expect(getHeaderFooterType(2, identifier)).toBe('even');
    expect(getHeaderFooterType(3, identifier)).toBe('odd');
  });

  it('falls back to default when alternating slots missing', () => {
    const identifier = extractIdentifierFromConverter({
      headerIds: { default: 'rId1' },
      pageStyles: { alternateHeaders: true },
    });

    expect(getHeaderFooterType(2, identifier)).toBe('default');
    expect(getHeaderFooterType(3, identifier)).toBe('default');
  });

  it('resolves layout/page payloads for a given page', () => {
    const identifier = extractIdentifierFromConverter({
      headerIds: { default: 'rId1', first: 'rIdFirst', titlePg: true },
    });
    const layout = makeLayout();

    const first = resolveHeaderFooterForPage(layout, 0, identifier, { kind: 'header' });
    expect(first?.type).toBe('first');
    expect(first?.page.number).toBe(1);

    const defaultPage = resolveHeaderFooterForPage(layout, 1, identifier, { kind: 'header' });
    expect(defaultPage?.type).toBe('default');
    expect(defaultPage?.page.number).toBe(2);
  });

  it('returns null when identifier is empty', () => {
    const identifier = defaultHeaderFooterIdentifier();
    expect(getHeaderFooterType(1, identifier)).toBeNull();
  });

  it('honors footer identifiers separately from headers', () => {
    const identifier = extractIdentifierFromConverter({
      headerIds: { default: 'header-default' },
      footerIds: { default: 'footer-default', even: 'footer-even' },
      pageStyles: { alternateHeaders: true },
    });

    expect(getHeaderFooterType(1, identifier)).toBe('default');
    expect(getHeaderFooterType(2, identifier, { kind: 'footer' })).toBe('even');
  });

  it('returns null for invalid page numbers', () => {
    const identifier = extractIdentifierFromConverter({ headerIds: { default: 'rId1' } });
    expect(getHeaderFooterType(0, identifier)).toBeNull();
    expect(getHeaderFooterType(-1, identifier)).toBeNull();
  });

  it('returns null when layout has no headerFooter data', () => {
    const identifier = extractIdentifierFromConverter({ headerIds: { default: 'rId1' } });
    const layout: Layout = { pageSize: { w: 600, h: 800 }, pages: [{ number: 1, fragments: [] }] };
    expect(resolveHeaderFooterForPage(layout, 0, identifier)).toBeNull();
  });

  it('resolves first page when alternate headers disabled', () => {
    const identifier = extractIdentifierFromConverter({
      headerIds: { default: 'rId1', first: 'rIdFirst', titlePg: true },
    });

    expect(getHeaderFooterType(1, identifier)).toBe('first');
    expect(getHeaderFooterType(2, identifier)).toBe('default');
  });

  describe('scenario tests', () => {
    it('handles document with first page header only (no default)', () => {
      const identifier = extractIdentifierFromConverter({
        headerIds: { first: 'rIdFirst', titlePg: true },
      });

      // First page should resolve to 'first'
      expect(getHeaderFooterType(1, identifier)).toBe('first');
      // Subsequent pages have no header (returns null)
      expect(getHeaderFooterType(2, identifier)).toBeNull();
      expect(getHeaderFooterType(3, identifier)).toBeNull();
    });

    it('handles document with odd pages only (even pages fall back to default)', () => {
      const identifier = extractIdentifierFromConverter({
        headerIds: { default: 'rIdDefault', odd: 'rIdOdd' },
        pageStyles: { alternateHeaders: true },
      });

      // Odd pages use 'odd' variant
      expect(getHeaderFooterType(1, identifier)).toBe('odd');
      expect(getHeaderFooterType(3, identifier)).toBe('odd');
      expect(getHeaderFooterType(5, identifier)).toBe('odd');
      // Even pages fall back to 'default' (no 'even' variant defined)
      expect(getHeaderFooterType(2, identifier)).toBe('default');
      expect(getHeaderFooterType(4, identifier)).toBe('default');
    });

    it('handles document with all header/footer variants defined', () => {
      const identifier = extractIdentifierFromConverter({
        headerIds: { default: 'hDefault', first: 'hFirst', even: 'hEven', odd: 'hOdd', titlePg: true },
        footerIds: { default: 'fDefault', first: 'fFirst', even: 'fEven', odd: 'fOdd' },
        pageStyles: { alternateHeaders: true },
      });

      // Headers
      expect(getHeaderFooterType(1, identifier, { kind: 'header' })).toBe('first');
      expect(getHeaderFooterType(2, identifier, { kind: 'header' })).toBe('even');
      expect(getHeaderFooterType(3, identifier, { kind: 'header' })).toBe('odd');
      expect(getHeaderFooterType(4, identifier, { kind: 'header' })).toBe('even');

      // Footers
      expect(getHeaderFooterType(1, identifier, { kind: 'footer' })).toBe('first');
      expect(getHeaderFooterType(2, identifier, { kind: 'footer' })).toBe('even');
      expect(getHeaderFooterType(3, identifier, { kind: 'footer' })).toBe('odd');
      expect(getHeaderFooterType(4, identifier, { kind: 'footer' })).toBe('even');
    });

    it('handles document with no headers but footers present', () => {
      const identifier = extractIdentifierFromConverter({
        footerIds: { default: 'fDefault', first: 'fFirst', titlePg: true },
      });

      // No headers defined
      expect(getHeaderFooterType(1, identifier, { kind: 'header' })).toBeNull();
      expect(getHeaderFooterType(2, identifier, { kind: 'header' })).toBeNull();

      // Footers work correctly
      expect(getHeaderFooterType(1, identifier, { kind: 'footer' })).toBe('first');
      expect(getHeaderFooterType(2, identifier, { kind: 'footer' })).toBe('default');
      expect(getHeaderFooterType(3, identifier, { kind: 'footer' })).toBe('default');
    });
  });

  describe('multi-section first-page variants', () => {
    const sectionMetadata: SectionMetadata[] = [
      { sectionIndex: 0, headerRefs: { default: 'h0-default', first: 'h0-first' }, titlePg: true },
      { sectionIndex: 1, headerRefs: { default: 'h1-default', first: 'h1-first' }, titlePg: true },
    ];
    const layout: Layout = {
      pageSize: { w: 600, h: 800 },
      pages: [
        { number: 1, fragments: [], sectionIndex: 0 },
        { number: 2, fragments: [], sectionIndex: 0 },
        { number: 3, fragments: [], sectionIndex: 1 },
        { number: 4, fragments: [], sectionIndex: 1 },
      ],
      headerFooter: {
        default: {
          height: 36,
          pages: [{ number: 1, fragments: [] }],
        },
        first: {
          height: 40,
          pages: [{ number: 1, fragments: [] }],
        },
      },
    };

    it('treats the first page of a later section as a first-page header/footer', () => {
      const identifier = buildMultiSectionIdentifier(sectionMetadata);
      const sectionFirstPageType = getHeaderFooterTypeForSection(3, 1, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      expect(sectionFirstPageType).toBe('first');

      const secondPageType = getHeaderFooterTypeForSection(4, 1, identifier, {
        kind: 'header',
        sectionPageNumber: 2,
      });
      expect(secondPageType).toBe('default');
    });

    it('resolves layout info with section-aware first-page detection', () => {
      const identifier = buildMultiSectionIdentifier(sectionMetadata);
      const resolved = resolveHeaderFooterForPageAndSection(layout, 2, identifier, { kind: 'header' });

      expect(resolved?.sectionIndex).toBe(1);
      expect(resolved?.type).toBe('first');
      expect(resolved?.contentId).toBe('h1-first');
    });
  });

  describe('titlePg behavior (regression test for OOXML compliance)', () => {
    it('should NOT use first header when titlePg is false, even if first header reference exists', () => {
      // This tests the OOXML spec: w:headerReference type="first" defines what header to use IF titlePg is enabled,
      // but the w:titlePg element must be present in sectPr for it to actually be used.
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'h0-default', first: 'h0-first' },
          titlePg: false, // Explicitly false - first page header should NOT be used
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      // First page should use default header, NOT first header
      const firstPageType = getHeaderFooterTypeForSection(1, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      expect(firstPageType).toBe('default');

      // Verify sectionTitlePg is false
      expect(identifier.sectionTitlePg.get(0)).toBe(false);
      expect(identifier.titlePg).toBe(false);
    });

    it('should NOT use first header when titlePg is omitted (undefined)', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'h0-default', first: 'h0-first' },
          // titlePg omitted - should default to false
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      // First page should use default header, NOT first header
      const firstPageType = getHeaderFooterTypeForSection(1, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      expect(firstPageType).toBe('default');
    });

    it('should use first header only when titlePg is explicitly true', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'h0-default', first: 'h0-first' },
          titlePg: true, // Explicitly true - first page header SHOULD be used
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      // First page should use first header
      const firstPageType = getHeaderFooterTypeForSection(1, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      expect(firstPageType).toBe('first');

      // Second page should use default header
      const secondPageType = getHeaderFooterTypeForSection(2, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 2,
      });
      expect(secondPageType).toBe('default');
    });

    it('respects per-section titlePg when earlier sections enable it and later sections disable it', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'h0-default', first: 'h0-first' },
          titlePg: true,
        },
        {
          sectionIndex: 1,
          headerRefs: { default: 'h1-default', first: 'h1-first' },
          titlePg: false,
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      const section0First = getHeaderFooterTypeForSection(1, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      const section1First = getHeaderFooterTypeForSection(3, 1, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });

      expect(section0First).toBe('first');
      expect(section1First).toBe('default');
      expect(identifier.sectionTitlePg.get(0)).toBe(true);
      expect(identifier.sectionTitlePg.get(1)).toBe(false);
    });
  });

  describe('buildMultiSectionIdentifier with converterIds parameter', () => {
    it('should merge converter IDs as fallbacks for null values', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: null, first: null },
          footerRefs: { default: null, even: null },
        },
      ];

      const converterIds = {
        headerIds: { default: 'converter-h-default', first: 'converter-h-first', odd: 'converter-h-odd' },
        footerIds: { default: 'converter-f-default', even: 'converter-f-even' },
      };

      const identifier = buildMultiSectionIdentifier(sectionMetadata, undefined, converterIds);

      // Converter IDs should be used as fallbacks for null values in section metadata
      expect(identifier.headerIds.default).toBe('converter-h-default');
      expect(identifier.headerIds.first).toBe('converter-h-first');
      expect(identifier.headerIds.odd).toBe('converter-h-odd');
      expect(identifier.footerIds.default).toBe('converter-f-default');
      expect(identifier.footerIds.even).toBe('converter-f-even');
    });

    it('should NOT override existing section metadata with converter IDs', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'section-h-default', first: 'section-h-first' },
          footerRefs: { default: 'section-f-default' },
        },
      ];

      const converterIds = {
        headerIds: { default: 'converter-h-default', first: 'converter-h-first', even: 'converter-h-even' },
        footerIds: { default: 'converter-f-default', odd: 'converter-f-odd' },
      };

      const identifier = buildMultiSectionIdentifier(sectionMetadata, undefined, converterIds);

      // Section metadata should take precedence over converter IDs
      expect(identifier.headerIds.default).toBe('section-h-default');
      expect(identifier.headerIds.first).toBe('section-h-first');
      // Converter IDs should only fill in gaps
      expect(identifier.headerIds.even).toBe('converter-h-even');
      expect(identifier.footerIds.default).toBe('section-f-default');
      expect(identifier.footerIds.odd).toBe('converter-f-odd');
    });

    it('should handle missing converterIds parameter gracefully', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'section-h-default' },
          footerRefs: { default: 'section-f-default' },
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata, undefined, undefined);

      // Should work without converterIds
      expect(identifier.headerIds.default).toBe('section-h-default');
      expect(identifier.headerIds.first).toBeNull();
      expect(identifier.footerIds.default).toBe('section-f-default');
      expect(identifier.footerIds.even).toBeNull();
    });

    it('should handle partial converterIds (only headerIds)', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: null },
          footerRefs: { default: null },
        },
      ];

      const converterIds = {
        headerIds: { default: 'converter-h-default', first: 'converter-h-first' },
        // footerIds omitted
      };

      const identifier = buildMultiSectionIdentifier(sectionMetadata, undefined, converterIds);

      // Header IDs should be merged
      expect(identifier.headerIds.default).toBe('converter-h-default');
      expect(identifier.headerIds.first).toBe('converter-h-first');
      // Footer IDs should remain null (no converter fallback)
      expect(identifier.footerIds.default).toBeNull();
      expect(identifier.footerIds.first).toBeNull();
    });

    it('should handle partial converterIds (only footerIds)', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: null },
          footerRefs: { default: null },
        },
      ];

      const converterIds = {
        // headerIds omitted
        footerIds: { default: 'converter-f-default', even: 'converter-f-even' },
      };

      const identifier = buildMultiSectionIdentifier(sectionMetadata, undefined, converterIds);

      // Header IDs should remain null (no converter fallback)
      expect(identifier.headerIds.default).toBeNull();
      expect(identifier.headerIds.first).toBeNull();
      // Footer IDs should be merged
      expect(identifier.footerIds.default).toBe('converter-f-default');
      expect(identifier.footerIds.even).toBe('converter-f-even');
    });

    it('should handle empty converterIds object', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'section-h-default' },
        },
      ];

      const converterIds = {};

      const identifier = buildMultiSectionIdentifier(sectionMetadata, undefined, converterIds);

      // Section metadata should be preserved
      expect(identifier.headerIds.default).toBe('section-h-default');
      expect(identifier.headerIds.first).toBeNull();
      expect(identifier.footerIds.default).toBeNull();
    });

    it('should merge converter IDs with null values in section metadata correctly', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'section-h-default', first: null, even: null, odd: null },
          footerRefs: { default: null, first: null, even: 'section-f-even', odd: null },
        },
      ];

      const converterIds = {
        headerIds: { default: 'conv-h-def', first: 'conv-h-first', even: 'conv-h-even', odd: 'conv-h-odd' },
        footerIds: { default: 'conv-f-def', first: 'conv-f-first', even: 'conv-f-even', odd: 'conv-f-odd' },
      };

      const identifier = buildMultiSectionIdentifier(sectionMetadata, undefined, converterIds);

      // Section metadata takes precedence, converter fills nulls
      expect(identifier.headerIds.default).toBe('section-h-default');
      expect(identifier.headerIds.first).toBe('conv-h-first');
      expect(identifier.headerIds.even).toBe('conv-h-even');
      expect(identifier.headerIds.odd).toBe('conv-h-odd');

      expect(identifier.footerIds.default).toBe('conv-f-def');
      expect(identifier.footerIds.first).toBe('conv-f-first');
      expect(identifier.footerIds.even).toBe('section-f-even');
      expect(identifier.footerIds.odd).toBe('conv-f-odd');
    });
  });

  describe('header/footer inheritance across sections (SD-1370)', () => {
    /**
     * Tests for Word's OOXML inheritance model where sections inherit header/footer
     * definitions from previous sections when not explicitly defined.
     *
     * Scenario: Section 1 has both 'first' and 'default' headers, Section 2 only has
     * 'default' header but titlePg is enabled. Word inherits Section 1's 'first' header
     * for Section 2's first page.
     */

    it('returns "first" variant type when titlePg enabled but no first header defined', () => {
      // Section 2 has titlePg enabled but only defines 'default' header
      // getHeaderFooterTypeForSection should return 'first' so rendering layer
      // can implement inheritance from Section 1
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'rId6', first: 'rId7' },
          titlePg: true,
        },
        {
          sectionIndex: 1,
          headerRefs: { default: 'rId8' }, // No 'first' defined
          titlePg: true, // But titlePg is enabled
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      // Section 1 first page - returns 'first' (has first header)
      const section0FirstPage = getHeaderFooterTypeForSection(1, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      expect(section0FirstPage).toBe('first');

      // Section 2 first page - should return 'first' even though section doesn't have first header
      // This allows rendering layer to implement inheritance from previous section
      const section1FirstPage = getHeaderFooterTypeForSection(3, 1, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      expect(section1FirstPage).toBe('first');

      // Section 2 second page - should return 'default'
      const section1SecondPage = getHeaderFooterTypeForSection(4, 1, identifier, {
        kind: 'header',
        sectionPageNumber: 2,
      });
      expect(section1SecondPage).toBe('default');
    });

    it('returns null when titlePg enabled but no headers exist anywhere', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: {}, // No headers at all
          titlePg: true,
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      const firstPage = getHeaderFooterTypeForSection(1, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      expect(firstPage).toBeNull();
    });

    it('returns "first" when titlePg enabled and only default header exists', () => {
      // Even if only 'default' header exists, return 'first' for first page when titlePg enabled
      // This supports inheritance - previous section might have a 'first' header to inherit
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          headerRefs: { default: 'rId-default-only' }, // Only default, no first
          titlePg: true,
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      const firstPage = getHeaderFooterTypeForSection(1, 0, identifier, {
        kind: 'header',
        sectionPageNumber: 1,
      });
      // Returns 'first' to support inheritance; rendering layer handles the actual rId resolution
      expect(firstPage).toBe('first');
    });

    it('applies same inheritance logic to footers', () => {
      const sectionMetadata: SectionMetadata[] = [
        {
          sectionIndex: 0,
          footerRefs: { default: 'f0-default', first: 'f0-first' },
          titlePg: true,
        },
        {
          sectionIndex: 1,
          footerRefs: { default: 'f1-default' }, // No 'first' footer
          titlePg: true,
        },
      ];

      const identifier = buildMultiSectionIdentifier(sectionMetadata);

      // Section 2 first page - should return 'first' for footers too
      const section1FirstPage = getHeaderFooterTypeForSection(3, 1, identifier, {
        kind: 'footer',
        sectionPageNumber: 1,
      });
      expect(section1FirstPage).toBe('first');
    });
  });
});
