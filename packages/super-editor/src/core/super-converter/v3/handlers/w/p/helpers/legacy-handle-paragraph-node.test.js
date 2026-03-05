// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies used by the helper
vi.mock('@core/utilities/carbonCopy.js', () => ({
  carbonCopy: (obj) => JSON.parse(JSON.stringify(obj)),
}));

// Mock parseMarks/mergeTextNodes as vi.fn so tests can reconfigure
vi.mock('@converter/v2/importer/index.js', () => ({
  parseMarks: vi.fn(() => []),
  mergeTextNodes: vi.fn((content) => content),
}));

// Simple and predictable conversion for positions
vi.mock('@converter/helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    twipsToPixels: (twips) => (twips === undefined ? undefined : Number(twips) / 20),
    twipsToInches: (twips) => (twips === undefined ? undefined : Number(twips) / 10),
    twipsToLines: (twips) => (twips === undefined ? undefined : Number(twips) / 240),
    pixelsToTwips: (pixels) => (pixels === undefined ? undefined : Math.round(Number(pixels) * 20)),
  };
});

import { handleParagraphNode } from './legacy-handle-paragraph-node.js';
import { parseMarks, mergeTextNodes } from '@converter/v2/importer/index.js';

const makeParams = (overrides = {}) => {
  const defaultHandler = vi.fn(() => overrides._mockContent || []);
  const { nodeListHandler, ...rest } = overrides;
  return {
    filename: 'source.docx',
    docx: {},
    nodes: [
      {
        name: 'w:p',
        attributes: { 'w:rsidRDefault': 'ABCDEF' },
        elements: [],
      },
    ],
    nodeListHandler: {
      handlerEntities: nodeListHandler?.handlerEntities || [],
      handler: nodeListHandler?.handler || defaultHandler,
    },
    ...rest,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  parseMarks.mockReset().mockImplementation(() => []);
  mergeTextNodes.mockReset().mockImplementation((c) => c);
});

describe('legacy-handle-paragraph-node', () => {
  it('handles basic paragraph attributes and marks removal when empty content', () => {
    // Arrange pPr with jc, rPr marks, and style
    parseMarks.mockReturnValue([{ type: 'bold' }, { type: 'highlight' }]);
    const params = makeParams();
    params.nodes[0].elements = [
      {
        name: 'w:pPr',
        elements: [
          { name: 'w:jc', attributes: { 'w:val': 'right' } },
          { name: 'w:rPr' },
          { name: 'w:spacing', attributes: { 'w:after': '120', 'w:line': '240', 'w:lineRule': 'auto' } },
          { name: 'w:pStyle', attributes: { 'w:val': 'BodyText' } },
        ],
      },
    ];

    // Act
    const out = handleParagraphNode(params);

    // Assert
    expect(out.type).toBe('paragraph');
    expect(out.attrs.filename).toBe('source.docx');
    expect(out.attrs.paragraphProperties.justification).toBe('right');
    expect(out.attrs.paragraphProperties.styleId).toBe('BodyText');
    // spacing and rsid default
    expect(out.attrs.paragraphProperties.spacing).toEqual({ after: 120, line: 240, lineRule: 'auto' });
    expect(out.attrs.rsidRDefault).toBe('ABCDEF');
    // marks: highlight removed due to empty content
  });

  it('adds indent, borders, default justify, keep flags, dropcap and sectPr', () => {
    const params = makeParams();
    params.nodes[0].elements = [
      {
        name: 'w:pPr',
        elements: [
          { name: 'w:pBdr' },
          { name: 'w:keepLines', attributes: { 'w:val': '1' } },
          { name: 'w:keepNext', attributes: { 'w:val': 'true' } },
          { name: 'w:ind', attributes: { 'w:left': '200', 'w:right': '100', 'w:firstLine': '40', 'w:hanging': '0' } },
          { name: 'w:jc', attributes: { 'w:val': 'center' } },
          {
            name: 'w:pBdr',
            attributes: {},
            elements: [{ name: 'w:top', attributes: { 'w:val': 'single', 'w:sz': '4' } }],
          },
          {
            name: 'w:framePr',
            attributes: {
              'w:dropCap': 'drop',
              'w:lines': '3',
              'w:wrap': 'around',
              'w:hAnchor': 'margin',
              'w:vAnchor': 'text',
            },
          },
          { name: 'w:sectPr' },
        ],
      },
    ];

    const out = handleParagraphNode(params);

    expect(out.attrs.paragraphProperties.indent).toMatchObject({ left: 200, right: 100, firstLine: 40, hanging: 0 });
    expect(out.attrs.paragraphProperties.borders).toEqual({ top: { size: 4, val: 'single' } });
    expect(out.attrs.paragraphProperties.keepLines).toBe(true);
    expect(out.attrs.paragraphProperties.keepNext).toBe(true);
    expect(out.attrs.paragraphProperties.justification).toEqual('center');
    expect(out.attrs.paragraphProperties.framePr).toEqual({
      dropCap: 'drop',
      lines: 3,
      wrap: 'around',
      hAnchor: 'margin',
      vAnchor: 'text',
    });
    expect(out.attrs.paragraphProperties).toBeDefined();
    expect(out.attrs.pageBreakSource).toBe('sectPr');
  });

  it('parses tab stops and merges text nodes when content exists', () => {
    mergeTextNodes.mockImplementation(() => [{ type: 'text', text: 'merged' }]);

    const params = makeParams({
      _mockContent: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ],
    });
    params.nodes[0].elements = [
      {
        name: 'w:pPr',
        elements: [
          {
            name: 'w:tabs',
            elements: [
              { name: 'w:tab', attributes: { 'w:val': 'left', 'w:pos': '200', 'w:leader': 'dot' } },
              { name: 'w:tab', attributes: { 'w:val': 'right', 'w:pos': '400' } },
              { name: 'w:tab', attributes: { 'w:val': 'center' } },
            ],
          },
        ],
      },
    ];

    const out = handleParagraphNode(params);

    expect(mergeTextNodes).toHaveBeenCalled();
    expect(out.content).toEqual([{ type: 'text', text: 'merged' }]);
    expect(out.attrs.paragraphProperties.tabStops).toEqual([
      { tab: { tabType: 'left', pos: 200, leader: 'dot' } },
      { tab: { tabType: 'right', pos: 400 } },
      { tab: { tabType: 'center', pos: undefined } },
    ]);
  });
});
