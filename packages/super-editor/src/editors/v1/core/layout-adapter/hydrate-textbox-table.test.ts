import { describe, it, expect } from 'vitest';
import { buildPositionMap, createBlockIdGenerator, hydrateTextboxTableParts } from './utilities.js';
import { tableNodeToBlock } from './converters/table.js';
import { paragraphToFlowBlocks } from './converters/paragraph.js';
import type { ParagraphBlock, TableBlock, VectorShapeDrawing } from '@superdoc/contracts';
import type { PMNode } from './types.js';

const DEFAULT_CONVERTER_CONTEXT = {
  docx: {},
  translatedLinkedStyles: { docDefaults: {}, latentStyles: {}, styles: {} },
  translatedNumbering: { abstracts: {}, definitions: {} },
};

const detachedTablePm: PMNode = {
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
              attrs: {
                paragraphProperties: {
                  tabStops: [{ val: 'left', pos: 1420, leader: null }],
                },
              },
              content: [{ type: 'text', text: 'KvK' }, { type: 'tab' }, { type: 'text', text: 'KvK_number' }],
            },
          ],
        },
      ],
    },
  ],
};

const shapeBlock: VectorShapeDrawing = {
  kind: 'drawing',
  drawingKind: 'vectorShape',
  id: 'header-textbox-shape',
  geometry: { width: 400, height: 80, rotation: 0, flipH: false, flipV: false },
  textContent: {
    parts: [{ kind: 'table', text: '', tablePm: detachedTablePm }],
  },
};

describe('hydrateTextboxTableParts', () => {
  it('preserves tab runs when tablePm is outside the header position map', () => {
    const headerDoc: PMNode = { type: 'doc', content: [] };
    const headerPositions = buildPositionMap(headerDoc);

    const [hydrated] = hydrateTextboxTableParts([shapeBlock], {
      nextBlockId: createBlockIdGenerator('test-'),
      positions: headerPositions,
      trackedChangesConfig: { mode: 'review', enabled: true },
      bookmarks: new Map(),
      hyperlinkConfig: { enableRichHyperlinks: false },
      converterContext: DEFAULT_CONVERTER_CONTEXT,
      converters: { tableNodeToBlock, paragraphToFlowBlocks },
      enableComments: true,
    });

    const shape = hydrated as VectorShapeDrawing;
    const tableBlock = shape.textContent?.parts?.[0]?.tableBlock as TableBlock;
    const para = tableBlock.rows[0]?.cells[0]?.blocks[0] as ParagraphBlock;

    expect(para.runs.some((r) => r.kind === 'tab')).toBe(true);
    expect(para.runs.some((r) => 'text' in r && r.text === 'KvK_number')).toBe(true);
  });
});
