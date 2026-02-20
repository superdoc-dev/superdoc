/**
 * End-to-end integration tests for PM → FlowBlock → Measure pipeline
 *
 * These tests validate that the contracts work correctly across package boundaries
 * and that the full conversion pipeline produces sensible results.
 */

import { describe, it, expect } from 'vitest';
import { toFlowBlocks as baseToFlowBlocks } from './index.js';
import type { PMNode, AdapterOptions } from './index.js';
import { measureBlock } from '@superdoc/measuring-dom';
import { layoutDocument } from '@superdoc/layout-engine';
import { createDomPainter } from '@superdoc/painter-dom';
// Cleaned: remove unused PDF painter import
import type { Measure, ParaFragment, ParagraphMeasure, TabStop } from '@superdoc/contracts';
import basicParagraphFixture from './fixtures/basic-paragraph.json';
import edgeCasesFixture from './fixtures/edge-cases.json';
import twoColumnFixture from './fixtures/two-column-two-page.json';
import tabsDecimalFixture from './fixtures/tabs-decimal.json';
import tabsCenterEndFixture from './fixtures/tabs-center-end.json';
import paragraphPPrVariationsFixture from './fixtures/paragraph_pPr_variations.json';

const DEFAULT_CONVERTER_CONTEXT = {
  docx: {},
  translatedLinkedStyles: {
    docDefaults: {},
    latentStyles: {},
    styles: {},
  },
  translatedNumbering: {
    abstracts: {},
    definitions: {},
  },
};

const toFlowBlocks = (pmDoc: PMNode | object, options: AdapterOptions = {}) =>
  baseToFlowBlocks(pmDoc, { converterContext: DEFAULT_CONVERTER_CONTEXT, ...options });

const expectParagraphMeasure = (measure: Measure): ParagraphMeasure => {
  expect(measure.kind).toBe('paragraph');
  return measure as ParagraphMeasure;
};

describe('PM → FlowBlock → Measure integration', () => {
  it('converts PM JSON to FlowBlocks and measures them', async () => {
    // Step 1: Convert PM JSON to FlowBlocks
    const { blocks } = toFlowBlocks(basicParagraphFixture);

    expect(blocks).toHaveLength(2);

    // Step 2: Measure each block
    const measure1 = expectParagraphMeasure(await measureBlock(blocks[0], 400));
    const measure2 = expectParagraphMeasure(await measureBlock(blocks[1], 400));

    // Validate measure results
    expect(measure1.lines.length).toBeGreaterThan(0);
    expect(measure1.totalHeight).toBeGreaterThan(0);
    expect(measure2.lines.length).toBeGreaterThan(0);
    expect(measure2.totalHeight).toBeGreaterThan(0);

    // Each line should reference valid run indices
    measure1.lines.forEach((line) => {
      expect(line.fromRun).toBeGreaterThanOrEqual(0);
      expect(line.fromRun).toBeLessThan(blocks[0].runs.length);
      expect(line.toRun).toBeGreaterThanOrEqual(line.fromRun);
      expect(line.toRun).toBeLessThan(blocks[0].runs.length);
    });
  });

  it('handles edge cases correctly through the full pipeline', async () => {
    const { blocks } = toFlowBlocks(edgeCasesFixture);

    expect(blocks).toHaveLength(3);

    // Measure each block
    const paragraphMeasures = await Promise.all(
      blocks.map((block) => measureBlock(block, 300).then((result) => expectParagraphMeasure(result))),
    );

    // All measures should be valid
    paragraphMeasures.forEach((measure, index) => {
      expect(measure.lines.length).toBeGreaterThan(0);
      expect(measure.totalHeight).toBeGreaterThan(0);

      // Empty paragraph (index 1) should have valid empty line
      if (index === 1) {
        expect(measure.lines[0].width).toBeGreaterThanOrEqual(0);
        expect(measure.lines[0].fromRun).toBe(0);
        expect(measure.lines[0].toRun).toBe(0);
      }
    });
  });

  it('produces consistent block IDs through the pipeline', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph' }],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);

    const firstId = Number(blocks[0].id.split('-')[0]);
    const secondId = Number(blocks[1].id.split('-')[0]);
    expect(blocks[0].id.endsWith('-paragraph')).toBe(true);
    expect(blocks[1].id.endsWith('-paragraph')).toBe(true);
    expect(secondId).toBeGreaterThan(firstId);

    // Measure blocks - IDs should still be accessible
    const measure1 = expectParagraphMeasure(await measureBlock(blocks[0], 200));
    const measure2 = expectParagraphMeasure(await measureBlock(blocks[1], 200));

    expect(measure1.lines.length).toBeGreaterThan(0);
    expect(measure2.lines.length).toBeGreaterThan(0);
  });

  it('handles styled text correctly through the pipeline', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Plain ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
            { type: 'text', text: ' and ' },
            { type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
          ],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);
    const measure = expectParagraphMeasure(await measureBlock(blocks[0], 300));

    // Should have at least one line
    expect(measure.lines.length).toBeGreaterThan(0);

    // First line should span multiple runs with different styling
    const firstLine = measure.lines[0];
    expect(firstLine.fromRun).toBe(0);

    // Width should account for all styled runs
    expect(firstLine.width).toBeGreaterThan(0);
  });

  it('handles narrow widths causing line breaks', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This is a very long paragraph that will definitely need to break into multiple lines when given a narrow width constraint',
            },
          ],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);
    const narrowMeasure = expectParagraphMeasure(await measureBlock(blocks[0], 150));
    const wideMeasure = expectParagraphMeasure(await measureBlock(blocks[0], 600));

    // Narrow width should produce more lines
    expect(narrowMeasure.lines.length).toBeGreaterThan(wideMeasure.lines.length);

    // Total height should scale with number of lines
    expect(narrowMeasure.totalHeight).toBeGreaterThan(wideMeasure.totalHeight);
  });

  it('emits final section from bodySectPr with landscape orientation', () => {
    // Build a minimal PM doc with three paragraph-level sectPrs and a body-level sectPr (landscape)
    const makeSectPr = (attrs: Record<string, unknown>) => ({
      type: 'element',
      name: 'w:sectPr',
      elements: [
        attrs.pgSz && { name: 'w:pgSz', attributes: attrs.pgSz },
        attrs.pgMar && { name: 'w:pgMar', attributes: attrs.pgMar },
        attrs.cols && { name: 'w:cols', attributes: attrs.cols },
        attrs.type && { name: 'w:type', attributes: { 'w:val': attrs.type } },
      ].filter(Boolean),
    });

    const portraitPgSz = { 'w:w': '12240', 'w:h': '15840' };
    const landscapePgSz = { 'w:w': '15840', 'w:h': '12240', 'w:orient': 'landscape' };
    const pgMar = { 'w:header': '720', 'w:footer': '720' };

    const para = (withSectPr?: unknown): PMNode => ({
      type: 'paragraph',
      attrs: withSectPr ? { paragraphProperties: { sectPr: withSectPr } } : {},
      content: [{ type: 'text', text: 'x' }],
    });

    const sect1 = makeSectPr({ pgSz: portraitPgSz, pgMar });
    const sect2 = makeSectPr({ pgSz: portraitPgSz, pgMar, cols: { 'w:num': '2', 'w:space': '720' } });
    const sect3 = makeSectPr({ pgSz: portraitPgSz, pgMar });
    const bodySect = makeSectPr({ pgSz: landscapePgSz, pgMar });

    const pmDoc: PMNode = {
      type: 'doc',
      attrs: { bodySectPr: bodySect },
      content: [
        para(), // section 1 content
        para(sect1),
        para(), // section 2 content
        para(sect2),
        para(), // section 3 content
        para(sect3),
      ],
    } as never;

    const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
    const breaks = blocks.filter((b: PMNode) => b.kind === 'sectionBreak');
    // Expect: initial break + two interior transitions + final body section
    expect(breaks.length).toBe(4);

    const last = breaks[breaks.length - 1] as never;
    expect(last.type).toBe('nextPage');
    expect(last.orientation).toBe('landscape');
    expect(last.pageSize).toBeDefined();
    expect(Math.round(last.pageSize.w)).toBe(1056); // Landscape width (legal @ 96dpi)
    expect(Math.round(last.pageSize.h)).toBe(816);
  });

  it('preserves typography metrics through the pipeline', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Test paragraph',
            },
          ],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc, {
      defaultFont: 'Arial',
      defaultSize: 20,
    });

    const measure = expectParagraphMeasure(await measureBlock(blocks[0], 400));

    // Typography metrics should be reasonable for 20px font size
    // Note: Exact values depend on font rendering (canvas vs fallback), so we check ranges
    expect(measure.lines[0].ascent).toBeGreaterThan(10); // ~50-80% of font size
    expect(measure.lines[0].ascent).toBeLessThan(20);
    expect(measure.lines[0].descent).toBeGreaterThan(2); // ~10-25% of font size
    expect(measure.lines[0].descent).toBeLessThan(6);
    // Line height should be within a reasonable range for the resolved font size
    expect(measure.lines[0].lineHeight).toBeGreaterThanOrEqual(14);
    expect(measure.totalHeight).toBeGreaterThanOrEqual(14);
  });

  it('propagates tab stops and decimal separators through measurement', async () => {
    const { blocks } = toFlowBlocks(tabsDecimalFixture as PMNode, {
      locale: { decimalSeparator: ',' },
    });

    expect(blocks[0].attrs?.tabs?.[0]).toMatchObject({ val: 'decimal', leader: 'dot' });
    expect(blocks[1].attrs?.tabs?.[0]).toMatchObject({ val: 'end', leader: 'dot' });

    const controlDoc = JSON.parse(JSON.stringify(tabsDecimalFixture)) as PMNode;
    const controlParagraph = controlDoc.content?.[0];
    const tabStops = controlParagraph?.attrs?.paragraphProperties?.tabStops;
    if (Array.isArray(tabStops)) {
      controlParagraph.attrs.paragraphProperties.tabStops = tabStops.map((tab: TabStop) => ({
        ...tab,
        align: 'left',
      }));
    }

    const { blocks: controlBlocks } = toFlowBlocks(controlDoc, {
      locale: { decimalSeparator: ',' },
    });

    const decimalMeasure = expectParagraphMeasure(await measureBlock(blocks[0], 400));
    const controlMeasure = expectParagraphMeasure(await measureBlock(controlBlocks[0], 400));

    expect(decimalMeasure.lines[0].width).toBeLessThanOrEqual(controlMeasure.lines[0].width);
  });

  it('derives default decimal separator from document language when not explicitly set', async () => {
    const pmDoc: PMNode = {
      type: 'doc',
      attrs: { lang: 'de-DE' },
      content: [
        {
          type: 'paragraph',
          attrs: { paragraphProperties: { tabStops: [{ pos: 96, align: 'decimal' }] } },
          content: [
            { type: 'text', text: 'Preis:' },
            { type: 'text', text: '\t12,34' },
          ],
        },
      ],
    } as unknown as PMNode;

    const { blocks } = toFlowBlocks(pmDoc);
    const decimalMeasure = expectParagraphMeasure(await measureBlock(blocks[0], 400));

    const leftDoc: PMNode = JSON.parse(JSON.stringify(pmDoc)) as PMNode;
    (leftDoc.content?.[0]?.attrs as never).paragraphProperties = { tabStops: [{ pos: 96, align: 'left' }] };
    const { blocks: leftBlocks } = toFlowBlocks(leftDoc);
    const leftMeasure = expectParagraphMeasure(await measureBlock(leftBlocks[0], 400));

    expect(decimalMeasure.lines[0].width).toBeLessThanOrEqual(leftMeasure.lines[0].width);
  });

  it('uses default tab interval from document settings when explicit tabs are absent', async () => {
    const baseDoc: PMNode = {
      type: 'doc',
      attrs: { lang: 'en-US', defaultTabIntervalTwips: 720 }, // 0.5"
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A' },
            { type: 'text', text: '\t' },
            { type: 'text', text: 'B' },
          ],
        },
      ],
    } as unknown as PMNode;

    const wideDoc: PMNode = JSON.parse(JSON.stringify(baseDoc)) as PMNode;
    (wideDoc.attrs as never).defaultTabIntervalTwips = 1440; // 1.0"

    const { blocks: baseBlocks } = toFlowBlocks(baseDoc);
    const { blocks: wideBlocks } = toFlowBlocks(wideDoc);

    const baseMeasure = expectParagraphMeasure(await measureBlock(baseBlocks[0], 400));
    const wideMeasure = expectParagraphMeasure(await measureBlock(wideBlocks[0], 400));

    // Larger default interval should advance further → wider line
    expect(wideMeasure.lines[0].width).toBeGreaterThanOrEqual(baseMeasure.lines[0].width);
  });

  it('handles center tab alignment through PM → FlowBlock → Measure pipeline', async () => {
    const { blocks } = toFlowBlocks(tabsCenterEndFixture as PMNode);

    // First paragraph has center tab at 96px
    expect(blocks[0].attrs?.tabs?.[0]).toMatchObject({ val: 'center', pos: 1440 }); // 96px = 1440 twips

    const centerMeasure = expectParagraphMeasure(await measureBlock(blocks[0], 400));

    // Create control with left alignment
    const controlDoc = JSON.parse(JSON.stringify(tabsCenterEndFixture)) as PMNode;
    const controlParagraph = controlDoc.content?.[0];
    if (controlParagraph?.attrs?.tabs) {
      controlParagraph.attrs.tabs = [{ pos: 96, align: 'left', leader: 'none' }];
    }

    const { blocks: controlBlocks } = toFlowBlocks(controlDoc);
    const controlMeasure = expectParagraphMeasure(await measureBlock(controlBlocks[0], 400));

    // Center alignment should produce different positioning than left
    expect(centerMeasure.lines[0].segments).toBeDefined();
    expect(centerMeasure.lines[0].segments.length).toBeGreaterThan(0);

    // The centered text should not exceed the control width
    expect(centerMeasure.lines[0].width).toBeLessThanOrEqual(controlMeasure.lines[0].width);
  });

  it('handles end (right) tab alignment through PM → FlowBlock → Measure pipeline', async () => {
    const { blocks } = toFlowBlocks(tabsCenterEndFixture as PMNode);

    // Second paragraph has end tab at 120px (mapped from "right" to "end")
    expect(blocks[1].attrs?.tabs?.[0]).toMatchObject({ val: 'end', pos: 1800 }); // 120px = 1800 twips

    const endMeasure = expectParagraphMeasure(await measureBlock(blocks[1], 400));

    // Create control with left alignment
    const controlDoc = JSON.parse(JSON.stringify(tabsCenterEndFixture)) as PMNode;
    const controlParagraph = controlDoc.content?.[1];
    if (controlParagraph?.attrs?.tabs) {
      controlParagraph.attrs.tabs = [{ pos: 120, align: 'left', leader: 'none' }];
    }

    const { blocks: controlBlocks } = toFlowBlocks(controlDoc);
    const controlMeasure = expectParagraphMeasure(await measureBlock(controlBlocks[1], 400));

    // End alignment should produce different positioning than left
    expect(endMeasure.lines[0].segments).toBeDefined();
    expect(endMeasure.lines[0].segments.length).toBeGreaterThan(0);

    // The end-aligned text should not exceed the control width
    expect(endMeasure.lines[0].width).toBeLessThanOrEqual(controlMeasure.lines[0].width);
  });

  it('handles mixed tab alignments (left/center/end) on same line', async () => {
    const { blocks } = toFlowBlocks(tabsCenterEndFixture as PMNode);

    // Third paragraph has three tabs: left, center, end
    expect(blocks[2].attrs?.tabs).toHaveLength(3);
    expect(blocks[2].attrs?.tabs?.[0]).toMatchObject({ val: 'start', pos: 900 }); // 60px
    expect(blocks[2].attrs?.tabs?.[1]).toMatchObject({ val: 'center', pos: 1800 }); // 120px
    expect(blocks[2].attrs?.tabs?.[2]).toMatchObject({ val: 'end', pos: 2700 }); // 180px

    const measure = expectParagraphMeasure(await measureBlock(blocks[2], 400));

    // Should have segments for each tab-separated section
    expect(measure.lines[0].segments).toBeDefined();
    expect(measure.lines[0].segments.length).toBeGreaterThan(0);
    expect(measure.lines[0].width).toBeGreaterThan(0);

    // Verify segments exist for tab-separated text
    const segments = measure.lines[0].segments;
    expect(segments.length).toBeGreaterThan(0);

    // Verify that tab stops were processed correctly
    // (actual x positions are computed during measurement based on text width)
    expect(measure.lines[0].width).toBeGreaterThan(0);
  });

  it('validates contract types are compatible', async () => {
    // This test ensures type safety across package boundaries
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Type safety test',
            },
          ],
        },
      ],
    };

    // toFlowBlocks should return FlowBlock[]
    const { blocks } = toFlowBlocks(pmDoc);

    // measureBlock should accept FlowBlock and return Measure
    const measure = expectParagraphMeasure(await measureBlock(blocks[0], 300));

    // Type guards to ensure contract compliance
    expect(blocks[0]).toHaveProperty('id');
    expect(blocks[0]).toHaveProperty('runs');
    expect(blocks[0]).toHaveProperty('attrs');

    expect(measure).toHaveProperty('lines');
    expect(measure).toHaveProperty('totalHeight');

    expect(Array.isArray(measure.lines)).toBe(true);
    expect(typeof measure.totalHeight).toBe('number');

    if (measure.lines.length > 0) {
      expect(measure.lines[0]).toHaveProperty('fromRun');
      expect(measure.lines[0]).toHaveProperty('fromChar');
      expect(measure.lines[0]).toHaveProperty('toRun');
      expect(measure.lines[0]).toHaveProperty('toChar');
      expect(measure.lines[0]).toHaveProperty('width');
      expect(measure.lines[0]).toHaveProperty('ascent');
      expect(measure.lines[0]).toHaveProperty('descent');
      expect(measure.lines[0]).toHaveProperty('lineHeight');
    }
  });

  it('renders PM → Layout → DOM end to end', async () => {
    const { blocks } = toFlowBlocks(basicParagraphFixture);
    const contentWidth = LETTER.pageSize.w - LETTER.margins.left - LETTER.margins.right;
    const measures = await Promise.all(
      blocks.map((block) => measureBlock(block, contentWidth).then((result) => expectParagraphMeasure(result))),
    );

    const layout = layoutDocument(blocks, measures, LETTER);

    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    expect(mount.children.length).toBeGreaterThan(0);
    expect(mount.textContent).toContain('This is a simple paragraph');

    document.body.removeChild(mount);
  });

  it('handles a two-column layout end to end', async () => {
    const { blocks } = toFlowBlocks(twoColumnFixture);
    expect(blocks.length).toBeGreaterThan(0);

    const pageSize = { w: 612, h: 792 };
    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const contentWidth = pageSize.w - (margins.left + margins.right);
    const columns = { count: 2, gap: 48 };
    const columnWidth = (contentWidth - columns.gap) / columns.count;

    const measures = await Promise.all(blocks.map((block) => measureBlock(block, columnWidth)));

    const layout = layoutDocument(blocks, measures, {
      pageSize,
      margins,
      columns,
    });

    expect(layout.columns).toMatchObject({ count: 2, gap: columns.gap });
    const firstPage = layout.pages[0];
    const xPositions = new Set(firstPage.fragments.map((fragment) => fragment.x));
    expect(xPositions.size).toBeGreaterThan(1);
  });

  it('renders paragraph shading backgrounds end to end', async () => {
    const fixture = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              shading: {
                fill: 'AABBCC',
              },
            },
          },
          content: [{ type: 'text', text: 'Shaded text' }],
        },
      ],
    };

    const { blocks, measures, layout } = await buildLayoutFromFixture(fixture);
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    const fragment = mount.querySelector('.superdoc-fragment') as HTMLElement;
    const shadingLayer = fragment.querySelector('.superdoc-paragraph-shading') as HTMLElement;
    expect(shadingLayer).toBeTruthy();
    // Accept both rgb and hex formats (jsdom uses rgb, happy-dom uses hex)
    const bgColor = shadingLayer.style.backgroundColor.toLowerCase();
    expect(bgColor === 'rgb(170, 187, 204)' || bgColor === '#aabbcc').toBe(true);

    document.body.removeChild(mount);
  });
});

const LETTER = {
  pageSize: { w: 612, h: 792 },
  margins: { top: 72, right: 72, bottom: 72, left: 72 },
};

const buildLayoutFromFixture = async (pmFixture: object) => {
  const { blocks } = toFlowBlocks(pmFixture);
  const contentWidth = LETTER.pageSize.w - (LETTER.margins.left + LETTER.margins.right);
  const measures = await Promise.all(blocks.map((block) => measureBlock(block, contentWidth)));
  const layout = layoutDocument(blocks, measures, LETTER);
  return { blocks, measures, layout };
};

describe('page break integration tests', () => {
  it('creates multiple pages from hardBreak nodes', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Content on page 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Content on page 2' }],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);
    const contentWidth = LETTER.pageSize.w - (LETTER.margins.left + LETTER.margins.right);
    const measures = await Promise.all(blocks.map((block) => measureBlock(block, contentWidth)));
    const layout = layoutDocument(blocks, measures, LETTER);

    // Should create at least 2 pages due to the page break
    expect(layout.pages.length).toBeGreaterThanOrEqual(2);

    // Verify pageBreak measure exists
    const pageBreakMeasures = measures.filter((m) => m.kind === 'pageBreak');
    expect(pageBreakMeasures.length).toBe(1);
  });

  it('handles multiple page breaks in layout', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Page 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Page 2' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Page 3' }],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);
    const contentWidth = LETTER.pageSize.w - (LETTER.margins.left + LETTER.margins.right);
    const measures = await Promise.all(blocks.map((block) => measureBlock(block, contentWidth)));
    const layout = layoutDocument(blocks, measures, LETTER);

    // Should create at least 3 pages
    expect(layout.pages.length).toBeGreaterThanOrEqual(3);

    // Verify 2 pageBreak measures exist
    const pageBreakMeasures = measures.filter((m) => m.kind === 'pageBreak');
    expect(pageBreakMeasures.length).toBe(2);
  });

  it('properly distributes content across pages with page breaks', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph on page 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second paragraph on page 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph on page 2' }],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);
    const contentWidth = LETTER.pageSize.w - (LETTER.margins.left + LETTER.margins.right);
    const measures = await Promise.all(blocks.map((block) => measureBlock(block, contentWidth)));
    const layout = layoutDocument(blocks, measures, LETTER);

    expect(layout.pages.length).toBeGreaterThanOrEqual(2);

    // First page should have fragments before the break
    expect(layout.pages[0].fragments.length).toBeGreaterThan(0);

    // Second page should have fragments after the break
    if (layout.pages.length >= 2) {
      expect(layout.pages[1].fragments.length).toBeGreaterThan(0);
    }
  });

  it('handles page breaks with images', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Text before image' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: {
                src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                width: 100,
                height: 100,
              },
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Text after page break' }],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);
    const contentWidth = LETTER.pageSize.w - (LETTER.margins.left + LETTER.margins.right);
    const measures = await Promise.all(blocks.map((block) => measureBlock(block, contentWidth)));
    const layout = layoutDocument(blocks, measures, LETTER);

    expect(layout.pages.length).toBeGreaterThanOrEqual(2);

    // Verify we have both image and pageBreak blocks
    const imageBlocks = blocks.filter((b) => b.kind === 'image');
    const pageBreakBlocks = blocks.filter((b) => b.kind === 'pageBreak');
    expect(imageBlocks.length).toBe(1);
    expect(pageBreakBlocks.length).toBe(1);
  });

  it('renders page breaks to DOM correctly', async () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Page 1 content' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hardBreak', attrs: { pageBreakType: 'page' } }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Page 2 content' }],
        },
      ],
    };

    const { blocks } = toFlowBlocks(pmDoc);
    const contentWidth = LETTER.pageSize.w - (LETTER.margins.left + LETTER.margins.right);
    const measures = await Promise.all(blocks.map((block) => measureBlock(block, contentWidth)));
    const layout = layoutDocument(blocks, measures, LETTER);

    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const painter = createDomPainter({ blocks, measures });
    painter.paint(layout, mount);

    // Verify multiple pages were created in DOM
    const pages = mount.querySelectorAll('.superdoc-page');
    expect(pages.length).toBeGreaterThanOrEqual(2);

    document.body.removeChild(mount);
  });

  it('end-to-end test: right-aligned page numbers with floatAlignment (mimics basic-page-nums.docx footer)', async () => {
    // This test simulates the basic-page-nums.docx footer structure
    // where a page number with framePr/@w:xAlign="right" should be right-aligned
    const pmDoc: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {
            paragraphProperties: {
              styleId: 'Footer',
              framePr: {
                wrap: 'none',
                vAnchor: 'text',
                hAnchor: 'margin',
                xAlign: 'right',
                // Note: framePr.y omitted because it applies vertical offset to positioned frames.
              },
            },
          },
          content: [
            {
              type: 'page-number',
              attrs: {},
            },
          ],
        },
      ],
    };

    // Step 1: Convert PM to FlowBlocks
    const { blocks } = toFlowBlocks(pmDoc);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('paragraph');
    expect(blocks[0].runs).toHaveLength(1);
    expect(blocks[0].runs[0].token).toBe('pageNumber');
    expect(blocks[0].attrs?.floatAlignment).toBe('right');

    // Step 2: Measure blocks
    const footerWidth = 816; // Standard US Letter width in px
    const measures = await Promise.all(blocks.map((block) => measureBlock(block, footerWidth)));

    const measure = expectParagraphMeasure(measures[0]);
    expect(measure.lines).toHaveLength(1);
    const lineWidth = measure.lines[0].width;

    // Step 3: Layout (simulate footer layout with no margins)
    const layout = layoutDocument(blocks, measures, {
      pageSize: { w: 816, h: 1056 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    expect(layout.pages).toHaveLength(1);
    const fragment = layout.pages[0].fragments[0] as ParaFragment;

    // Step 4: Verify right-alignment positioning
    // Expected X = 0 + (816 - lineWidth) for right-alignment
    const expectedX = footerWidth - lineWidth;
    expect(fragment.x).toBeCloseTo(expectedX, 0);
    expect(fragment.y).toBe(0);

    // Verify that without floatAlignment, it would be at x=0 (left margin)
    const blocksWithoutFloat = [{ ...blocks[0], attrs: undefined }];
    const layoutWithoutFloat = layoutDocument(blocksWithoutFloat, measures, {
      pageSize: { w: 816, h: 1056 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const fragmentWithoutFloat = layoutWithoutFloat.pages[0].fragments[0] as ParaFragment;
    expect(fragmentWithoutFloat.x).toBe(0);
  });

  it('ensures DOCX pageBreakBefore paragraphs start on a new page', async () => {
    const fixture = JSON.parse(JSON.stringify(paragraphPPrVariationsFixture)) as PMNode;
    fixture.content?.forEach((node) => {
      if (node?.type !== 'paragraph') return;
      const runs = (node.content ?? []).flatMap((child: PMNode) => (child.content ? child.content : [child]));
      const hasTargetText = runs.some(
        (run: PMNode) => typeof run.text === 'string' && run.text.includes('pageBreakBefore'),
      );
      if (hasTargetText) {
        node.attrs = {
          ...(node.attrs ?? {}),
          paragraphProperties: { pageBreakBefore: true },
        };
      }
    });
    const { blocks, layout } = await buildLayoutFromFixture(fixture);

    const targetParagraphIndex = blocks.findIndex(
      (block) =>
        block.kind === 'paragraph' &&
        (block as never).runs?.some(
          (run: PMNode) => typeof run.text === 'string' && run.text.includes('pageBreakBefore'),
        ),
    );
    expect(targetParagraphIndex).toBeGreaterThan(0);

    // The adapter should inject a pageBreak block immediately before the paragraph
    const precedingBlock = blocks[targetParagraphIndex - 1];
    expect(precedingBlock?.kind).toBe('pageBreak');

    const previousParagraphIndex = (() => {
      for (let i = targetParagraphIndex - 2; i >= 0; i -= 1) {
        if (blocks[i].kind === 'paragraph') {
          return i;
        }
      }
      return -1;
    })();
    expect(previousParagraphIndex).toBeGreaterThanOrEqual(0);

    const targetBlockId = blocks[targetParagraphIndex].id;
    const previousBlockId = blocks[previousParagraphIndex].id;
    const findPageIndex = (blockId?: string) =>
      layout.pages.findIndex((page) => page.fragments.some((fragment) => fragment.blockId === blockId));

    const previousPageIndex = findPageIndex(previousBlockId);
    const targetPageIndex = findPageIndex(targetBlockId);

    expect(previousPageIndex).toBeGreaterThanOrEqual(0);
    expect(targetPageIndex).toBeGreaterThanOrEqual(0);
    expect(targetPageIndex).toBeGreaterThan(previousPageIndex);
  });
});
