import { handleParagraphNode } from '@converter/v2/importer/paragraphNodeImporter.js';
import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter.js';
import { getTestDataByFileName } from '@tests/helpers/helpers.js';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { getExportedResult } from '../export/export-helpers/index';
import { beforeAll, expect, vi } from 'vitest';
import { pixelsToTwips, linesToTwips } from '@converter/helpers';

const collectTexts = (paragraphNode) =>
  paragraphNode.content.flatMap((child) => {
    if (child.type === 'run' && Array.isArray(child.content)) {
      return child.content.filter((grand) => grand.type === 'text');
    }
    return child.type === 'text' ? [child] : [];
  });

const getParagraphProps = (node) => node.attrs.paragraphProperties || {};

describe('paragraph tests to check spacing', () => {
  let lists = {};
  beforeEach(() => {
    lists = {};
  });

  it('correctly gets spacing [paragraph_spacing_missing]', async () => {
    const dataName = 'paragraph_spacing_missing.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;
    const { nodes } = handleParagraphNode({
      nodes: [content[0]],
      docx,
      nodeListHandler: defaultNodeListHandler(),
      lists,
    });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');
    expect(node.content.length).toBeGreaterThan(0);

    const spacing = getParagraphProps(node).spacing;
    expect(spacing.line).toBe(linesToTwips(1.15));
    expect(spacing.after).toBeUndefined();
    expect(spacing.before).toBeUndefined();
  });

  it('correctly gets spacing [line_space_table]', async () => {
    const dataName = 'line_space_table.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;

    const tblNode = content[1];
    const trNode = tblNode.elements[2];
    const tcNode = trNode.elements[1];

    // Check all nodes after the known tcPr
    const { nodes } = handleParagraphNode({
      nodes: tcNode.elements.slice(1),
      docx,
      nodeListHandler: defaultNodeListHandler(),
      lists,
    });
    const node = nodes[0];

    expect(node.type).toBe('paragraph');
    expect(node.content.length).toBeGreaterThan(0);

    const spacing = getParagraphProps(node).spacing || {};

    expect(spacing.line).toBe(linesToTwips(1.15));
    expect(spacing.after).toBeUndefined();
    expect(spacing.before).toBeUndefined();
  });

  it('correctly gets spacing around image in p [image_p_spacing]', async () => {
    const dataName = 'image_p_spacing.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;

    const { nodes } = handleParagraphNode({
      nodes: [content[0]],
      docx,
      nodeListHandler: defaultNodeListHandler(),
      lists,
    });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');
    expect(node.content.length).toBeGreaterThan(0);

    const spacing = getParagraphProps(node).spacing;
    expect(spacing.line).toBe(linesToTwips(1.125));
    expect(spacing.after).toBeUndefined();
    expect(spacing.before).toBeUndefined();

    // Specifically, double check we have this important line rule to prevent image clipping
    // due to line height restriction
    expect(spacing.lineRule).toBe('auto');
  });

  it('correctly gets marks for empty paragraph', async () => {
    const dataName = 'doc_with_spacing.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;

    const { nodes } = handleParagraphNode({ nodes: [content[1]], docx, nodeListHandler: defaultNodeListHandler() });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');

    const spacing = getParagraphProps(node).spacing;
    expect(spacing.after).toBe(100);
    expect(spacing.before).toBe(100);
    expect(spacing.afterAutospacing).toBe(true);
    expect(spacing.beforeAutospacing).toBe(true);
    expect(spacing.line).toBe(276);
    expect(spacing.lineRule).toBe('auto');
  });

  it('correctly gets spaces from paragraph Normal styles', async () => {
    const dataName = 'doc_with_spacing.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;

    const { nodes } = handleParagraphNode({ nodes: [content[4]], docx, nodeListHandler: defaultNodeListHandler() });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');

    const spacing = getParagraphProps(node).spacing;
    expect(spacing).toBeUndefined();
  });

  it('correctly gets spacing from styles.xml by related styleId', async () => {
    const dataName = 'doc_with_spaces_from_styles.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;

    const { nodes } = handleParagraphNode({ nodes: [content[0]], docx, nodeListHandler: defaultNodeListHandler() });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');

    const spacing = getParagraphProps(node).spacing || {};
    expect(spacing.after).toBeUndefined();
    expect(spacing.before).toBe(320);
  });

  it('should return empty result for empty nodes', () => {
    const result = handleParagraphNode({
      nodes: [],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('should return empty result for non w:p node', () => {
    const result = handleParagraphNode({
      nodes: [{ name: 'w:r' }],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });
    expect(result).toEqual({ nodes: [], consumed: 0 });
  });

  it('correctly handles paragraph with text alignment', () => {
    const mockParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:jc',
              attributes: {
                'w:val': 'center',
              },
            },
          ],
        },
      ],
    };

    const { nodes } = handleParagraphNode({
      nodes: [mockParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');
    expect(getParagraphProps(node).justification).toBe('center');
  });

  it('correctly handles paragraph indentation in twips', () => {
    const mockParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:ind',
              attributes: {
                'w:left': '2880',
                'w:right': '1440',
                'w:firstLine': '720',
                'w:hanging': '270',
              },
            },
          ],
        },
      ],
    };

    const { nodes } = handleParagraphNode({
      nodes: [mockParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');
    // Keep raw twips values in indent object
    const indent = getParagraphProps(node).indent;
    expect(indent.left).toBe(pixelsToTwips(192));
    expect(indent.right).toBe(pixelsToTwips(96));
    expect(indent.firstLine).toBe(pixelsToTwips(48));
    expect(indent.hanging).toBe(pixelsToTwips(18));
  });

  it('hoists bibliography blocks out of wrapper paragraphs', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:pPr', elements: [] },
        {
          name: 'sd:bibliography',
          attributes: { instruction: 'BIBLIOGRAPHY' },
          elements: [{ name: 'w:p', elements: [] }],
        },
      ],
    };
    const handler = vi.fn(({ nodes }) => {
      const node = nodes[0];
      if (node.name === 'sd:bibliography') {
        return [{ type: 'bibliography', attrs: { instruction: node.attributes.instruction }, content: [] }];
      }
      return [];
    });

    const result = handleParagraphNode({
      nodes: [paragraph],
      docx: {},
      nodeListHandler: { handler },
      path: [],
    });

    expect(result).toEqual({
      nodes: [{ type: 'bibliography', attrs: { instruction: 'BIBLIOGRAPHY' }, content: [] }],
      consumed: 1,
    });
  });

  it('preserves paragraph text when hoisting bibliography blocks', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        { name: 'w:pPr', elements: [] },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Intro paragraph' }] }],
        },
        {
          name: 'sd:bibliography',
          attributes: { instruction: 'BIBLIOGRAPHY' },
          elements: [{ name: 'w:p', elements: [] }],
        },
      ],
    };
    const handler = vi.fn(({ nodes }) => {
      const node = nodes[0];
      if (node.name === 'sd:bibliography') {
        return [{ type: 'bibliography', attrs: { instruction: node.attributes.instruction }, content: [] }];
      }
      return defaultNodeListHandler().handler({ nodes, docx: {} });
    });

    const result = handleParagraphNode({
      nodes: [paragraph],
      docx: {},
      nodeListHandler: { handler },
      path: [],
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]?.type).toBe('paragraph');
    expect(result.nodes[1]).toEqual({
      type: 'bibliography',
      attrs: { instruction: 'BIBLIOGRAPHY' },
      content: [],
    });
  });

  it('correctly parses paragraph borders', () => {
    const mockParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:pBdr',
              elements: [
                {
                  name: 'w:bottom',
                  attributes: {
                    'w:val': 'single',
                    'w:sz': '8',
                    'w:space': '0',
                    'w:color': 'DDDDDD',
                  },
                },
              ],
            },
          ],
        },
        {
          name: 'w:r',
          elements: [{ name: 'w:t', elements: [{ type: 'text', text: 'Border text' }] }],
        },
      ],
    };

    const { nodes } = handleParagraphNode({
      nodes: [mockParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');
    const borders = getParagraphProps(node).borders;
    expect(borders).toBeDefined();
    expect(borders.bottom).toEqual({
      val: 'single',
      size: expect.any(Number),
      space: expect.any(Number),
      color: '#DDDDDD',
    });
  });

  it('captures all four border sides', () => {
    const sides = ['top', 'bottom', 'left', 'right'];
    const borderElements = sides.map((side) => ({
      name: `w:${side}`,
      attributes: {
        'w:val': 'single',
        'w:sz': '8',
        'w:color': '0000FF',
      },
    }));

    const mockParagraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:pBdr',
              elements: borderElements,
            },
          ],
        },
      ],
    };

    const { nodes } = handleParagraphNode({
      nodes: [mockParagraph],
      docx: {},
      nodeListHandler: defaultNodeListHandler(),
    });

    const p = nodes[0];
    const borders = getParagraphProps(p).borders;
    expect(borders).toBeDefined();
    sides.forEach((side) => {
      expect(borders[side]).toBeDefined();
      expect(borders[side].val).toBe('single');
      expect(borders[side].color).toBe('#0000FF');
    });
  });
});

describe('paragraph tests to check indentation', () => {
  it('correctly gets indents from paragraph Normal styles', async () => {
    const dataName = 'paragraph_indent_normal_styles.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;

    const { nodes } = handleParagraphNode({ nodes: [content[0]], docx, nodeListHandler: defaultNodeListHandler() });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');

    const indent = getParagraphProps(node).indent;
    expect(indent).toBeUndefined();
  });
});

describe('paragraph with dropcaps', () => {
  it('correctly gets dropcaps data', async () => {
    const dataName = 'dropcaps.docx';
    const docx = await getTestDataByFileName(dataName);
    const documentXml = docx['word/document.xml'];

    const doc = documentXml.elements[0];
    const body = doc.elements[0];
    const content = body.elements;

    const { nodes } = handleParagraphNode({ nodes: [content[1]], docx, nodeListHandler: defaultNodeListHandler() });

    const node = nodes[0];
    expect(node.type).toBe('paragraph');

    const framePr = getParagraphProps(node).framePr;
    expect(framePr.dropCap).toBe('drop');
  });
});

describe('Check that we can import list item with invalid list def with fallback', () => {
  const filename = 'invalid-list-def-fallback.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch, content, exported, body;
  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    content = editor.getJSON();
    exported = await getExportedResult(filename);
    body = exported.elements?.find((el) => el.name === 'w:body');
  });

  it('imports expected list item with fallback', async () => {
    const item = content.content[3];
    expect(item.type).toBe('paragraph');
    const [textNode] = collectTexts(item);
    expect(textNode?.type).toBe('text');
    expect(textNode?.text).toBe('NO VALID DEF');
  });

  it('exports first list item correctly', async () => {
    const item = body.elements[0];
    const pPr = item.elements.find((el) => el.name === 'w:pPr');
  });
});

describe('Check that paragraph-level sectPr is retained', () => {
  const filename = 'paragraph-sectpr-breaks.docx';
  let docx, media, mediaFiles, fonts, editor, dispatch, content;
  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename));
    ({ editor, dispatch } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
    content = editor.getJSON();
  });

  it('correctly imports sectPr inside paragraphs as section breaks', async () => {
    const p2 = content.content[2];
    const sectPr = p2.attrs.paragraphProperties.sectPr;
    expect(sectPr).toBeDefined();
    expect(p2.attrs.pageBreakSource).toBe('sectPr');

    const [textNode] = collectTexts(p2);
    expect(textNode?.text).toBe('TITLE');
  });

  it('correctly imports the first node alignment', async () => {
    const p1 = content.content[0];
    expect(getParagraphProps(p1).styleId).toBe('Title');
  });

  it('correctly exports the pass-through sectPr', () => {
    const { result: exported } = editor.converter.exportToXmlJson({
      data: editor.getJSON(),
      editor,
    });
    expect(exported).toBeDefined();
    expect(exported.elements.length).toBe(1);
    expect(exported.elements[0].name).toBe('w:body');

    const body = exported.elements[0];

    const p1 = content.content[1];
    expect(p1.attrs.pageBreakSource).toBe('sectPr');
    const p1sectPrData = p1.attrs.paragraphProperties.sectPr;
    expect(p1sectPrData).toBeDefined();

    // Check the empty paragraph for its sectPr
    const p1exported = body.elements[1];
    const pPr1 = p1exported.elements.find((el) => el.name === 'w:pPr');
    const sectPr1 = pPr1.elements.find((el) => el.name === 'w:sectPr');
    expect(p1sectPrData).toEqual(sectPr1);

    const p2 = content.content[2];
    const p2sectPrData = p2.attrs.paragraphProperties.sectPr;
    const p2Exported = body.elements[2];
    const pPr2 = p2Exported.elements.find((el) => el.name === 'w:pPr');
    const sectPr2 = pPr2.elements.find((el) => el.name === 'w:sectPr');
    expect(p2sectPrData).toEqual(sectPr2);
  });

  describe('paragraph tests to check tab stops', () => {
    it('correctly handles paragraph with tab stops', () => {
      const mockParagraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [
              {
                name: 'w:tabs',
                elements: [
                  {
                    name: 'w:tab',
                    attributes: {
                      'w:val': 'start',
                      'w:pos': '2160',
                    },
                  },
                  {
                    name: 'w:tab',
                    attributes: {
                      'w:val': 'center',
                      'w:pos': '5040',
                      'w:leader': 'dot',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { nodes } = handleParagraphNode({
        nodes: [mockParagraph],
        docx: {},
        nodeListHandler: defaultNodeListHandler(),
      });

      const node = nodes[0];
      expect(node.type).toBe('paragraph');
      const tabStops = getParagraphProps(node).tabStops;
      expect(tabStops).toBeDefined();
      expect(tabStops.length).toBe(2);

      const firstTab = tabStops[0].tab;
      expect(firstTab.tabType).toBe('start');
      expect(firstTab.pos).toBe(2160);
      expect(firstTab.leader).toBeUndefined();

      const secondTab = tabStops[1].tab;
      expect(secondTab.tabType).toBe('center');
      expect(secondTab.pos).toBe(5040);
      expect(secondTab.leader).toBe('dot');
    });

    it('correctly handles paragraph without tab stops', () => {
      const mockParagraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [],
          },
        ],
      };

      const { nodes } = handleParagraphNode({
        nodes: [mockParagraph],
        docx: {},
        nodeListHandler: defaultNodeListHandler(),
      });

      const node = nodes[0];
      expect(node.type).toBe('paragraph');
      expect(getParagraphProps(node).tabStops).toBeUndefined();
    });

    it('correctly handles empty tabs element', () => {
      const mockParagraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [
              {
                name: 'w:tabs',
                elements: [],
              },
            ],
          },
        ],
      };

      const { nodes } = handleParagraphNode({
        nodes: [mockParagraph],
        docx: {},
        nodeListHandler: defaultNodeListHandler(),
      });

      const node = nodes[0];
      expect(node.type).toBe('paragraph');
      expect(getParagraphProps(node).tabStops).toEqual([]);
    });

    it('correctly handles tab with default values', () => {
      const mockParagraph = {
        name: 'w:p',
        elements: [
          {
            name: 'w:pPr',
            elements: [
              {
                name: 'w:tabs',
                elements: [
                  {
                    name: 'w:tab',
                    attributes: {
                      'w:pos': '1440',
                      // No w:val provided, should default to 'start'
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { nodes } = handleParagraphNode({
        nodes: [mockParagraph],
        docx: {},
        nodeListHandler: defaultNodeListHandler(),
      });

      const node = nodes[0];
      expect(node.type).toBe('paragraph');
      const tabStops = getParagraphProps(node).tabStops;
      expect(tabStops).toBeDefined();
      expect(tabStops.length).toBe(1);

      const tab = tabStops[0].tab;
      expect(tab.tabType).toBeUndefined();
      expect(tab.pos).toBe(pixelsToTwips(96));
    });
  });
});
