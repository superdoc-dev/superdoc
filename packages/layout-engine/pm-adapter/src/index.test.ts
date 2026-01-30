import { describe, it, expect } from 'vitest';
import { toFlowBlocks as baseToFlowBlocks } from './index.js';
import type { PMNode, PMMark, AdapterOptions } from './index.js';
import type { FlowBlock, ImageBlock, TableBlock } from '@superdoc/contracts';
import basicParagraphFixture from './fixtures/basic-paragraph.json';
import edgeCasesFixture from './fixtures/edge-cases.json';
import tabsDecimalFixture from './fixtures/tabs-decimal.json';
import imageFixture from './fixtures/image-inline-and-block.json';
import hummingbirdFixture from './fixtures/hummingbird.json';
import boldDemoFixture from './fixtures/bold-demo.json';

const createDefaultConverterContext = () => ({
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
});

const toFlowBlocks = (pmDoc: PMNode | object, options: AdapterOptions = {}) =>
  baseToFlowBlocks(pmDoc, { converterContext: createDefaultConverterContext(), ...options });

const createTestBodySectPr = () => ({
  type: 'element',
  name: 'w:sectPr',
  attributes: {},
  elements: [
    {
      type: 'element',
      name: 'w:pgSz',
      attributes: { 'w:w': '12240', 'w:h': '15840' },
    },
  ],
});

const getSectionBreaks = (blocks: FlowBlock[], options?: { includeFirst?: boolean }) => {
  const includeFirst = options?.includeFirst ?? false;
  return blocks.filter((b: FlowBlock) => b.kind === 'sectionBreak' && (includeFirst || !b.attrs?.isFirstSection));
};

describe('toFlowBlocks', () => {
  describe('basic functionality', () => {
    it('converts a simple paragraph to a FlowBlock', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello world',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        id: '0-paragraph',
        runs: [
          {
            text: 'Hello world',
            fontFamily: 'Times New Roman, sans-serif',
          },
        ],
      });
      expect(blocks[0].runs[0]?.fontSize).toBeCloseTo((10 * 96) / 72, 5);
    });

    it('generates unique BlockIds based on position', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(3);
      const numericParts = blocks.map((block) => Number(block.id.split('-')[0]));
      numericParts.forEach((value) => expect(Number.isNaN(value)).toBe(false));
      expect(numericParts[0]).toBeLessThan(numericParts[1]);
      expect(numericParts[1]).toBeLessThan(numericParts[2]);
      blocks.forEach((block) => expect(block.id.endsWith('-paragraph')).toBe(true));
    });

    it('respects custom font defaults', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Test' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, {
        defaultFont: 'Times New Roman',
        defaultSize: 14,
      });

      expect(blocks[0].runs[0]).toMatchObject({
        fontFamily: 'Times New Roman, sans-serif',
      });
      expect(blocks[0].runs[0]?.fontSize).toBeCloseTo(14, 5);
    });
  });

  describe('mark mapping', () => {
    it('maps bold mark to Run.bold', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }],
                text: 'Bold text',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs[0]).toMatchObject({
        text: 'Bold text',
        bold: true,
      });
    });

    it('treats explicit ST_OnOff false values as not bold', () => {
      const { blocks } = toFlowBlocks(boldDemoFixture as PMNode);
      const sampleRuns = blocks
        .filter((block) => block.kind === 'paragraph')
        .flatMap((block) => block.runs)
        .filter((run) => run.kind !== 'tab' && run.text === 'Sample text');

      expect(sampleRuns).toHaveLength(7);
      const [omit, trueVal, val1, onVal, falseVal, zeroVal, offVal] = sampleRuns;
      expect(omit?.bold).toBe(true);
      expect(trueVal?.bold).toBe(true);
      expect(val1?.bold).toBe(true);
      expect(onVal?.bold).toBe(true);
      expect(falseVal?.bold).toBe(false);
      expect(zeroVal?.bold).toBe(false);
      expect(offVal?.bold).toBe(false);
    });

    it('maps italic mark to Run.italic', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'italic' }],
                text: 'Italic text',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs[0]).toMatchObject({
        text: 'Italic text',
        italic: true,
      });
    });

    it('maps textStyle color to Run.color', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [
                  {
                    type: 'textStyle',
                    attrs: { color: '#ff0000' },
                  },
                ],
                text: 'Red text',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs[0]).toMatchObject({
        text: 'Red text',
        color: '#ff0000',
      });
    });

    it('handles overlapping marks', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'textStyle', attrs: { color: '#0000ff' } }],
                text: 'All marks',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs[0]).toMatchObject({
        text: 'All marks',
        bold: true,
        italic: true,
        color: '#0000ff',
      });
    });

    it('handles mixed styled runs in a paragraph', () => {
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

      expect(blocks[0].runs).toHaveLength(4);
      expect(blocks[0].runs[0].text).toBe('Plain ');
      expect(blocks[0].runs[0].bold).toBeUndefined();

      expect(blocks[0].runs[1].text).toBe('bold');
      expect(blocks[0].runs[1].bold).toBe(true);

      expect(blocks[0].runs[2].text).toBe(' and ');
      expect(blocks[0].runs[3].text).toBe('italic');
      expect(blocks[0].runs[3].italic).toBe(true);
    });

    it('maps underline, highlight, strike, link, and font overrides', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                justification: 'center',
                spacing: { before: 150, after: 90, line: 330, lineRule: 'exact' },
                indent: { left: 180, firstLine: 360 },
              },
            },
            content: [
              {
                type: 'text',
                marks: [
                  { type: 'underline', attrs: { underlineType: 'dotted', color: '00ff00' } },
                  { type: 'strike' },
                  { type: 'highlight', attrs: { color: '#ff00ff' } },
                  { type: 'link', attrs: { href: 'https://example.com', title: 'Example' } },
                  {
                    type: 'textStyle',
                    attrs: { fontFamily: 'Courier New', fontSize: 18, letterSpacing: 1.5 },
                  },
                ],
                text: 'Decorated',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const run = blocks[0].runs[0];

      expect(run).toMatchObject({
        text: 'Decorated',
        fontFamily: 'Courier New',
        fontSize: 18,
        letterSpacing: 1.5,
        strike: true,
        highlight: '#ff00ff',
        underline: { style: 'dotted', color: '#00ff00' },
        link: { href: 'https://example.com', title: 'Example' },
      });

      expect(blocks[0].attrs).toMatchObject({
        alignment: 'center',
        spacing: { before: 10, after: 6, line: 22, lineUnit: 'px', lineRule: 'exact' },
        indent: { left: 12, firstLine: 24 },
      });
    });

    it('emits FlowRunLink v2 metadata when rich hyperlinks are enabled', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Click me',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'https://example.com',
                      title: ' Example ',
                      target: '_self',
                      rel: 'nofollow',
                      tooltip: '  "Tip"  ',
                      anchor: ' section-1 ',
                      name: ' legacy ',
                      docLocation: ' page-2 ',
                      rId: ' rId55 ',
                      history: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { enableRichHyperlinks: true });
      const run = blocks[0].runs[0];

      expect(run.link).toEqual(
        expect.objectContaining({
          version: 2,
          href: 'https://example.com',
          title: 'Example',
          target: '_self',
          rel: 'nofollow',
          tooltip: '"Tip"',
          anchor: 'section-1',
          name: 'legacy',
          docLocation: 'page-2',
          rId: 'rId55',
          history: false,
        }),
      );
    });

    it('drops unsafe hrefs but preserves anchor metadata', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Unsafe',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'javascript:alert(1)',
                      anchor: 'bookmark-1',
                      docLocation: 'chapter-3',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { enableRichHyperlinks: true });
      const run = blocks[0].runs[0];
      expect(run.link).toMatchObject({
        version: 2,
        anchor: 'bookmark-1',
        docLocation: 'chapter-3',
      });
      expect(run.link?.href).toBeUndefined();
    });

    it('migrates legacy links to v2 format when rich hyperlinks are disabled', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Example',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'https://example.com',
                      title: 'Example Site',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      // When rich hyperlinks are disabled, legacy path should still set version: 2
      const { blocks } = toFlowBlocks(pmDoc, { enableRichHyperlinks: false });
      const run = blocks[0].runs[0];

      expect(run.link?.version).toBe(2);
      expect(run.link?.href).toBe('https://example.com');
      expect(run.link?.title).toBe('Example Site');
    });

    it('does not modify v2 links during migration', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Link',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'https://example.com',
                      target: '_blank',
                      rel: 'noopener',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      // With rich hyperlinks enabled, should preserve all v2 attributes
      const { blocks } = toFlowBlocks(pmDoc, { enableRichHyperlinks: true });
      const run = blocks[0].runs[0];

      expect(run.link?.version).toBe(2);
      expect(run.link?.href).toBe('https://example.com');
      expect(run.link?.target).toBe('_blank');
      expect(run.link?.rel).toBe('noopener');
    });

    it('handles legacy links in PM document conversion', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Link text',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'https://example.com' },
                  },
                ],
              },
            ],
          },
        ],
      };

      // Legacy path (rich hyperlinks disabled)
      const { blocks } = toFlowBlocks(pmDoc, { enableRichHyperlinks: false });
      const linkRun = blocks[0].runs[0];

      // Should have version 2 even from legacy path
      expect(linkRun.link?.version).toBe(2);
      expect(linkRun.link?.href).toBe('https://example.com');
    });

    it('retains paragraph border definitions on ParagraphBlocks', () => {
      // size values are in OOXML eighths-of-a-point
      // 32 eighths = 4pt, 16 eighths = 2pt
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                borders: {
                  top: { val: 'single', size: 32, color: '00FF00' },
                  left: { val: 'dashed', size: 16, color: '#112233' },
                },
              },
            },
            content: [{ type: 'text', text: 'Bordered paragraph' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const paragraph = blocks[0];

      expect(paragraph.kind).toBe('paragraph');
      expect(paragraph.attrs?.borders?.top).toEqual({
        style: 'solid',
        width: (32 / 8) * (96 / 72), // 4pt in pixels
        color: '#00FF00',
      });
      expect(paragraph.attrs?.borders?.left).toEqual({
        style: 'dashed',
        width: (16 / 8) * (96 / 72), // 2pt in pixels
        color: '#112233',
      });
    });

    it('maps paragraph shading fill into ParagraphAttrs', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                shading: {
                  fill: 'ABCDEF',
                  color: 'auto',
                  val: 'clear',
                },
              },
            },
            content: [{ type: 'text', text: 'Shaded paragraph' }],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc);
      expect(block.kind).toBe('paragraph');
      expect(block.attrs?.shading).toEqual({
        fill: '#ABCDEF',
        val: 'clear',
      });
    });
  });

  describe('special inline nodes', () => {
    it('emits tokenized runs for page number nodes', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Page ' },
              { type: 'page-number' },
              { type: 'text', text: ' of ' },
              { type: 'total-page-number' },
            ],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc);
      expect(block.runs).toHaveLength(4);
      expect(block.runs[1]).toMatchObject({ token: 'pageNumber', text: '0' });
      expect(block.runs[3]).toMatchObject({ token: 'totalPageCount', text: '0' });
    });

    it('preserves styling on token runs', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'page-number',
                marks: [{ type: 'textStyle', attrs: { color: '#123456' } }, { type: 'bold' }],
              },
            ],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc);
      expect(block.runs[0]).toMatchObject({
        token: 'pageNumber',
        color: '#123456',
        bold: true,
      });
    });

    it('preserves bold formatting on page number token', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Page ' },
              {
                type: 'page-number',
                marks: [{ type: 'bold' }],
              },
            ],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc);
      expect(block.runs).toHaveLength(2);
      expect(block.runs[1]).toMatchObject({
        token: 'pageNumber',
        bold: true,
        text: '0',
      });
      expect(block.runs[0].bold).toBeUndefined();
    });

    it('handles mixed content with text and multiple tokens', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Footer: ' },
              { type: 'page-number' },
              { type: 'text', text: ' / ' },
              { type: 'total-page-number' },
              { type: 'text', text: ' pages' },
            ],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc);
      expect(block.runs).toHaveLength(5);
      expect(block.runs[0]).toMatchObject({ text: 'Footer: ' });
      expect(block.runs[1]).toMatchObject({ token: 'pageNumber', text: '0' });
      expect(block.runs[2]).toMatchObject({ text: ' / ' });
      expect(block.runs[3]).toMatchObject({ token: 'totalPageCount', text: '0' });
      expect(block.runs[4]).toMatchObject({ text: ' pages' });
    });

    it('handles total page count token independently', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Total: ' }, { type: 'total-page-number' }],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc);
      expect(block.runs).toHaveLength(2);
      expect(block.runs[1]).toMatchObject({
        token: 'totalPageCount',
        text: '0',
      });
    });

    it('applies blockIdPrefix to blocks containing tokens', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Header: ' }, { type: 'page-number' }],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc, { blockIdPrefix: 'header-default-' });
      expect(block.id.startsWith('header-default-')).toBe(true);
      expect(block.runs[1]).toMatchObject({
        token: 'pageNumber',
        text: '0',
      });
    });

    it('provides placeholder text for measurement when token is present', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'page-number' }, { type: 'total-page-number' }],
          },
        ],
      };

      const {
        blocks: [block],
      } = toFlowBlocks(pmDoc);
      expect(block.runs).toHaveLength(2);
      // Both tokens should have placeholder '0' for measurement
      expect(block.runs[0].text).toBe('0');
      expect(block.runs[0].token).toBe('pageNumber');
      expect(block.runs[1].text).toBe('0');
      expect(block.runs[1].token).toBe('totalPageCount');
    });
  });

  describe('section break emission and page-boundary semantics', () => {
    it('emits sectionBreak after paragraph with sectPr and leaves requirePageBoundary undefined even when titlePg/headerRefs present', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Cover' }] },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:titlePg', attributes: {} },
                    { name: 'w:headerReference', attributes: { 'w:type': 'default', 'r:id': 'rId8' } },
                    { name: 'w:footerReference', attributes: { 'w:type': 'default', 'r:id': 'rId9' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Start of next section' }],
          },
        ],
      } as never;

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const tailBreaks = getSectionBreaks(blocks);
      // Expect: paragraph('Cover'), paragraph('Start of next section'), then a sectionBreak
      const paragraphKinds = blocks.filter((b) => b.kind === 'paragraph').map((b) => b.kind);
      expect(paragraphKinds.length).toBe(2);
      expect(tailBreaks.length).toBe(1);
      expect((tailBreaks[0] as never).attrs?.requirePageBoundary).toBeUndefined();
    });

    it('does not mark requirePageBoundary for pure column changes', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Single column' }] },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:cols', attributes: { 'w:num': '2', 'w:space': '720' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Two columns' }],
          },
        ],
      } as never;

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const tailBreaks = getSectionBreaks(blocks);
      expect(tailBreaks.length).toBe(1);
      // Should not have requirePageBoundary since it's only a column change
      expect((tailBreaks[0] as never).attrs?.requirePageBoundary).toBeUndefined();
    });

    it('does not mark requirePageBoundary when header/footer margins change', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:pgMar', attributes: { 'w:header': '720', 'w:footer': '720' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'First section' }],
          },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:pgMar', attributes: { 'w:header': '1440', 'w:footer': '1440' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Second section' }],
          },
        ],
      } as never;

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks).toHaveLength(2);
      // Margin changes no longer force requirePageBoundary; handled by section type downstream
      expect((sectionBreaks[1] as never).attrs?.requirePageBoundary).toBeUndefined();
    });

    it('marks requirePageBoundary when page size changes (continuous still needs a page break)', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Portrait' }] },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:pgSz', attributes: { 'w:w': '15840', 'w:h': '12240', 'w:orient': 'landscape' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Landscape' }],
          },
        ],
      } as never;

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreak = getSectionBreaks(blocks).find(Boolean);
      expect(sectionBreak).toBeDefined();
      expect((sectionBreak as never).attrs?.requirePageBoundary).toBe(true);
    });

    it('does not emit duplicate section breaks when signatures are identical', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:pgMar', attributes: { 'w:header': '720', 'w:footer': '720' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'First' }],
          },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:pgMar', attributes: { 'w:header': '720', 'w:footer': '720' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Second' }],
          },
        ],
      } as never;

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks);
      const maxSectionIndex = Math.max(...sectionBreaks.map((b) => b.attrs?.sectionIndex ?? Number.NEGATIVE_INFINITY));
      const nonFinalBreaks = sectionBreaks.filter((b) => (b.attrs?.sectionIndex ?? -Infinity) < maxSectionIndex);
      // Coalesce by signature among non-final sections
      const fp = (b: PMNode) =>
        JSON.stringify({
          type: b.type,
          margins: b.margins,
          pageSize: b.pageSize,
          orientation: b.orientation,
          columns: b.columns,
        });
      const unique = new Set(nonFinalBreaks.map(fp));
      expect(unique.size).toBe(1);
    });

    it('combines column change with header/footer change without forcing requirePageBoundary', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:pgMar', attributes: { 'w:header': '720', 'w:footer': '720' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'First section' }],
          },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:cols', attributes: { 'w:num': '2', 'w:space': '720' } },
                    { name: 'w:pgMar', attributes: { 'w:header': '1440', 'w:footer': '1440' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Second section' }],
          },
        ],
      } as never;

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks);
      expect(sectionBreaks).toHaveLength(2);
      const multiColumnBreak = sectionBreaks.find((b) => (b.columns?.count ?? 0) > 1);
      expect(multiColumnBreak).toBeDefined();
      expect((multiColumnBreak as FlowBlock).attrs?.requirePageBoundary).toBeUndefined();
      // Gap is in pixels (0.5in = 48px @96DPI)
      expect((multiColumnBreak as FlowBlock).columns).toEqual({ count: 2, gap: 48 });
    });

    it('interprets missing w:num in w:cols as a single-column layout change', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Multi-column section' }],
          },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                    { name: 'w:cols', attributes: { 'w:space': '720' } },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Back to single column' }],
          },
        ],
      } as never;

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const allBreaks = getSectionBreaks(blocks, { includeFirst: true });
      const tailBreak = allBreaks.find((b) => b.attrs?.sectionIndex === 0);
      expect(tailBreak).toBeDefined();
      expect((tailBreak as never).columns).toEqual({ count: 1, gap: 48 });
    });

    describe('Regression tests for section property bug fixes', () => {
      it('emits all sectPr elements even if they appear on consecutive paragraphs', () => {
        const pmDoc: PMNode = {
          type: 'doc',
          attrs: { bodySectPr: createTestBodySectPr() },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Para 0-15' }] },
            {
              type: 'paragraph',
              attrs: {
                paragraphProperties: {
                  sectPr: {
                    elements: [{ name: 'w:titlePg' }, { name: 'w:cols', attributes: { 'w:space': '720' } }],
                  },
                },
              },
              content: [{ type: 'text', text: 'Para 15 with titlePg sectPr' }],
            },
            {
              type: 'paragraph',
              attrs: {
                paragraphProperties: {
                  sectPr: {
                    elements: [
                      { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                      { name: 'w:cols', attributes: { 'w:space': '720' } },
                    ],
                  },
                },
              },
              content: [{ type: 'text', text: 'Para 16 with continuous sectPr' }],
            },
            { type: 'paragraph', content: [{ type: 'text', text: 'Para 17' }] },
          ],
        };

        const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
        const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });

        // Should emit BOTH section breaks (previously might have filtered one out)
        const firstBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 0);
        const secondBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 1);
        expect(firstBreak).toBeDefined();
        expect(secondBreak).toBeDefined();
        // Both have w:space="720" which means single column
        expect((firstBreak as FlowBlock).columns).toEqual({ count: 1, gap: 48 });
        expect((secondBreak as FlowBlock).type).toBe('continuous'); // Second sectPr
      });

      it('emits sectPr from paragraphs with substantial text content', () => {
        const pmDoc: PMNode = {
          type: 'doc',
          attrs: { bodySectPr: createTestBodySectPr() },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Normal paragraph' }] },
            {
              type: 'paragraph',
              attrs: {
                paragraphProperties: {
                  sectPr: {
                    elements: [
                      { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                      { name: 'w:cols', attributes: { 'w:num': '2', 'w:space': '720' } },
                    ],
                  },
                },
              },
              content: [
                { type: 'text', text: 'This paragraph has lots of text content AND a section break. ' },
                {
                  type: 'text',
                  text: 'In real Word docs, this is common (e.g., "Chapter 1" followed by section break).',
                },
              ],
            },
          ],
        };

        const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
        const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });

        const contentBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 0);

        // Should emit the section break despite paragraph having content
        expect(contentBreak).toBeDefined();
        expect((contentBreak as FlowBlock).columns).toEqual({ count: 2, gap: 48 });
      });

      it('detects column changes from single to multi to single column', () => {
        const pmDoc: PMNode = {
          type: 'doc',
          attrs: { bodySectPr: createTestBodySectPr() },
          content: [
            {
              type: 'paragraph',
              attrs: {
                paragraphProperties: {
                  sectPr: {
                    elements: [
                      { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                      { name: 'w:cols', attributes: { 'w:space': '720' } }, // Single column (w:num absent = 1)
                    ],
                  },
                },
              },
              content: [{ type: 'text', text: 'Single column section' }],
            },
            {
              type: 'paragraph',
              attrs: {
                paragraphProperties: {
                  sectPr: {
                    elements: [
                      { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                      { name: 'w:cols', attributes: { 'w:num': '2', 'w:space': '720' } },
                    ],
                  },
                },
              },
              content: [{ type: 'text', text: 'Two column section' }],
            },
            {
              type: 'paragraph',
              attrs: {
                paragraphProperties: {
                  sectPr: {
                    elements: [
                      { name: 'w:type', attributes: { 'w:val': 'continuous' } },
                      { name: 'w:cols', attributes: { 'w:space': '720' } }, // Back to single column
                    ],
                  },
                },
              },
              content: [{ type: 'text', text: 'Back to single column' }],
            },
          ],
        };

        const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
        const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });

        // All 3 paragraphs have sectPr, so we expect breaks for sectionIndices 0-2
        const breakByIndex = (index: number) =>
          sectionBreaks.find((b: FlowBlock) => b.attrs?.sectionIndex === index) as FlowBlock | undefined;

        const first = breakByIndex(0);
        const second = breakByIndex(1);
        const third = breakByIndex(2);

        expect(first?.columns?.count).toBe(1);
        expect(second?.columns?.count).toBe(2);
        expect(third?.columns?.count).toBe(1);
        [first, second, third].forEach((b) => expect(b?.type).toBe('continuous'));
      });
    });
  });

  describe('block id prefixing', () => {
    it('applies blockIdPrefix to all generated blocks', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'image', attrs: { src: 'data:image/png;base64,xxx' } },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { blockIdPrefix: 'header-default-' });
      blocks.forEach((block) => {
        expect(block.id.startsWith('header-default-')).toBe(true);
      });
    });
  });

  it('populates pm ranges on runs', () => {
    const pmDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    };

    const {
      blocks: [block],
    } = toFlowBlocks(pmDoc);
    expect(block.kind).toBe('paragraph');
    expect(block.runs[0].pmStart).toBe(1);
    expect(block.runs[0].pmEnd).toBe(6);
  });

  describe('edge cases', () => {
    it('handles empty paragraph', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[0].runs).toHaveLength(1);
      expect(blocks[0].runs[0]).toMatchObject({
        text: '',
      });
      // Font properties may vary depending on style resolution
      expect(blocks[0].runs[0].fontFamily).toBeDefined();
      expect(blocks[0].runs[0].fontSize).toBeGreaterThan(0);
    });

    it('handles paragraph with empty content array', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[0].runs[0].text).toBe('');
    });

    it('handles empty document', () => {
      const pmDoc = {
        type: 'doc',
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(0);
    });

    it('handles document with empty content array', () => {
      const pmDoc = {
        type: 'doc',
        content: [],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(0);
    });

    it('preserves paragraph attributes', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                justification: 'center',
                indent: { left: 300 }, // 20px -> 300 twips
                spacing: { before: 75 }, // 5px -> 75 twips
              },
            },
            content: [{ type: 'text', text: 'Test' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].attrs).toMatchObject({
        alignment: 'center',
        indent: { left: 20 },
        spacing: { before: 5 },
      });
    });

    it('normalizes tabs and decimal separator metadata (OOXML twips)', () => {
      const { blocks } = toFlowBlocks(tabsDecimalFixture as PMNode, {
        locale: { decimalSeparator: ',' },
      });

      expect(blocks).toHaveLength(2);
      // Tabs should be emitted in OOXML format (twips + val)
      expect(blocks[0].attrs?.tabs).toEqual([
        { val: 'decimal', pos: 1440, leader: 'dot' }, // 96px → 1440 twips
        { val: 'end', pos: 2880, leader: 'none' }, // 192px → 2880 twips
      ]);
      expect(blocks[0].attrs?.decimalSeparator).toBe('.');
      expect(blocks[1].attrs?.tabs).toEqual([{ val: 'end', pos: 1800, leader: 'dot' }]); // 120px → 1800 twips
    });
  });

  describe('image support', () => {
    it('creates ImageRuns for inline images (wrap.type: Inline)', () => {
      // imageFixture has wrap.type: 'Inline', so it should become an ImageRun inside a paragraph
      const { blocks } = toFlowBlocks(imageFixture);
      const paragraphBlock = blocks.find((block) => block.kind === 'paragraph');

      expect(paragraphBlock).toBeDefined();
      // The image should be an ImageRun in the paragraph's runs array
      const imageRun = paragraphBlock?.runs?.find((run: { kind?: string }) => run.kind === 'image');
      expect(imageRun).toBeDefined();
      expect(imageRun?.src).toBeTruthy();
      expect(imageRun?.width).toBeGreaterThan(0);
      expect(imageRun?.height).toBeGreaterThan(0);
    });

    it('keeps inline images as ImageRuns within the same paragraph', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Before ' },
              {
                type: 'image',
                attrs: {
                  src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/',
                  size: { width: 120, height: 80 },
                  inline: true,
                },
              },
              { type: 'text', text: ' after' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      // Inline images should be kept as ImageRuns within a single paragraph
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      // Check runs: text, image, text
      const runs = (blocks[0] as ParagraphBlock).runs;
      expect(runs.length).toBeGreaterThanOrEqual(2);
      // Should have ImageRun in the runs
      const imageRun = runs.find((run: { kind?: string }) => run.kind === 'image');
      expect(imageRun).toBeDefined();
    });

    it('preserves anchor and wrap metadata for anchored images', () => {
      const { blocks } = toFlowBlocks(hummingbirdFixture);
      const imageBlock = blocks.find((block): block is ImageBlock => block.kind === 'image');

      expect(imageBlock).toBeDefined();
      expect(imageBlock?.wrap?.type).toBe('Tight');
      expect(imageBlock?.wrap?.polygon?.length).toBeGreaterThan(0);
      expect(imageBlock?.wrap?.wrapText).toBe('bothSides');
      expect(imageBlock?.anchor?.hRelativeFrom).toBe('column');
      expect(imageBlock?.anchor?.vRelativeFrom).toBe('paragraph');
      expect(imageBlock?.anchor?.isAnchored).toBe(true);
    });
  });

  describe('shapeContainer and shapeTextbox support', () => {
    it('converts shapeContainer nodes to drawing blocks', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'shapeContainer',
                attrs: {
                  width: 200,
                  height: 150,
                  rotation: 45,
                  flipH: true,
                  flipV: false,
                  kind: 'rectangle',
                  fillColor: '#ff0000',
                  strokeColor: '#000000',
                  strokeWidth: 2,
                  drawingContentId: 'shape-container-1',
                  drawingContent: {
                    name: 'w:drawing',
                    attributes: {},
                    elements: [],
                  },
                },
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const drawingBlock = blocks.find((block) => block.kind === 'drawing');

      expect(drawingBlock).toBeDefined();
      expect(drawingBlock?.drawingKind).toBe('vectorShape');
      expect(drawingBlock?.geometry).toMatchObject({
        width: 200,
        height: 150,
        rotation: 45,
        flipH: true,
        flipV: false,
      });
      expect(drawingBlock?.shapeKind).toBe('rectangle');
      expect(drawingBlock?.fillColor).toBe('#ff0000');
      expect(drawingBlock?.strokeColor).toBe('#000000');
      expect(drawingBlock?.strokeWidth).toBe(2);
      expect(drawingBlock?.drawingContentId).toBe('shape-container-1');
    });

    it('converts shapeTextbox nodes to drawing blocks with text preserved', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'shapeTextbox',
                attrs: {
                  width: 300,
                  height: 100,
                  rotation: 0,
                  flipH: false,
                  flipV: false,
                  kind: 'textbox',
                  fillColor: '#ffffff',
                  strokeColor: '#333333',
                  strokeWidth: 1,
                  drawingContentId: 'textbox-1',
                  drawingContent: {
                    name: 'w:txbxContent',
                    attributes: {},
                    elements: [
                      {
                        name: 'w:p',
                        elements: [{ name: 'w:r', elements: [{ name: 'w:t', text: 'Hello World' }] }],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const drawingBlock = blocks.find((block) => block.kind === 'drawing');

      expect(drawingBlock).toBeDefined();
      expect(drawingBlock?.drawingKind).toBe('vectorShape');
      expect(drawingBlock?.geometry).toMatchObject({
        width: 300,
        height: 100,
        rotation: 0,
        flipH: false,
        flipV: false,
      });
      expect(drawingBlock?.shapeKind).toBe('textbox');
      expect(drawingBlock?.drawingContent?.name).toBe('w:txbxContent');
      expect(drawingBlock?.drawingContent?.elements?.length).toBeGreaterThan(0);
    });

    it('handles shapeContainer with anchor and wrap metadata', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'shapeContainer',
                attrs: {
                  width: 250,
                  height: 180,
                  kind: 'ellipse',
                  isAnchor: true,
                  anchorData: {
                    hRelativeFrom: 'column',
                    vRelativeFrom: 'paragraph',
                    alignH: 'center',
                    offsetV: 50,
                    isAnchored: true,
                  },
                  wrap: {
                    type: 'Square',
                    attrs: {
                      wrapText: 'bothSides',
                      distTop: 10,
                      distBottom: 10,
                      distLeft: 15,
                      distRight: 15,
                    },
                  },
                  zIndex: 5,
                },
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const drawingBlock = blocks.find((block) => block.kind === 'drawing');

      expect(drawingBlock).toBeDefined();
      expect(drawingBlock?.anchor?.isAnchored).toBe(true);
      expect(drawingBlock?.anchor?.hRelativeFrom).toBe('column');
      expect(drawingBlock?.anchor?.vRelativeFrom).toBe('paragraph');
      expect(drawingBlock?.anchor?.alignH).toBe('center');
      expect(drawingBlock?.anchor?.offsetV).toBe(50);
      expect(drawingBlock?.wrap?.type).toBe('Square');
      expect(drawingBlock?.wrap?.wrapText).toBe('bothSides');
      expect(drawingBlock?.wrap?.distTop).toBe(10);
      expect(drawingBlock?.wrap?.distLeft).toBe(15);
      expect(drawingBlock?.zIndex).toBe(5);
    });

    it('validates geometry and rejects zero/negative dimensions', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'shapeContainer',
                attrs: {
                  width: 0,
                  height: -10,
                  kind: 'invalid',
                },
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const drawingBlock = blocks.find((block) => block.kind === 'drawing');

      expect(drawingBlock).toBeDefined();
      // Should fall back to 1px for invalid dimensions
      expect(drawingBlock?.geometry?.width).toBe(1);
      expect(drawingBlock?.geometry?.height).toBe(1);
    });

    it('preserves PM range positions for selection', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Before ' },
              {
                type: 'shapeTextbox',
                attrs: {
                  width: 100,
                  height: 50,
                  kind: 'callout',
                },
              },
              { type: 'text', text: ' after' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks.length).toBeGreaterThan(0);

      const drawingBlock = blocks.find((block) => block.kind === 'drawing');
      expect(drawingBlock).toBeDefined();
      expect(drawingBlock?.attrs?.pmStart).toBeDefined();
      expect(drawingBlock?.attrs?.pmEnd).toBeDefined();
      expect(drawingBlock?.attrs?.pmEnd).toBeGreaterThan(drawingBlock?.attrs?.pmStart ?? 0);
    });

    it('splits paragraphs around inline shapeContainer nodes', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Text before' },
              {
                type: 'shapeContainer',
                attrs: {
                  width: 80,
                  height: 60,
                  kind: 'arrow',
                },
              },
              { type: 'text', text: 'text after' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'drawing', 'paragraph']);
      expect(blocks[0].runs[0].text).toContain('Text before');
      expect(blocks[2].runs[0].text).toContain('text after');
    });

    it('handles shapeContainer and shapeTextbox in all conversion paths', () => {
      // Test documentToFlowBlocks path (top-level doc children)
      const docWithShapes = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Paragraph 1' }],
          },
          {
            type: 'shapeContainer',
            attrs: { width: 100, height: 100, kind: 'rect' },
          },
          {
            type: 'shapeTextbox',
            attrs: { width: 150, height: 75, kind: 'textbox' },
          },
        ],
      };

      const { blocks } = toFlowBlocks(docWithShapes);
      const drawingBlocks = blocks.filter((b) => b.kind === 'drawing');
      expect(drawingBlocks).toHaveLength(2);
      expect(drawingBlocks[0].drawingKind).toBe('vectorShape');
      expect(drawingBlocks[1].drawingKind).toBe('vectorShape');
    });
  });

  describe('fixture-based tests', () => {
    it('converts basic-paragraph fixture correctly', () => {
      const { blocks } = toFlowBlocks(basicParagraphFixture);

      expect(blocks).toHaveLength(2);

      // First paragraph with bold, italic, and bold+italic
      expect(blocks[0].id).toBe('0-paragraph');
      expect(blocks[0].runs).toHaveLength(7);
      expect(blocks[0].runs[0].text).toBe('This is a simple paragraph with ');
      expect(blocks[0].runs[1].text).toBe('bold text');
      expect(blocks[0].runs[1].bold).toBe(true);
      expect(blocks[0].runs[3].text).toBe('italic text');
      expect(blocks[0].runs[3].italic).toBe(true);
      expect(blocks[0].runs[5].text).toBe('bold italic text');
      expect(blocks[0].runs[5].bold).toBe(true);
      expect(blocks[0].runs[5].italic).toBe(true);

      // Second paragraph with color
      expect(blocks[1].id.endsWith('-paragraph')).toBe(true);
      expect(blocks[1].runs).toHaveLength(3);
      expect(blocks[1].runs[1].text).toBe('red colored text');
      expect(blocks[1].runs[1].color).toBe('#ff0000');
    });

    it('converts edge-cases fixture correctly', () => {
      const { blocks } = toFlowBlocks(edgeCasesFixture);

      expect(blocks).toHaveLength(3);

      // Plain text paragraph
      expect(blocks[0].runs).toHaveLength(1);
      expect(blocks[0].runs[0].text).toBe('Simple plain text paragraph.');

      // Empty paragraph
      expect(blocks[1].runs).toHaveLength(1);
      expect(blocks[1].runs[0].text).toBe('');

      // All marks combined
      expect(blocks[2].runs).toHaveLength(1);
      expect(blocks[2].runs[0]).toMatchObject({
        text: 'All marks combined',
        bold: true,
        italic: true,
        color: '#0000ff',
      });
    });
  });

  describe('section breaks', () => {
    it('emits sectionBreak block when emitSectionBreaks is true', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: {
                header: 1,
                footer: 0.75,
              },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [
                    {
                      name: 'w:type',
                      attributes: { 'w:val': 'nextPage' },
                    },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Title page' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Content' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });
      const firstBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 0) as FlowBlock | undefined;
      expect(firstBreak).toBeDefined();
      expect(firstBreak).toMatchObject({
        kind: 'sectionBreak',
        type: 'nextPage',
        margins: {
          header: 96, // 1 inch * 96 dpi
          footer: 72, // 0.75 inch * 96 dpi
        },
      });
      expect(blocks.filter((b) => b.kind === 'paragraph')).toHaveLength(2);
    });

    it('defaults to nextPage when w:type is missing (OOXML spec)', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: {
                header: 1,
                footer: 1,
              },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [
                    // No w:type element - should default to nextPage
                    {
                      name: 'w:pgSz',
                      attributes: { 'w:w': '12240', 'w:h': '15840' },
                    },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Section with default type' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });
      const firstBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 0);
      expect(firstBreak).toBeDefined();
      expect((firstBreak as FlowBlock).type).toBe('nextPage');
    });

    it('respects explicit continuous type', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: {
                header: 0.5,
                footer: 0.5,
              },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [
                    {
                      name: 'w:type',
                      attributes: { 'w:val': 'continuous' },
                    },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Continuous section' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });
      const firstBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 0);
      expect(firstBreak).toBeDefined();
      expect((firstBreak as FlowBlock).type).toBe('continuous');
    });

    it('handles evenPage section type', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: {
                header: 1,
                footer: 1,
              },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [
                    {
                      name: 'w:type',
                      attributes: { 'w:val': 'evenPage' },
                    },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Even page section' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });
      const firstBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 0);
      expect(firstBreak).toBeDefined();
      expect((firstBreak as FlowBlock).type).toBe('evenPage');
    });

    it('handles oddPage section type', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: {
                header: 1,
                footer: 1,
              },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [
                    {
                      name: 'w:type',
                      attributes: { 'w:val': 'oddPage' },
                    },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Odd page section' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = getSectionBreaks(blocks, { includeFirst: true });
      const firstBreak = sectionBreaks.find((b) => b.attrs?.sectionIndex === 0);
      expect(firstBreak).toBeDefined();
      expect((firstBreak as FlowBlock).type).toBe('oddPage');
    });

    it('does not emit sectionBreak when emitSectionBreaks is false', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: {
                header: 1,
                footer: 1,
              },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [
                    {
                      name: 'w:type',
                      attributes: { 'w:val': 'nextPage' },
                    },
                  ],
                },
              },
            },
            content: [{ type: 'text', text: 'Title page' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: false });
      expect(blocks.filter((b) => b.kind === 'paragraph')).toHaveLength(1);
    });

    it('defaults to nextPage for multiple sections without explicit type', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: { header: 1, footer: 1 },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [], // No type element
                },
              },
            },
            content: [{ type: 'text', text: 'Section 1' }],
          },
          {
            type: 'paragraph',
            attrs: {
              sectionMargins: { header: 0.5, footer: 0.5 },
              paragraphProperties: {
                sectPr: {
                  name: 'w:sectPr',
                  elements: [], // No type element
                },
              },
            },
            content: [{ type: 'text', text: 'Section 2' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const paragraphCount = blocks.filter((b) => b.kind === 'paragraph').length;
      const tailBreaks = blocks.filter((b: FlowBlock) => b.kind === 'sectionBreak' && !b.attrs?.isFirstSection);
      expect(paragraphCount + tailBreaks.length).toBe(4); // 2 paragraphs + 2 breaks
      expect(tailBreaks[0].type).toBe('nextPage');
      expect(tailBreaks[1].type).toBe('nextPage');
    });

    it('emits section breaks even when the paragraph still has content', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Content paragraph' }],
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [{ name: 'w:type', attributes: { 'w:val': 'nextPage' } }],
                },
              },
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Next section' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = blocks.filter((b: FlowBlock) => b.kind === 'sectionBreak' && !b.attrs?.isFirstSection);

      expect(sectionBreaks).toHaveLength(1);
      expect(sectionBreaks[0].type).toBe('nextPage');
    });

    it('emits section breaks even when w:type element is missing (defaults to nextPage)', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        attrs: { bodySectPr: createTestBodySectPr() },
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    // Missing w:type but still carries page margin info
                    { name: 'w:pgMar', attributes: { 'w:header': '720', 'w:footer': '720' } },
                  ],
                },
              },
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Middle content' }],
          },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [
                    { name: 'w:type', attributes: { 'w:val': 'nextPage' } },
                    { name: 'w:pgMar', attributes: { 'w:header': '720', 'w:footer': '720' } },
                  ],
                },
              },
            },
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = blocks.filter((b: FlowBlock) => b.kind === 'sectionBreak' && !b.attrs?.isFirstSection);

      expect(sectionBreaks).toHaveLength(2);
      expect(sectionBreaks[0].type).toBe('nextPage');
      expect(sectionBreaks[1].type).toBe('nextPage');
    });

    it('keeps final paragraph section break even without type when no body sectPr', () => {
      const pmDoc: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Content' }],
          },
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                sectPr: {
                  elements: [], // No w:type element but this is final paragraph
                },
              },
            },
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { emitSectionBreaks: true });
      const sectionBreaks = blocks.filter((b: FlowBlock) => b.kind === 'sectionBreak' && !b.attrs?.isFirstSection);

      // Should emit final section break even without type
      expect(sectionBreaks).toHaveLength(1);
      expect(sectionBreaks[0].type).toBe('nextPage'); // Defaults to nextPage
    });
  });

  describe('Table of Contents (TOC)', () => {
    it('unwraps tableOfContents into child paragraphs with isTocEntry metadata', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'tableOfContents',
            attrs: { instruction: 'TOC \\o "1-3" \\h \\z \\u' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Heading 1' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Heading 2' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        attrs: {
          isTocEntry: true,
          tocInstruction: 'TOC \\o "1-3" \\h \\z \\u',
        },
      });
      expect(blocks[1]).toMatchObject({
        kind: 'paragraph',
        attrs: {
          isTocEntry: true,
          tocInstruction: 'TOC \\o "1-3" \\h \\z \\u',
        },
      });
    });

    it('handles tableOfContents without instruction attribute', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'tableOfContents',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'TOC Entry' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        attrs: {
          isTocEntry: true,
        },
      });
      expect(blocks[0].attrs?.tocInstruction).toBeUndefined();
    });

    it('preserves other paragraph attributes when tagging TOC entries', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'tableOfContents',
            attrs: { instruction: 'TOC \\h' },
            content: [
              {
                type: 'paragraph',
                attrs: {
                  paragraphProperties: {
                    spacing: { before: 0, after: 180 }, // 12px -> 180 twips
                  },
                },
                content: [{ type: 'text', text: 'TOC Entry' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        attrs: {
          isTocEntry: true,
          tocInstruction: 'TOC \\h',
          spacing: { before: 0, after: 12 },
        },
      });
    });
  });

  describe('documentPartObject (w:sdt wrapped content)', () => {
    it('unwraps documentPartObject with docPartGallery="Table of Contents"', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'documentPartObject',
            attrs: {
              id: 'toc-1',
              docPartGallery: 'Table of Contents',
              docPartUnique: true,
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Chapter 1' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Chapter 2' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        attrs: {
          isTocEntry: true,
          sdt: {
            type: 'docPartObject',
            gallery: 'Table of Contents',
            uniqueId: 'toc-1',
          },
        },
      });
      expect(blocks[1]).toMatchObject({
        kind: 'paragraph',
        attrs: {
          isTocEntry: true,
          sdt: {
            type: 'docPartObject',
            gallery: 'Table of Contents',
            uniqueId: 'toc-1',
          },
        },
      });
    });

    it('preserves instruction attribute from documentPartObject', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'documentPartObject',
            attrs: {
              id: 'toc-2',
              docPartGallery: 'Table of Contents',
              instruction: 'TOC \\o "1-3" \\h \\z \\u',
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Section 1' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toMatchObject({
        kind: 'paragraph',
        attrs: {
          isTocEntry: true,
          tocInstruction: 'TOC \\o "1-3" \\h \\z \\u',
          sdt: {
            type: 'docPartObject',
            gallery: 'Table of Contents',
            uniqueId: 'toc-2',
            instruction: 'TOC \\o "1-3" \\h \\z \\u',
          },
        },
      });
    });

    it('processes non-TOC documentPartObject by extracting child paragraphs', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'documentPartObject',
            attrs: {
              id: 'other-1',
              docPartGallery: 'Page Numbers',
              docPartUnique: true,
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Page 1' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      // Non-TOC documentPartObjects should have their child paragraphs processed
      // (This is needed for page numbers, bibliography, and other SDT-wrapped content)
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
    });
  });

  describe('pageReference tokens', () => {
    it('creates pageReference token run with bookmark metadata', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'See page ',
              },
              {
                type: 'pageReference',
                attrs: { instruction: 'PAGEREF _Toc123456789 \\h' },
                content: [{ type: 'text', text: '42' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[0].runs).toHaveLength(2);

      const pageRefRun = blocks[0].runs[1];
      expect(pageRefRun).toMatchObject({
        token: 'pageReference',
        text: '42',
        pageRefMetadata: {
          bookmarkId: '_Toc123456789',
          instruction: 'PAGEREF _Toc123456789 \\h',
        },
      });
    });

    it('extracts bookmark ID from PAGEREF instruction with quotes', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: { instruction: 'PAGEREF "_Toc987654321" \\h' },
                content: [{ type: 'text', text: '10' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs[0]).toMatchObject({
        token: 'pageReference',
        pageRefMetadata: {
          bookmarkId: '_Toc987654321',
          instruction: 'PAGEREF "_Toc987654321" \\h',
        },
      });
    });

    it('handles pageReference without bookmark (transparent container fallback)', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: { instruction: 'INVALID_INSTRUCTION' },
                content: [{ type: 'text', text: 'Error' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs).toHaveLength(1);
      // Falls back to transparent container behavior - emits child text run
      expect(blocks[0].runs[0]).toMatchObject({
        text: 'Error',
      });
      expect(blocks[0].runs[0].token).toBeUndefined();
    });

    it('handles pageReference with empty bookmark ID (edge case)', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: { instruction: 'PAGEREF "" \\h' },
                content: [{ type: 'text', text: '42' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs).toHaveLength(1);
      // Empty bookmark ID should fall back to transparent container behavior
      expect(blocks[0].runs[0]).toMatchObject({
        text: '42',
      });
      // Should not create token with empty bookmarkId
      expect(blocks[0].runs[0].token).toBeUndefined();
      expect(blocks[0].runs[0].pageRefMetadata).toBeUndefined();
    });

    it('handles pageReference with multiple text children (fallback text)', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: { instruction: 'PAGEREF _Bookmark1 \\h' },
                content: [
                  { type: 'text', text: '1' },
                  { type: 'text', text: '2' },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks[0].runs).toHaveLength(1);
      expect(blocks[0].runs[0]).toMatchObject({
        token: 'pageReference',
        text: '12', // Concatenated fallback text
        pageRefMetadata: {
          bookmarkId: '_Bookmark1',
          instruction: 'PAGEREF _Bookmark1 \\h',
        },
      });
    });

    it('preserves PM positions for pageReference token runs', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'pageReference',
                attrs: { instruction: 'PAGEREF _Toc1 \\h' },
                content: [{ type: 'text', text: '5' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const pageRefRun = blocks[0].runs[0];

      // PM positions should be set (actual values depend on position map construction)
      expect(typeof pageRefRun.pmStart).toBe('number');
      expect(typeof pageRefRun.pmEnd).toBe('number');
    });
  });

  describe('Bookmark tracking (toFlowBlocks)', () => {
    it('tracks bookmarkStart nodes in bookmark map', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'bookmarkStart',
                attrs: { name: '_Toc123456789' },
              },
              { type: 'text', text: 'Heading 1' },
              {
                type: 'bookmarkEnd',
                attrs: { name: '_Toc123456789' },
              },
            ],
          },
        ],
      };

      const result = toFlowBlocks(pmDoc);

      expect(result.blocks).toHaveLength(1);
      expect(result.bookmarks).toBeInstanceOf(Map);
      expect(result.bookmarks.size).toBe(1);
      expect(result.bookmarks.has('_Toc123456789')).toBe(true);
      expect(typeof result.bookmarks.get('_Toc123456789')).toBe('number');
    });

    it('tracks multiple bookmarks', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'bookmarkStart', attrs: { name: '_Toc1' } },
              { type: 'text', text: 'First' },
              { type: 'bookmarkEnd', attrs: { name: '_Toc1' } },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'bookmarkStart', attrs: { name: '_Toc2' } },
              { type: 'text', text: 'Second' },
              { type: 'bookmarkEnd', attrs: { name: '_Toc2' } },
            ],
          },
        ],
      };

      const result = toFlowBlocks(pmDoc);

      expect(result.bookmarks.size).toBe(2);
      expect(result.bookmarks.has('_Toc1')).toBe(true);
      expect(result.bookmarks.has('_Toc2')).toBe(true);

      // Second bookmark should have higher PM position
      const pos1 = result.bookmarks.get('_Toc1')!;
      const pos2 = result.bookmarks.get('_Toc2')!;
      expect(pos2).toBeGreaterThan(pos1);
    });

    it('does not track bookmarks when using toFlowBlocks (backward compat)', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'bookmarkStart', attrs: { name: '_Toc1' } },
              { type: 'text', text: 'Text' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      // toFlowBlocks returns FlowBlock[], not FlowBlocksResult
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
    });
  });

  describe('Table column widths (w:tblGrid)', () => {
    it('extracts column widths from grid attribute and converts twips to pixels', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            attrs: {
              grid: [
                { col: 2400 }, // 2400 twips = 160px at 96dpi (2400/1440*96)
                { col: 1800 }, // 1800 twips = 120px (1800/1440*96)
                { col: 3600 }, // 3600 twips = 240px (3600/1440*96)
              ],
            },
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 3' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('table');
      const tableBlock = blocks[0] as never;
      expect(tableBlock.columnWidths).toBeDefined();
      expect(tableBlock.columnWidths).toHaveLength(3);

      // Verify conversion: twips to pixels (twips / 1440 * 96)
      expect(tableBlock.columnWidths[0]).toBe(160);
      expect(tableBlock.columnWidths[1]).toBe(120);
      expect(tableBlock.columnWidths[2]).toBe(240);
    });

    it('handles missing grid attribute with undefined columnWidths', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            attrs: {},
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('table');
      const tableBlock = blocks[0] as never;
      // Should be undefined, allowing measurer to use equal distribution fallback
      expect(tableBlock.columnWidths).toBeUndefined();
    });

    it('filters out invalid (zero/negative) column widths', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            attrs: {
              grid: [
                { col: 2400 }, // Valid
                { col: 0 }, // Invalid - should be filtered
                { col: -100 }, // Invalid - should be filtered
                { col: 1800 }, // Valid
              ],
            },
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      const tableBlock = blocks[0] as never;
      expect(tableBlock.columnWidths).toBeDefined();
      // Should only include valid widths
      expect(tableBlock.columnWidths).toHaveLength(2);
      expect(tableBlock.columnWidths[0]).toBe(160);
      expect(tableBlock.columnWidths[1]).toBe(120);
    });

    it('returns undefined when all grid widths are invalid', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            attrs: {
              grid: [{ col: 0 }, { col: -100 }],
            },
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      const tableBlock = blocks[0] as never;
      // All widths filtered out, should be undefined
      expect(tableBlock.columnWidths).toBeUndefined();
    });

    it('handles empty grid array', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            attrs: {
              grid: [],
            },
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      const tableBlock = blocks[0] as never;
      expect(tableBlock.columnWidths).toBeUndefined();
    });
  });

  describe('page breaks', () => {
    it('converts hardBreak nodes to pageBreak blocks', () => {
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
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      // Should have at least para + pageBreak + para
      expect(blocks.length).toBeGreaterThanOrEqual(3);
      expect(blocks[0].kind).toBe('paragraph');
      const pageBreakBlock = blocks.find((b) => b.kind === 'pageBreak');
      expect(pageBreakBlock).toBeDefined();
      expect(pageBreakBlock?.kind).toBe('pageBreak');
    });

    it('handles hardBreak in the middle of paragraph content', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Before break' },
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
              { type: 'text', text: 'After break' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      // Should have: paragraph (before) + pageBreak + paragraph (after)
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      const pageBreakBlock = blocks.find((b) => b.kind === 'pageBreak');
      expect(pageBreakBlock).toBeDefined();
    });

    it('inserts a pageBreak block before paragraphs with pageBreakBefore property', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Page 1' }],
          },
          {
            type: 'paragraph',
            attrs: { paragraphProperties: { pageBreakBefore: true } },
            content: [{ type: 'text', text: 'Page 2' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const pageBreakIndex = blocks.findIndex((b) => b.kind === 'pageBreak');
      expect(pageBreakIndex).toBeGreaterThan(0);
      expect(blocks[pageBreakIndex + 1]?.kind).toBe('paragraph');
      expect(blocks[pageBreakIndex + 1]?.runs[0].text).toBe('Page 2');
    });

    it('respects top-level pageBreakBefore attribute', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { paragraphProperties: { pageBreakBefore: true } },
            content: [{ type: 'text', text: 'Starts new page' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks[0].kind).toBe('pageBreak');
      expect(blocks[1].kind).toBe('paragraph');
      expect(blocks[1].runs[0].text).toBe('Starts new page');
    });

    it('infers pageBreakBefore from OOXML elements without explicit value', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                pageBreakBefore: true,
              },
            },
            content: [{ type: 'text', text: 'OOXML page break' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks[0].kind).toBe('pageBreak');
      expect(blocks[1].kind).toBe('paragraph');
      expect(blocks[1].runs[0].text).toBe('OOXML page break');
    });

    it('infers pageBreakBefore from OOXML elements with explicit true value', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                pageBreakBefore: true,
              },
            },
            content: [{ type: 'text', text: 'Explicit true' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks[0].kind).toBe('pageBreak');
      expect(blocks[1].kind).toBe('paragraph');
    });

    it('does not insert pageBreak when pageBreakBefore is explicitly false', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                pageBreakBefore: false,
              },
            },
            content: [{ type: 'text', text: 'No break' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks.every((b) => b.kind !== 'pageBreak')).toBe(true);
    });

    it('handles pageBreakBefore with numeric values', () => {
      const pmDoc1 = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { paragraphProperties: { pageBreakBefore: 1 } },
            content: [{ type: 'text', text: 'Numeric 1' }],
          },
        ],
      };

      const { blocks: blocks1 } = toFlowBlocks(pmDoc1);
      expect(blocks1[0].kind).toBe('pageBreak');

      const pmDoc0 = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { paragraphProperties: { pageBreakBefore: 0 } },
            content: [{ type: 'text', text: 'Numeric 0' }],
          },
        ],
      };

      const { blocks: blocks0 } = toFlowBlocks(pmDoc0);
      expect(blocks0[0].kind).toBe('paragraph');
      expect(blocks0.every((b) => b.kind !== 'pageBreak')).toBe(true);
    });

    it('handles pageBreakBefore with string values', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { paragraphProperties: { pageBreakBefore: 'on' } },
            content: [{ type: 'text', text: 'String on' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks[0].kind).toBe('pageBreak');
    });

    it('marks paragraphs with w:bidi + adjustRightInd as RTL and mirrors indent', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                rightToLeft: true,
                adjustRightInd: true,
                indent: { left: 360, right: 180 }, // TWIPS: 360→24px, 180→12px
              },
            },
            content: [{ type: 'text', text: 'RTL paragraph' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks).toHaveLength(1);
      const paragraph = blocks[0];
      expect(paragraph.kind).toBe('paragraph');
      expect(paragraph.attrs?.direction).toBeUndefined();
      expect(paragraph.attrs?.rtl).toBeUndefined();
      expect(paragraph.attrs?.indent?.left).toBe(24);
      expect(paragraph.attrs?.indent?.right).toBe(12);
    });

    it('does not mark paragraphs as RTL when w:bidi is explicitly false', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                rightToLeft: false,
                adjustRightInd: true,
              },
            },
            content: [{ type: 'text', text: 'LTR paragraph' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      expect(blocks).toHaveLength(1);
      const paragraph = blocks[0];
      expect(paragraph.kind).toBe('paragraph');
      expect(paragraph.attrs?.direction).toBeUndefined();
      expect(paragraph.attrs?.rtl).toBeUndefined();
    });

    it('handles multiple page breaks', () => {
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

      const pageBreakBlocks = blocks.filter((b) => b.kind === 'pageBreak');
      expect(pageBreakBlocks).toHaveLength(2);
    });

    it('handles consecutive hardBreaks', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'First page' },
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
              { type: 'text', text: 'Third page' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlocks = blocks.filter((b) => b.kind === 'pageBreak');
      expect(pageBreakBlocks.length).toBeGreaterThanOrEqual(2);
    });

    it('handles hardBreak at the start of paragraph', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
              { type: 'text', text: 'Content after break' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlock = blocks.find((b) => b.kind === 'pageBreak');
      expect(pageBreakBlock).toBeDefined();
      const paragraphBlocks = blocks.filter((b) => b.kind === 'paragraph');
      expect(paragraphBlocks.length).toBeGreaterThanOrEqual(1);
    });

    it('handles hardBreak at the end of paragraph', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Content before break' },
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlock = blocks.find((b) => b.kind === 'pageBreak');
      expect(pageBreakBlock).toBeDefined();
      const paragraphBlocks = blocks.filter((b) => b.kind === 'paragraph');
      expect(paragraphBlocks.length).toBeGreaterThanOrEqual(1);
    });

    it('handles hardBreak with empty paragraphs', () => {
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
            content: [], // Empty paragraph
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Page 2' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlocks = blocks.filter((b) => b.kind === 'pageBreak');
      expect(pageBreakBlocks).toHaveLength(1);
    });

    it('handles hardBreak with marks and formatting', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Bold text',
                marks: [{ type: 'bold' }],
              },
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
              {
                type: 'text',
                text: 'Italic text',
                marks: [{ type: 'italic' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlock = blocks.find((b) => b.kind === 'pageBreak');
      expect(pageBreakBlock).toBeDefined();

      // Verify formatting is preserved on both sides of the break
      const paragraphBlocks = blocks.filter((b) => b.kind === 'paragraph');
      expect(paragraphBlocks.length).toBeGreaterThanOrEqual(2);
    });

    it('preserves pageBreak block IDs correctly', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Text' },
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlock = blocks.find((b) => b.kind === 'pageBreak');
      expect(pageBreakBlock?.id).toBeDefined();
      expect(typeof pageBreakBlock?.id).toBe('string');
      expect(pageBreakBlock?.id.length).toBeGreaterThan(0);
    });

    it('handles hardBreak mixed with images', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before image' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'image',
                attrs: {
                  src: 'data:image/png;base64,test',
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
            content: [{ type: 'text', text: 'After break' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlocks = blocks.filter((b) => b.kind === 'pageBreak');
      expect(pageBreakBlocks).toHaveLength(1);

      const imageBlocks = blocks.filter((b) => b.kind === 'image');
      expect(imageBlocks).toHaveLength(1);
    });

    it('handles hardBreak with runs containing multiple text nodes', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'run',
                content: [
                  { type: 'text', text: 'Part 1 ' },
                  { type: 'text', text: 'Part 2' },
                ],
              },
              { type: 'hardBreak', attrs: { pageBreakType: 'page' } },
              {
                type: 'run',
                content: [
                  { type: 'text', text: 'Part 3 ' },
                  { type: 'text', text: 'Part 4' },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      const pageBreakBlock = blocks.find((b) => b.kind === 'pageBreak');
      expect(pageBreakBlock).toBeDefined();
    });
  });

  describe('floatAlignment (framePr/@xAlign)', () => {
    it('extracts floatAlignment=right from paragraphProperties/w:framePr', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                framePr: {
                  wrap: 'none',
                  vAnchor: 'text',
                  hAnchor: 'margin',
                  xAlign: 'right',
                  y: 1,
                },
              },
            },
            content: [{ type: 'text', text: 'Right-aligned content' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.floatAlignment).toBe('right');
    });

    it('extracts floatAlignment=center from paragraphProperties/w:framePr', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                framePr: {
                  xAlign: 'center',
                },
              },
            },
            content: [{ type: 'text', text: 'Centered content' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.floatAlignment).toBe('center');
    });

    it('extracts floatAlignment=left from paragraphProperties/w:framePr', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                framePr: {
                  xAlign: 'left',
                },
              },
            },
            content: [{ type: 'text', text: 'Left-aligned content' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.floatAlignment).toBe('left');
    });

    it('does not extract floatAlignment when xAlign is missing', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                framePr: {
                  wrap: 'none',
                  y: 1,
                },
              },
            },
            content: [{ type: 'text', text: 'No alignment' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.floatAlignment).toBeUndefined();
    });

    it('does not extract floatAlignment when framePr is missing', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                justification: 'center',
              },
            },
            content: [{ type: 'text', text: 'Regular paragraph' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.floatAlignment).toBeUndefined();
    });

    it('accepts normalized xAlign values', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                framePr: {
                  xAlign: 'right',
                },
              },
            },
            content: [{ type: 'text', text: 'Uppercase alignment' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs?.floatAlignment).toBe('right');
    });

    it('works with page-number nodes (footer scenario)', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                framePr: {
                  wrap: 'none',
                  vAnchor: 'text',
                  hAnchor: 'margin',
                  xAlign: 'right',
                  y: 1,
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

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[0].attrs?.floatAlignment).toBe('right');
      expect(blocks[0].runs).toHaveLength(1);
      expect(blocks[0].runs[0].token).toBe('pageNumber');
    });

    it('preserves other paragraph attributes alongside floatAlignment', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                justification: 'left',
                spacing: { before: 150, after: 90 }, // 10px/6px in twips
                framePr: {
                  xAlign: 'right',
                },
              },
            },
            content: [{ type: 'text', text: 'Multiple attrs' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs).toMatchObject({
        alignment: 'left',
        spacing: { before: 10, after: 6 },
        floatAlignment: 'right',
      });
    });
  });

  describe('track changes', () => {
    const buildDocWithMarks = (marks: PMMark[]): PMNode => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Tracked',
              marks,
            },
          ],
        },
      ],
    });

    it('attaches tracked change metadata to runs', () => {
      const pmDoc = buildDocWithMarks([
        {
          type: 'trackInsert',
          attrs: {
            id: 'ins-1',
            author: 'Alex',
            authorEmail: 'alex@example.com',
            authorImage: 'https://example.com/avatar.png',
            date: '2024-01-01T00:00:00.000Z',
          },
        },
      ]);

      const { blocks } = toFlowBlocks(pmDoc);
      const run = blocks[0].runs[0] as never;
      expect(run.trackedChange).toMatchObject({
        kind: 'insert',
        id: 'ins-1',
        author: 'Alex',
        authorEmail: 'alex@example.com',
        date: '2024-01-01T00:00:00.000Z',
      });
      expect(blocks[0].attrs?.trackedChangesMode).toBe('review');
      expect(blocks[0].attrs?.trackedChangesEnabled).toBe(true);
    });

    it('hides insertions when trackedChangesMode is original', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Keep ' },
              {
                type: 'text',
                text: 'inserted',
                marks: [{ type: 'trackInsert', attrs: { id: 'ins-hide' } }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'original' });
      expect(blocks[0].runs.map((run) => run.text)).toEqual(['Keep ']);
    });

    it('hides deletions when trackedChangesMode is final', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'removed ',
                marks: [{ type: 'trackDelete', attrs: { id: 'del-hide' } }],
              },
              { type: 'text', text: 'stay' },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'final' });
      expect(blocks[0].runs.map((run) => run.text)).toEqual(['stay']);
    });

    it('strips metadata when feature disabled', () => {
      const pmDoc = buildDocWithMarks([{ type: 'trackInsert', attrs: { id: 'ins-disabled' } }]);

      const { blocks } = toFlowBlocks(pmDoc, { enableTrackedChanges: false });
      expect(blocks[0].runs[0]).not.toHaveProperty('trackedChange');
      expect(blocks[0].attrs?.trackedChangesEnabled).toBe(false);
    });

    it('preserves overlapping link metadata when track changes apply', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [
                  { type: 'link', attrs: { href: 'https://example.com' } },
                  { type: 'trackInsert', attrs: { id: 'tc-link' } },
                ],
                text: 'Linked text',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const run = blocks[0].runs[0] as never;
      expect(run.link?.href).toBe('https://example.com');
      expect(run.trackedChange).toMatchObject({ id: 'tc-link', kind: 'insert' });
    });

    it('captures before/after metadata for trackFormat marks', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [
                  {
                    type: 'trackFormat',
                    attrs: {
                      id: 'fmt-1',
                      before: [{ type: 'bold', attrs: {} }],
                      after: [{ type: 'italic', attrs: {} }],
                    },
                  },
                ],
                text: 'Styled',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);
      const change = (blocks[0].runs[0] as never).trackedChange;
      expect(change?.kind).toBe('format');
      expect(change?.before).toEqual([{ type: 'bold', attrs: {} }]);
      expect(change?.after).toEqual([{ type: 'italic', attrs: {} }]);
    });

    it('applies before marks in original mode for trackFormat changes', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [
                  { type: 'italic', attrs: {} }, // Current 'after' formatting
                  {
                    type: 'trackFormat',
                    attrs: {
                      id: 'fmt-original',
                      before: [{ type: 'bold', attrs: {} }],
                      after: [{ type: 'italic', attrs: {} }],
                    },
                  },
                ],
                text: 'Changed',
              },
            ],
          },
        ],
      };

      // In 'original' mode, should show 'before' formatting (bold, not italic)
      const { blocks: originalBlocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'original' });
      const originalRun = originalBlocks[0].runs[0] as never;
      expect(originalRun.bold).toBe(true);
      expect(originalRun.italic).toBeUndefined();
      expect(originalRun.trackedChange?.kind).toBe('format');

      // In 'review' mode, should show 'after' formatting (italic, not bold)
      const { blocks: reviewBlocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'review' });
      const reviewRun = reviewBlocks[0].runs[0] as never;
      expect(reviewRun.italic).toBe(true);
      expect(reviewRun.bold).toBeUndefined();

      // In 'final' mode, should also show 'after' formatting
      const { blocks: finalBlocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'final' });
      const finalRun = finalBlocks[0].runs[0] as never;
      expect(finalRun.italic).toBe(true);
      expect(finalRun.bold).toBeUndefined();
    });

    it('resets formatting when before marks are empty in trackFormat', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [
                  { type: 'bold', attrs: {} },
                  { type: 'italic', attrs: {} },
                  {
                    type: 'trackFormat',
                    attrs: {
                      id: 'fmt-reset',
                      before: [], // No formatting originally
                      after: [
                        { type: 'bold', attrs: {} },
                        { type: 'italic', attrs: {} },
                      ],
                    },
                  },
                ],
                text: 'Formatted later',
              },
            ],
          },
        ],
      };

      const { blocks: originalBlocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'original' });
      const run = originalBlocks[0].runs[0] as never;
      expect(run.bold).toBeUndefined();
      expect(run.italic).toBeUndefined();
    });

    it('respects track-delete metadata on inline images across modes', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const pmDoc: PMNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Before ' },
              {
                type: 'image',
                attrs: { src: dataUrl, size: { width: 10, height: 10 } },
                marks: [{ type: 'trackDelete', attrs: { id: 'del-img' } }],
              },
              { type: 'text', text: ' After' },
            ],
          },
        ],
      };

      const { blocks: reviewBlocks } = toFlowBlocks(pmDoc);
      const reviewImage = reviewBlocks.find((block): block is ImageBlock => block.kind === 'image');
      expect(reviewImage?.attrs?.trackedChange).toMatchObject({ id: 'del-img', kind: 'delete' });

      const { blocks: finalBlocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'final' });
      expect(finalBlocks.some((block) => block.kind === 'image')).toBe(false);

      const { blocks: originalBlocks } = toFlowBlocks(pmDoc, { trackedChangesMode: 'original' });
      expect(originalBlocks.some((block) => block.kind === 'image')).toBe(true);
    });

    describe('adversarial input protection', () => {
      it('rejects trackFormat marks with excessively large JSON payloads', () => {
        const hugeString = 'x'.repeat(15000);
        const pmDoc = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'trackFormat',
                      attrs: {
                        id: 'fmt-huge',
                        before: hugeString, // Exceeds 10KB limit
                        after: [{ type: 'bold', attrs: {} }],
                      },
                    },
                  ],
                  text: 'Text',
                },
              ],
            },
          ],
        };

        const { blocks } = toFlowBlocks(pmDoc);
        const run = blocks[0].runs[0] as never;
        // Should reject the malformed payload and not attach before/after
        expect(run.trackedChange?.before).toBeUndefined();
      });

      it('rejects trackFormat marks with excessively long arrays', () => {
        const hugeArray = Array(150).fill({ type: 'bold', attrs: {} });
        const pmDoc = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'trackFormat',
                      attrs: {
                        id: 'fmt-array',
                        before: hugeArray, // Exceeds 100 element limit
                        after: [{ type: 'italic', attrs: {} }],
                      },
                    },
                  ],
                  text: 'Text',
                },
              ],
            },
          ],
        };

        const { blocks } = toFlowBlocks(pmDoc);
        const run = blocks[0].runs[0] as never;
        expect(run.trackedChange?.before).toBeUndefined();
      });

      it('rejects trackFormat marks with deeply nested structures', () => {
        // Create a deeply nested structure exceeding depth limit
        let deepObject: Record<string, unknown> = { type: 'mark' };
        for (let i = 0; i < 10; i++) {
          deepObject = { nested: deepObject };
        }

        const pmDoc = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'trackFormat',
                      attrs: {
                        id: 'fmt-deep',
                        before: [deepObject], // Exceeds depth limit
                        after: [{ type: 'italic', attrs: {} }],
                      },
                    },
                  ],
                  text: 'Text',
                },
              ],
            },
          ],
        };

        const { blocks } = toFlowBlocks(pmDoc);
        const run = blocks[0].runs[0] as never;
        expect(run.trackedChange?.before).toBeUndefined();
      });

      it('handles malformed JSON strings gracefully', () => {
        const pmDoc = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'trackFormat',
                      attrs: {
                        id: 'fmt-bad-json',
                        before: '{invalid json', // Malformed JSON
                        after: [{ type: 'bold', attrs: {} }],
                      },
                    },
                  ],
                  text: 'Text',
                },
              ],
            },
          ],
        };

        const { blocks } = toFlowBlocks(pmDoc);
        const run = blocks[0].runs[0] as never;
        expect(run.trackedChange?.before).toBeUndefined();
      });
    });
  });

  describe('bidi alignment fallback', () => {
    it('defaults RTL paragraphs to right alignment when no explicit alignment', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                rightToLeft: true,
              },
            },
            content: [
              {
                type: 'text',
                text: 'مرحبا بالعالم', // Arabic text
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs).toMatchObject({
        alignment: undefined,
      });
    });

    it('respects explicit alignment on RTL paragraphs', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                rightToLeft: true,
                justification: 'center',
              },
            },
            content: [
              {
                type: 'text',
                text: 'مرحبا بالعالم',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs).toMatchObject({
        alignment: 'center',
      });
    });

    it('adjustRightInd overrides alignment to right', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {
              paragraphProperties: {
                rightToLeft: true,
                adjustRightInd: true,
                justification: 'left',
              },
            },
            content: [
              {
                type: 'text',
                text: 'مرحبا بالعالم',
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].attrs).toMatchObject({
        alignment: 'left',
      });
    });
  });

  describe('documentSection SDT metadata propagation', () => {
    it('applies section metadata to images inside documentSection', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'documentSection',
            attrs: {
              id: 'img-section',
              title: 'Image Section',
            },
            content: [
              {
                type: 'image',
                attrs: {
                  src: 'test.png',
                  size: { width: 100, height: 100 },
                },
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('image');

      const imageBlock = blocks[0] as ImageBlock;
      expect(imageBlock.attrs?.sdt).toBeDefined();
      expect(imageBlock.attrs?.sdt).toMatchObject({
        type: 'documentSection',
        id: 'img-section',
        title: 'Image Section',
      });
    });

    it('applies section metadata to paragraphs and tables inside documentSection', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'documentSection',
            attrs: {
              id: 'mixed-section',
              sectionType: 'standard',
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Para in section' }],
              },
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      {
                        type: 'tableCell',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Cell' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks.length).toBeGreaterThanOrEqual(2);

      // Paragraph should have section metadata
      const paraBlock = blocks.find((b) => b.kind === 'paragraph');
      expect(paraBlock?.attrs?.sdt).toMatchObject({
        type: 'documentSection',
        id: 'mixed-section',
        sectionType: 'standard',
      });

      // Table should have section metadata
      const tableBlock = blocks.find((b) => b.kind === 'table');
      expect(tableBlock?.attrs?.sdt).toMatchObject({
        type: 'documentSection',
        id: 'mixed-section',
      });
    });

    it('handles empty documentSection gracefully', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'documentSection',
            attrs: {
              id: 'empty-section',
            },
            content: [],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      // Empty section should not produce any blocks
      expect(blocks).toHaveLength(0);
    });

    it('does not apply section metadata to blocks outside documentSection', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Outside section' }],
          },
          {
            type: 'documentSection',
            attrs: { id: 'section-1' },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Inside section' }],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Also outside' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(3);

      // First paragraph should NOT have section metadata
      expect(blocks[0].attrs?.sdt).toBeUndefined();

      // Second paragraph (inside section) SHOULD have section metadata
      expect(blocks[1].attrs?.sdt).toMatchObject({
        type: 'documentSection',
        id: 'section-1',
      });

      // Third paragraph should NOT have section metadata
      expect(blocks[2].attrs?.sdt).toBeUndefined();
    });
  });

  describe('structuredContentBlock SDT metadata propagation', () => {
    it('applies structuredContent metadata to paragraphs inside structuredContentBlock', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'structuredContentBlock',
            attrs: {
              id: 'scb-123',
              tag: 'content-control',
              alias: 'My Content Control',
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Content inside SDT block' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[0].attrs?.sdt).toBeDefined();
      expect(blocks[0].attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-123',
        tag: 'content-control',
        alias: 'My Content Control',
      });
    });

    it('applies structuredContent metadata to multiple paragraphs inside structuredContentBlock', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'structuredContentBlock',
            attrs: {
              id: 'scb-multi',
            },
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
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(2);
      blocks.forEach((block, index) => {
        expect(block.kind).toBe('paragraph');
        expect(block.attrs?.sdt).toMatchObject({
          type: 'structuredContent',
          scope: 'block',
          id: 'scb-multi',
        });
      });
    });

    it('does not apply structuredContent metadata to blocks outside structuredContentBlock', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before SDT' }],
          },
          {
            type: 'structuredContentBlock',
            attrs: {
              id: 'scb-middle',
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Inside SDT' }],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'After SDT' }],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(3);

      // First paragraph should NOT have SDT metadata
      expect(blocks[0].attrs?.sdt).toBeUndefined();

      // Second paragraph (inside structuredContentBlock) should have SDT metadata
      expect(blocks[1].attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-middle',
      });

      // Third paragraph should NOT have SDT metadata
      expect(blocks[2].attrs?.sdt).toBeUndefined();
    });

    it('applies structuredContent metadata to tables inside structuredContentBlock', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'structuredContentBlock',
            attrs: {
              id: 'scb-table',
              tag: 'table-control',
              alias: 'Table Content Control',
            },
            content: [
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      {
                        type: 'tableCell',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Cell content' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('table');

      const tableBlock = blocks[0] as TableBlock;
      expect(tableBlock.attrs?.sdt).toBeDefined();
      expect(tableBlock.attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-table',
        tag: 'table-control',
        alias: 'Table Content Control',
      });
    });

    it('applies structuredContent metadata to mixed paragraphs and tables inside structuredContentBlock', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'structuredContentBlock',
            attrs: {
              id: 'scb-mixed',
              alias: 'Mixed Content',
            },
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Paragraph before table' }],
              },
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      {
                        type: 'tableCell',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Table cell' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Paragraph after table' }],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(3);

      // First paragraph should have SDT metadata
      expect(blocks[0].kind).toBe('paragraph');
      expect(blocks[0].attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-mixed',
        alias: 'Mixed Content',
      });

      // Table should have SDT metadata
      expect(blocks[1].kind).toBe('table');
      expect(blocks[1].attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-mixed',
        alias: 'Mixed Content',
      });

      // Third paragraph should have SDT metadata
      expect(blocks[2].kind).toBe('paragraph');
      expect(blocks[2].attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-mixed',
        alias: 'Mixed Content',
      });
    });

    it('does not apply structuredContent metadata to tables outside structuredContentBlock', () => {
      const pmDoc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Outside SDT' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'structuredContentBlock',
            attrs: {
              id: 'scb-inner',
            },
            content: [
              {
                type: 'table',
                content: [
                  {
                    type: 'tableRow',
                    content: [
                      {
                        type: 'tableCell',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Inside SDT' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const { blocks } = toFlowBlocks(pmDoc);

      expect(blocks).toHaveLength(2);

      // First table should NOT have SDT metadata
      expect(blocks[0].kind).toBe('table');
      expect(blocks[0].attrs?.sdt).toBeUndefined();

      // Second table (inside structuredContentBlock) should have SDT metadata
      expect(blocks[1].kind).toBe('table');
      expect(blocks[1].attrs?.sdt).toMatchObject({
        type: 'structuredContent',
        scope: 'block',
        id: 'scb-inner',
      });
    });
  });
});
