import { describe, expect, it } from 'vitest';
import type { FlowBlock, ParagraphBlock, TableBlock, TextRun } from '@superdoc/contracts';
import { toFlowBlocks as baseToFlowBlocks, FlowBlockCache } from './index.js';
import { resolveSequenceFieldTokens } from './resolve-sequence-fields.js';
import type { AdapterOptions, PMNode } from './index.js';

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

const seq = (attrs: Record<string, unknown> = {}) => ({
  type: 'sequenceField',
  attrs: {
    instruction: 'SEQ Figure',
    identifier: 'Figure',
    sequenceMode: 'next',
    hideResult: false,
    restartNumber: null,
    restartLevel: null,
    format: 'Arabic',
    hasGeneralFormat: false,
    pageNumberFieldFormat: null,
    numericPictureFormat: null,
    resolvedNumber: '',
    ...attrs,
  },
});

const paragraph = (content: PMNode['content'] = [], attrs: Record<string, unknown> = {}) => ({
  type: 'paragraph',
  attrs,
  content,
});

const stableParagraph = (id: string, content: PMNode['content'] = []) =>
  paragraph(content, { sdBlockId: id, sdBlockRev: 1 });

const tableWithCellContent = (content: PMNode['content']) => ({
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: [
        {
          type: 'tableCell',
          content,
        },
      ],
    },
  ],
});

const textRuns = (blocks: FlowBlock[]): TextRun[] => {
  const runs: TextRun[] = [];
  const visit = (block: FlowBlock) => {
    if (block.kind === 'paragraph') {
      for (const run of (block as ParagraphBlock).runs) {
        if ('text' in run) runs.push(run as TextRun);
      }
      return;
    }
    if (block.kind === 'table') {
      for (const row of (block as TableBlock).rows) {
        for (const cell of row.cells) {
          for (const childBlock of cell.blocks ?? (cell.paragraph ? [cell.paragraph] : [])) {
            visit(childBlock);
          }
        }
      }
      return;
    }
    if (block.kind === 'list') {
      for (const item of block.items) {
        visit(item.paragraph);
      }
    }
  };
  blocks.forEach(visit);
  return runs;
};

const runTexts = (blocks: FlowBlock[]) => textRuns(blocks).map((run) => run.text);

describe('resolveSequenceFieldTokens', () => {
  it('renders two cached-empty sequence fields as 1 and 2', () => {
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [paragraph([seq()]), paragraph([seq()])],
    });

    expect(runTexts(blocks)).toEqual(['1', '2']);
    expect(textRuns(blocks).map((run) => run.token)).toEqual(['seq', 'seq']);
  });

  it('keeps interleaved identifiers independent', () => {
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [
        paragraph([seq({ identifier: 'Figure' })]),
        paragraph([seq({ identifier: 'Table', instruction: 'SEQ Table' })]),
        paragraph([seq({ identifier: 'Figure' })]),
      ],
    });

    expect(runTexts(blocks)).toEqual(['1', '1', '2']);
  });

  it('repeats the prior display for current mode', () => {
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [paragraph([seq()]), paragraph([seq({ sequenceMode: 'current', instruction: 'SEQ Figure \\c' })])],
    });

    expect(runTexts(blocks)).toEqual(['1', '1']);
  });

  it('honors restartNumber and continues from it', () => {
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [paragraph([seq({ restartNumber: 10, instruction: 'SEQ Figure \\r 10' })]), paragraph([seq()])],
    });

    expect(runTexts(blocks)).toEqual(['10', '11']);
  });

  it('hides hidden results while still advancing the counter', () => {
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [
        paragraph([seq()]),
        paragraph([seq({ hideResult: true, instruction: 'SEQ Figure \\h' })]),
        paragraph([seq()]),
      ],
    });

    expect(runTexts(blocks)).toEqual(['1', '', '3']);
  });

  it('lets hidden restart-zero fields seed the next visible value at one', () => {
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [
        paragraph([
          seq({
            instruction: 'seq level2 \\h \\r0',
            identifier: 'level2',
            hideResult: true,
            restartNumber: 0,
          }),
        ]),
        paragraph([seq({ instruction: 'seq level2 \\*arabic', identifier: 'level2', hasGeneralFormat: true })]),
      ],
    });

    expect(runTexts(blocks)).toEqual(['', '1']);
  });

  it('restarts after resolved heading-level paragraphs', () => {
    const headingAttrs = { paragraphProperties: { outlineLvl: 0 } };
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [
        paragraph([{ type: 'text', text: 'Chapter 1' }], headingAttrs),
        paragraph([seq({ restartLevel: 1, instruction: 'SEQ Figure \\s 1' })]),
        paragraph([seq({ restartLevel: 1, instruction: 'SEQ Figure \\s 1' })]),
        paragraph([{ type: 'text', text: 'Chapter 2' }], headingAttrs),
        paragraph([seq({ restartLevel: 1, instruction: 'SEQ Figure \\s 1' })]),
      ],
    });

    expect(runTexts(blocks)).toEqual(['Chapter 1', '1', '2', 'Chapter 2', '1']);
  });

  it('applies page-number and numeric-picture formats', () => {
    const roman = toFlowBlocks({
      type: 'doc',
      content: [
        paragraph([seq({ pageNumberFieldFormat: { format: 'lowerRoman' }, hasGeneralFormat: true })]),
        paragraph([seq({ pageNumberFieldFormat: { format: 'lowerRoman' }, hasGeneralFormat: true })]),
      ],
    });
    const picture = toFlowBlocks({
      type: 'doc',
      content: [
        paragraph([seq({ numericPictureFormat: { picture: '00' } })]),
        paragraph([seq({ numericPictureFormat: { picture: '00' } })]),
      ],
    });

    expect(runTexts(roman.blocks)).toEqual(['i', 'ii']);
    expect(runTexts(picture.blocks)).toEqual(['01', '02']);
  });

  it('isolates counters across separate toFlowBlocks calls', () => {
    const doc = { type: 'doc', content: [paragraph([seq()])] };

    expect(runTexts(toFlowBlocks(doc).blocks)).toEqual(['1']);
    expect(runTexts(toFlowBlocks(doc).blocks)).toEqual(['1']);
  });

  it('counts sequence fields inside table cells in document order', () => {
    const { blocks } = toFlowBlocks({
      type: 'doc',
      content: [paragraph([seq()]), tableWithCellContent([paragraph([seq()])]), paragraph([seq()])],
    });

    expect(runTexts(blocks)).toEqual(['1', '2', '3']);
  });

  it('renumbers cache-hit paragraphs after a sequence field is inserted above them', () => {
    const cache = new FlowBlockCache();
    const firstDoc = {
      type: 'doc',
      content: [stableParagraph('p1', [seq()]), stableParagraph('p2', [seq()]), stableParagraph('p3', [seq()])],
    };
    expect(runTexts(toFlowBlocks(firstDoc, { flowBlockCache: cache }).blocks)).toEqual(['1', '2', '3']);

    const secondDoc = {
      type: 'doc',
      content: [
        stableParagraph('p1', [seq()]),
        stableParagraph('inserted', [seq()]),
        stableParagraph('p2', [seq()]),
        stableParagraph('p3', [seq()]),
      ],
    };
    const { blocks } = toFlowBlocks(secondDoc, { flowBlockCache: cache });

    expect(cache.stats.hits).toBeGreaterThanOrEqual(3);
    expect(runTexts(blocks)).toEqual(['1', '2', '3', '4']);
  });

  it('walks list item paragraphs when list blocks are present', () => {
    const seqRun = (identifier = 'Figure'): TextRun => ({
      text: '1',
      token: 'seq',
      seqMetadata: { identifier, cachedText: '' },
      fontFamily: 'Times New Roman, serif',
      fontSize: 12,
    });
    const blocks: FlowBlock[] = [
      {
        kind: 'list',
        id: 'list-1',
        listType: 'number',
        items: [
          {
            id: 'item-1',
            marker: { text: '1.', width: 10 },
            paragraph: { kind: 'paragraph', id: 'p1', runs: [seqRun()] },
          },
          {
            id: 'item-2',
            marker: { text: '2.', width: 10 },
            paragraph: { kind: 'paragraph', id: 'p2', runs: [seqRun()] },
          },
        ],
      },
    ];

    resolveSequenceFieldTokens(blocks);

    expect(runTexts(blocks)).toEqual(['1', '2']);
  });
});
