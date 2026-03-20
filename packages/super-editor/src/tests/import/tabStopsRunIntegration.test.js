import { describe, it, expect } from 'vitest';
import { defaultNodeListHandler } from '@converter/v2/importer/docxImporter.js';
import { handleParagraphNode } from '@converter/v2/importer/paragraphNodeImporter.js';

const buildRun = (children, runProps = []) => ({
  name: 'w:r',
  elements: [
    ...(runProps.length
      ? [
          {
            name: 'w:rPr',
            elements: runProps,
          },
        ]
      : []),
    ...children,
  ],
});

const buildText = (text) => ({
  name: 'w:t',
  elements: [{ type: 'text', text }],
});

const buildTab = (attrs = {}) => ({
  name: 'w:tab',
  attributes: attrs,
});

describe('tab stop import with run translator', () => {
  it('preserves tab nodes between styled runs', () => {
    const paragraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:tabs',
              elements: [
                { name: 'w:tab', attributes: { 'w:val': 'left', 'w:pos': '1440' } },
                { name: 'w:tab', attributes: { 'w:val': 'center', 'w:pos': '2880' } },
              ],
            },
          ],
        },
        buildRun(
          [buildText('Left')],
          [
            {
              name: 'w:rFonts',
              attributes: { 'w:ascii': 'Arial' },
            },
          ],
        ),
        buildRun(
          [buildTab({ 'w:val': 'left', 'w:pos': '1440' })],
          [
            {
              name: 'w:rFonts',
              attributes: { 'w:ascii': 'Arial' },
            },
          ],
        ),
        buildRun(
          [buildText('Middle')],
          [
            { name: 'w:b', attributes: {} },
            {
              name: 'w:rFonts',
              attributes: { 'w:ascii': 'Arial' },
            },
          ],
        ),
        buildRun(
          [buildTab({ 'w:val': 'center', 'w:pos': '2880' })],
          [
            {
              name: 'w:rFonts',
              attributes: { 'w:ascii': 'Arial' },
            },
          ],
        ),
        buildRun([buildText('Right')], [{ name: 'w:rFonts', attributes: { 'w:ascii': 'Arial' } }]),
      ],
    };

    const handler = defaultNodeListHandler();
    const docx = {
      'word/styles.xml': {
        elements: [
          {
            name: 'w:styles',
            elements: [
              {
                name: 'w:docDefaults',
                elements: [
                  {
                    name: 'w:pPrDefault',
                    elements: [
                      {
                        name: 'w:pPr',
                        elements: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const { nodes } = handleParagraphNode({
      nodes: [paragraph],
      docx,
      nodeListHandler: handler,
    });

    const [node] = nodes;
    if (process.env.DEBUG_TAB?.length) {
      console.log(JSON.stringify(node, null, 2));
    }
    expect(node.type).toBe('paragraph');
    expect(node.attrs.indent).toBeUndefined();
    const runTypes = node.content.map((child) => child.type);
    expect(runTypes).toEqual(['run', 'run', 'run', 'run', 'run']);

    const firstChildTypes = node.content.map((child) => child.content?.[0]?.type);
    expect(firstChildTypes).toEqual(['text', 'tab', 'text', 'tab', 'text']);
    expect(node.attrs.paragraphProperties?.tabStops).toEqual([
      { tab: { tabType: 'left', pos: 1440 } },
      { tab: { tabType: 'center', pos: 2880 } },
    ]);

    const [leftRun, firstTabRun, middleRun] = node.content;
    const leftText = leftRun.content[0];
    const middleText = middleRun.content[0];
    const firstTab = firstTabRun.content[0];
    expect(leftText.text).toBe('Left');
    expect(middleText.text).toBe('Middle');
    expect(firstTab.type).toBe('tab');

    const textStyle = node.content.at(-1).content[0].marks.find((mark) => mark.type === 'textStyle');
    expect(textStyle?.attrs?.fontFamily).toBe('Arial, sans-serif');

    const leftTextStyle = leftText.marks.find((mark) => mark.type === 'textStyle');
    expect(leftTextStyle).toBeDefined();
    expect(leftTextStyle.attrs.fontFamily).toBe('Arial, sans-serif');
  });

  it('keeps consecutive tabs when they appear in a single run', () => {
    const runWithDoubleTab = {
      name: 'w:r',
      elements: [
        buildText('Start'),
        buildTab({ 'w:val': 'left', 'w:pos': '1440' }),
        buildTab({ 'w:val': 'left', 'w:pos': '2880' }),
        buildText('End'),
      ],
    };

    const paragraph = {
      name: 'w:p',
      elements: [
        {
          name: 'w:pPr',
          elements: [
            {
              name: 'w:tabs',
              elements: [
                { name: 'w:tab', attributes: { 'w:val': 'left', 'w:pos': '1440' } },
                { name: 'w:tab', attributes: { 'w:val': 'left', 'w:pos': '2880' } },
              ],
            },
          ],
        },
        runWithDoubleTab,
      ],
    };

    const handler = defaultNodeListHandler();
    const { nodes } = handleParagraphNode({
      nodes: [paragraph],
      docx: {
        'word/styles.xml': {
          elements: [
            {
              name: 'w:styles',
              elements: [
                {
                  name: 'w:docDefaults',
                  elements: [
                    {
                      name: 'w:rPrDefault',
                      elements: [
                        {
                          name: 'w:rPr',
                          elements: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      nodeListHandler: handler,
    });

    const paragraphNode = nodes[0];
    const tabNodes = paragraphNode.content.flatMap((child) =>
      Array.isArray(child.content) ? child.content.filter((inner) => inner.type === 'tab') : [],
    );
    expect(tabNodes.length).toBe(2);
    expect(paragraphNode.content).toHaveLength(1);
    expect(paragraphNode.content[0].content.map((grand) => grand.type)).toEqual(['text', 'tab', 'tab', 'text']);
  });
});
