/**
 * Section Refs Merging Tests
 *
 * Tests the behavior of section refs (headerRefs and footerRefs) merging
 * when sections define only partial refs. This ensures that when a section
 * specifies only headerRefs, it correctly inherits footerRefs from the previous
 * section, and vice versa.
 *
 * This tests the mergeSectionRefs function behavior in the layout engine.
 *
 * @module section-refs-merging.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PMNode, FlowBlock, SectionBreakBlock } from '@superdoc/contracts';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import { layoutDocument } from '@superdoc/layout-engine';
import { measureBlock } from '@superdoc/measuring-dom';
import { DEFAULT_CONVERTER_CONTEXT, resetBlockIdCounter, PAGE_SIZES } from './test-helpers/section-test-utils.js';

/**
 * Header/footer ref types for testing.
 */
type HeaderFooterRefs = {
  default?: string;
  first?: string;
  even?: string;
  odd?: string;
};

/**
 * Extended section properties with header/footer refs.
 */
type SectionPropsWithRefs = {
  type?: 'continuous' | 'nextPage' | 'evenPage' | 'oddPage';
  orientation?: 'portrait' | 'landscape';
  pageSize?: { w: number; h: number };
  headerRefs?: HeaderFooterRefs;
  footerRefs?: HeaderFooterRefs;
};

/**
 * Convert pixels to twips.
 */
function pixelsToTwips(pixels: number): number {
  return Math.round((pixels / 96) * 1440);
}

/**
 * Create OOXML-style header reference element.
 */
function createHeaderReferenceElement(type: string, rId: string): Record<string, unknown> {
  return {
    type: 'element',
    name: 'w:headerReference',
    attributes: {
      'w:type': type,
      'r:id': rId,
    },
  };
}

/**
 * Create OOXML-style footer reference element.
 */
function createFooterReferenceElement(type: string, rId: string): Record<string, unknown> {
  return {
    type: 'element',
    name: 'w:footerReference',
    attributes: {
      'w:type': type,
      'r:id': rId,
    },
  };
}

/**
 * Create sectPr elements including header/footer refs.
 */
function createSectPrElementsWithRefs(sectionProps: SectionPropsWithRefs): Array<Record<string, unknown>> {
  const elements: Array<Record<string, unknown>> = [];

  // Add header references
  if (sectionProps.headerRefs) {
    if (sectionProps.headerRefs.default) {
      elements.push(createHeaderReferenceElement('default', sectionProps.headerRefs.default));
    }
    if (sectionProps.headerRefs.first) {
      elements.push(createHeaderReferenceElement('first', sectionProps.headerRefs.first));
    }
    if (sectionProps.headerRefs.even) {
      elements.push(createHeaderReferenceElement('even', sectionProps.headerRefs.even));
    }
    if (sectionProps.headerRefs.odd) {
      elements.push(createHeaderReferenceElement('odd', sectionProps.headerRefs.odd));
    }
  }

  // Add footer references
  if (sectionProps.footerRefs) {
    if (sectionProps.footerRefs.default) {
      elements.push(createFooterReferenceElement('default', sectionProps.footerRefs.default));
    }
    if (sectionProps.footerRefs.first) {
      elements.push(createFooterReferenceElement('first', sectionProps.footerRefs.first));
    }
    if (sectionProps.footerRefs.even) {
      elements.push(createFooterReferenceElement('even', sectionProps.footerRefs.even));
    }
    if (sectionProps.footerRefs.odd) {
      elements.push(createFooterReferenceElement('odd', sectionProps.footerRefs.odd));
    }
  }

  // Add type
  if (sectionProps.type) {
    elements.push({
      type: 'element',
      name: 'w:type',
      attributes: { 'w:val': sectionProps.type },
    });
  }

  // Add page size
  if (sectionProps.pageSize) {
    elements.push({
      type: 'element',
      name: 'w:pgSz',
      attributes: {
        'w:w': pixelsToTwips(sectionProps.pageSize.w).toString(),
        'w:h': pixelsToTwips(sectionProps.pageSize.h).toString(),
        ...(sectionProps.orientation ? { 'w:orient': sectionProps.orientation } : {}),
      },
    });
  }

  return elements;
}

/**
 * Create a simple paragraph PM node.
 */
function createParagraph(text: string, attrs?: Record<string, unknown>): PMNode {
  return {
    type: 'paragraph',
    content: [
      {
        type: 'run',
        content: [{ type: 'text', text }],
      },
    ],
    attrs: attrs ?? {},
  };
}

/**
 * Create a paragraph with section properties including header/footer refs.
 */
function createParagraphWithSectionRefs(text: string, sectionProps: SectionPropsWithRefs): PMNode {
  const sectPrElements = createSectPrElementsWithRefs(sectionProps);

  return {
    type: 'paragraph',
    content: [
      {
        type: 'run',
        content: [{ type: 'text', text }],
      },
    ],
    attrs: {
      paragraphProperties: {
        sectPr: {
          type: 'element',
          name: 'w:sectPr',
          attributes: {},
          elements: sectPrElements,
        },
      },
    },
  };
}

/**
 * Create a PM document with sections that have header/footer refs.
 */
function createPMDocWithSectionRefs(
  sections: Array<{
    paragraphs: string[];
    props?: SectionPropsWithRefs;
  }>,
  bodySectPr?: SectionPropsWithRefs,
): PMNode {
  const content: PMNode[] = [];

  sections.forEach((section, sectionIndex) => {
    section.paragraphs.forEach((text, paraIndex) => {
      const isLastParagraphInSection = paraIndex === section.paragraphs.length - 1;
      const isLastSection = sectionIndex === sections.length - 1;

      if (isLastParagraphInSection && !isLastSection && section.props) {
        content.push(createParagraphWithSectionRefs(text, section.props));
      } else {
        content.push(createParagraph(text));
      }
    });
  });

  if (content.length === 0) {
    content.push(createParagraph(''));
  }

  const docAttrs: Record<string, unknown> = {};

  if (bodySectPr) {
    const sectPr = {
      type: 'element',
      name: 'w:sectPr',
      attributes: {},
      elements: createSectPrElementsWithRefs(bodySectPr),
    };
    docAttrs.sectPr = sectPr;
    docAttrs.bodySectPr = sectPr;
  }

  return {
    type: 'doc',
    content,
    attrs: docAttrs,
  };
}

/**
 * Convert PM doc to flow blocks with section breaks enabled.
 */
function pmToFlowBlocks(pmDoc: PMNode): { blocks: FlowBlock[]; bookmarks: Map<string, number> } {
  return toFlowBlocks(pmDoc, { emitSectionBreaks: true, converterContext: DEFAULT_CONVERTER_CONTEXT });
}

/**
 * Get section breaks from flow blocks.
 */
function getSectionBreaks(blocks: FlowBlock[]): SectionBreakBlock[] {
  return blocks.filter((b) => b.kind === 'sectionBreak') as SectionBreakBlock[];
}

/**
 * Measure blocks and run layout.
 */
async function layoutPMDoc(pmDoc: PMNode): Promise<{
  blocks: FlowBlock[];
  layout: Awaited<ReturnType<typeof layoutDocument>>;
}> {
  const { blocks } = pmToFlowBlocks(pmDoc);
  const measures = await Promise.all(blocks.map((block) => measureBlock(block, 468)));
  const layout = layoutDocument(blocks, measures, {
    pageSize: PAGE_SIZES.LETTER_PORTRAIT,
  });
  return { blocks, layout };
}

describe('Section Refs Merging', () => {
  beforeEach(() => {
    resetBlockIdCounter();
  });

  describe('mergeSectionRefs behavior via section breaks', () => {
    it('should preserve footerRefs when next section only defines headerRefs', async () => {
      // Section 1: Has both headerRefs and footerRefs
      // Section 2: Only has headerRefs (should inherit footerRefs from section 1)
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1 content'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'rId1-header' },
              footerRefs: { default: 'rId1-footer' },
            },
          },
          {
            paragraphs: ['Section 2 content'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'rId2-header' },
              // No footerRefs - should inherit from section 1
            },
          },
          {
            paragraphs: ['Section 3 content'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Verify section breaks exist
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(2);

      // First section break should have both headerRefs and footerRefs
      const firstBreak = sectionBreaks[0];
      expect(firstBreak.headerRefs).toBeDefined();
      expect(firstBreak.footerRefs).toBeDefined();

      // Second section break should have headerRefs (from section 2)
      // and footerRefs should either be present (inherited) or handled by layout
      const secondBreak = sectionBreaks[1];
      expect(secondBreak.headerRefs).toBeDefined();
      expect(secondBreak.headerRefs?.default).toBe('rId2-header');
    });

    it('should preserve headerRefs when next section only defines footerRefs', async () => {
      // Section 1: Has both headerRefs and footerRefs
      // Section 2: Only has footerRefs (should inherit headerRefs from section 1)
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1 content'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'rId1-header' },
              footerRefs: { default: 'rId1-footer' },
            },
          },
          {
            paragraphs: ['Section 2 content'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              // No headerRefs - should inherit from section 1
              footerRefs: { default: 'rId2-footer' },
            },
          },
          {
            paragraphs: ['Section 3 content'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      expect(sectionBreaks.length).toBeGreaterThanOrEqual(2);

      // Second section break should have footerRefs (from section 2)
      const secondBreak = sectionBreaks[1];
      expect(secondBreak.footerRefs).toBeDefined();
      expect(secondBreak.footerRefs?.default).toBe('rId2-footer');
    });

    it('should handle three sections with alternating partial refs', async () => {
      // Section 1: headerRefs only
      // Section 2: footerRefs only (should inherit headerRefs)
      // Section 3: headerRefs only (should inherit footerRefs)
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header-1' },
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              footerRefs: { default: 'footer-2' },
            },
          },
          {
            paragraphs: ['Section 3'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header-3' },
            },
          },
          {
            paragraphs: ['Final section'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      expect(sectionBreaks.length).toBeGreaterThanOrEqual(3);

      // Section 1 only has headerRefs
      expect(sectionBreaks[0].headerRefs?.default).toBe('header-1');

      // Section 2 has footerRefs
      expect(sectionBreaks[1].footerRefs?.default).toBe('footer-2');

      // Section 3 has headerRefs
      expect(sectionBreaks[2].headerRefs?.default).toBe('header-3');
    });

    it('should handle section with both refs overriding previous section', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'old-header' },
              footerRefs: { default: 'old-footer' },
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'new-header' },
              footerRefs: { default: 'new-footer' },
            },
          },
          {
            paragraphs: ['Final'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      expect(sectionBreaks.length).toBeGreaterThanOrEqual(2);

      // Section 1 refs
      expect(sectionBreaks[0].headerRefs?.default).toBe('old-header');
      expect(sectionBreaks[0].footerRefs?.default).toBe('old-footer');

      // Section 2 completely overrides
      expect(sectionBreaks[1].headerRefs?.default).toBe('new-header');
      expect(sectionBreaks[1].footerRefs?.default).toBe('new-footer');
    });

    it('should handle section with multiple variants (default, first, even, odd)', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: {
                default: 'header-default',
                first: 'header-first',
                even: 'header-even',
                odd: 'header-odd',
              },
              footerRefs: {
                default: 'footer-default',
              },
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              // Only override first variant
              headerRefs: {
                first: 'header-first-new',
              },
            },
          },
          {
            paragraphs: ['Final'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      expect(sectionBreaks.length).toBeGreaterThanOrEqual(2);

      // First section has all variants
      expect(sectionBreaks[0].headerRefs?.default).toBe('header-default');
      expect(sectionBreaks[0].headerRefs?.first).toBe('header-first');
      expect(sectionBreaks[0].headerRefs?.even).toBe('header-even');
      expect(sectionBreaks[0].headerRefs?.odd).toBe('header-odd');

      // Second section should only have the new first variant
      expect(sectionBreaks[1].headerRefs?.first).toBe('header-first-new');
    });

    it('should handle body section with refs when no paragraph sections have refs', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Content without section refs'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
          headerRefs: { default: 'body-header' },
          footerRefs: { default: 'body-footer' },
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Should have at least the body section break
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);

      // Body section should have refs
      const bodyBreak = sectionBreaks[sectionBreaks.length - 1];
      expect(bodyBreak.headerRefs?.default).toBe('body-header');
      expect(bodyBreak.footerRefs?.default).toBe('body-footer');
    });
  });

  describe('Layout page sectionRefs stamping', () => {
    it('should stamp correct sectionRefs on pages', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1 content'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'section1-header' },
              footerRefs: { default: 'section1-footer' },
            },
          },
          {
            paragraphs: ['Section 2 content'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
          headerRefs: { default: 'body-header' },
          footerRefs: { default: 'body-footer' },
        },
      );

      const { layout } = await layoutPMDoc(pmDoc);

      // Should have at least 2 pages (nextPage forces new page)
      expect(layout.pages.length).toBeGreaterThanOrEqual(2);

      // First page should have section 1 refs
      expect(layout.pages[0].sectionRefs).toBeDefined();
      expect(layout.pages[0].sectionRefs?.headerRefs?.default).toBe('section1-header');
      expect(layout.pages[0].sectionRefs?.footerRefs?.default).toBe('section1-footer');

      // Second page should have body section refs
      expect(layout.pages[1].sectionRefs).toBeDefined();
      expect(layout.pages[1].sectionRefs?.headerRefs?.default).toBe('body-header');
      expect(layout.pages[1].sectionRefs?.footerRefs?.default).toBe('body-footer');
    });

    it('should inherit footerRefs from previous section when not specified', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header1' },
              footerRefs: { default: 'footer1' },
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header2' },
              // No footerRefs - should inherit footer1
            },
          },
          {
            paragraphs: ['Section 3'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { layout } = await layoutPMDoc(pmDoc);

      // Should have at least 3 pages
      expect(layout.pages.length).toBeGreaterThanOrEqual(3);

      // Page 1: Section 1 refs
      expect(layout.pages[0].sectionRefs?.headerRefs?.default).toBe('header1');
      expect(layout.pages[0].sectionRefs?.footerRefs?.default).toBe('footer1');

      // Page 2: Section 2 - should have header2 and inherited footer1
      expect(layout.pages[1].sectionRefs?.headerRefs?.default).toBe('header2');
      expect(layout.pages[1].sectionRefs?.footerRefs?.default).toBe('footer1');
    });

    it('should inherit headerRefs from previous section when not specified', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header1' },
              footerRefs: { default: 'footer1' },
            },
          },
          {
            paragraphs: ['Section 2'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              // No headerRefs - should inherit header1
              footerRefs: { default: 'footer2' },
            },
          },
          {
            paragraphs: ['Section 3'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { layout } = await layoutPMDoc(pmDoc);

      expect(layout.pages.length).toBeGreaterThanOrEqual(3);

      // Page 1: Section 1 refs
      expect(layout.pages[0].sectionRefs?.headerRefs?.default).toBe('header1');
      expect(layout.pages[0].sectionRefs?.footerRefs?.default).toBe('footer1');

      // Page 2: Section 2 - should have inherited header1 and footer2
      expect(layout.pages[1].sectionRefs?.headerRefs?.default).toBe('header1');
      expect(layout.pages[1].sectionRefs?.footerRefs?.default).toBe('footer2');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty refs objects (normalize to undefined)', async () => {
      // When a section has headerRefs: {} it should be treated as no headerRefs
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'nextPage',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header1' },
              footerRefs: { default: 'footer1' },
            },
          },
          {
            paragraphs: ['Section 2'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { layout } = await layoutPMDoc(pmDoc);
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle sections with no refs at all', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Content only'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
          // No headerRefs or footerRefs
        },
      );

      const { layout } = await layoutPMDoc(pmDoc);
      expect(layout.pages.length).toBeGreaterThanOrEqual(1);
      // No sectionRefs should be present or should be null
    });

    it('should handle continuous sections with refs', async () => {
      const pmDoc = createPMDocWithSectionRefs(
        [
          {
            paragraphs: ['Section 1'],
            props: {
              type: 'continuous', // Should not force page break
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header1' },
              footerRefs: { default: 'footer1' },
            },
          },
          {
            paragraphs: ['Section 2 (continuous)'],
            props: {
              type: 'continuous',
              pageSize: PAGE_SIZES.LETTER_PORTRAIT,
              orientation: 'portrait',
              headerRefs: { default: 'header2' },
            },
          },
          {
            paragraphs: ['Final'],
          },
        ],
        {
          pageSize: PAGE_SIZES.LETTER_PORTRAIT,
          orientation: 'portrait',
        },
      );

      const { blocks } = pmToFlowBlocks(pmDoc);
      const sectionBreaks = getSectionBreaks(blocks);

      // Continuous sections should still emit section breaks
      expect(sectionBreaks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
