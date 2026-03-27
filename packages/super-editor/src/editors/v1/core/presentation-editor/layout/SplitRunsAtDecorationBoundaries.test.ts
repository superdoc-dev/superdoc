import { describe, expect, it } from 'vitest';

import type { FlowBlock, ListBlock, ParagraphBlock, TableBlock, TextRun, ImageRun } from '@superdoc/contracts';
import { splitRunsAtDecorationBoundaries, type DecorationRange } from './SplitRunsAtDecorationBoundaries.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal TextRun with positional metadata. */
const textRun = (text: string, pmStart: number, pmEnd: number): TextRun =>
  ({ text, pmStart, pmEnd, fontFamily: 'Arial', fontSize: 12 }) as TextRun;

/** Creates a minimal ParagraphBlock. */
const paragraph = (runs: TextRun[], id = 'p1'): ParagraphBlock => ({
  kind: 'paragraph',
  id,
  runs,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('splitRunsAtDecorationBoundaries', () => {
  // -----------------------------------------------------------------------
  // Identity / no-op cases
  // -----------------------------------------------------------------------

  it('returns blocks unchanged when ranges is empty', () => {
    const blocks: FlowBlock[] = [paragraph([textRun('Hello', 0, 5)])];
    const result = splitRunsAtDecorationBoundaries(blocks, []);
    expect(result).toBe(blocks);
  });

  it('returns runs unchanged when no boundaries fall inside any run', () => {
    const run = textRun('Hello', 5, 10);
    const blocks: FlowBlock[] = [paragraph([run])];
    // Boundaries at 0 and 15 are outside the run [5–10].
    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 0, to: 15 }]);
    expect(result[0].kind).toBe('paragraph');
    expect((result[0] as ParagraphBlock).runs).toHaveLength(1);
  });

  it('returns runs unchanged when boundary equals run start or end', () => {
    const run = textRun('Hello', 5, 10);
    const blocks: FlowBlock[] = [paragraph([run])];
    // Boundaries exactly at 5 and 10: not strictly inside (5,10), so no split.
    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 5, to: 10 }]);
    expect((result[0] as ParagraphBlock).runs).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Single run splitting
  // -----------------------------------------------------------------------

  it('splits a run at a single interior boundary', () => {
    const blocks: FlowBlock[] = [paragraph([textRun('Hello world', 5, 16)])];
    // Decoration covers "Hello" [5–10], boundary at 10 splits the run.
    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 5, to: 10 }]);
    const runs = (result[0] as ParagraphBlock).runs as TextRun[];

    expect(runs).toHaveLength(2);
    expect(runs[0].text).toBe('Hello');
    expect(runs[0].pmStart).toBe(5);
    expect(runs[0].pmEnd).toBe(10);
    expect(runs[1].text).toBe(' world');
    expect(runs[1].pmStart).toBe(10);
    expect(runs[1].pmEnd).toBe(16);
  });

  it('splits a run at two boundaries producing three segments', () => {
    const blocks: FlowBlock[] = [paragraph([textRun('Hello world!', 0, 12)])];
    // Decoration covers "llo w" [2–7].
    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 2, to: 7 }]);
    const runs = (result[0] as ParagraphBlock).runs as TextRun[];

    expect(runs).toHaveLength(3);
    expect(runs[0]).toMatchObject({ text: 'He', pmStart: 0, pmEnd: 2 });
    expect(runs[1]).toMatchObject({ text: 'llo w', pmStart: 2, pmEnd: 7 });
    expect(runs[2]).toMatchObject({ text: 'orld!', pmStart: 7, pmEnd: 12 });
  });

  it('preserves non-positional run properties on split segments', () => {
    const run = textRun('abcdef', 0, 6);
    (run as Record<string, unknown>).fontFamily = 'Courier';
    (run as Record<string, unknown>).bold = true;
    const blocks: FlowBlock[] = [paragraph([run])];

    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 3, to: 5 }]);
    const runs = (result[0] as ParagraphBlock).runs as TextRun[];

    for (const seg of runs) {
      expect(seg.fontFamily).toBe('Courier');
      expect((seg as Record<string, unknown>).bold).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Non-text runs
  // -----------------------------------------------------------------------

  it('passes non-text runs through unchanged', () => {
    const imgRun = { kind: 'image', pmStart: 5, pmEnd: 6, src: 'img.png' } as unknown as ImageRun;
    const blocks: FlowBlock[] = [{ kind: 'paragraph', id: 'p1', runs: [imgRun] }];

    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 5, to: 6 }]);
    expect((result[0] as ParagraphBlock).runs).toHaveLength(1);
    expect((result[0] as ParagraphBlock).runs[0]).toEqual(imgRun);
  });

  it('passes text runs without pmStart/pmEnd through unchanged', () => {
    const run = { text: 'no positions', fontFamily: 'Arial', fontSize: 12 } as TextRun;
    const blocks: FlowBlock[] = [paragraph([run])];

    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 0, to: 5 }]);
    expect((result[0] as ParagraphBlock).runs).toHaveLength(1);
    expect(((result[0] as ParagraphBlock).runs[0] as TextRun).text).toBe('no positions');
  });

  // -----------------------------------------------------------------------
  // Multiple decoration ranges
  // -----------------------------------------------------------------------

  it('handles multiple overlapping ranges by deduplicating boundaries', () => {
    const blocks: FlowBlock[] = [paragraph([textRun('abcdefghij', 0, 10)])];
    const ranges: DecorationRange[] = [
      { from: 2, to: 5 },
      { from: 3, to: 7 },
    ];
    // Unique boundaries inside [0,10]: 2, 3, 5, 7.
    const result = splitRunsAtDecorationBoundaries(blocks, ranges);
    const runs = (result[0] as ParagraphBlock).runs as TextRun[];

    expect(runs).toHaveLength(5);
    expect(runs.map((r) => r.text)).toEqual(['ab', 'c', 'de', 'fg', 'hij']);
  });

  // -----------------------------------------------------------------------
  // Does not mutate input
  // -----------------------------------------------------------------------

  it('does not mutate the original blocks array', () => {
    const originalRun = textRun('Hello world', 0, 11);
    const originalParagraph = paragraph([originalRun]);
    const blocks: FlowBlock[] = [originalParagraph];

    splitRunsAtDecorationBoundaries(blocks, [{ from: 5, to: 8 }]);

    expect(originalParagraph.runs).toHaveLength(1);
    expect((originalParagraph.runs[0] as TextRun).text).toBe('Hello world');
  });

  // -----------------------------------------------------------------------
  // Table blocks
  // -----------------------------------------------------------------------

  it('splits runs inside table cell paragraphs', () => {
    const table: TableBlock = {
      kind: 'table',
      id: 't1',
      rows: [
        {
          cells: [
            {
              blocks: [paragraph([textRun('cell text', 10, 19)])],
            },
          ],
        },
      ],
    } as unknown as TableBlock;

    const result = splitRunsAtDecorationBoundaries([table], [{ from: 14, to: 17 }]);
    const resultTable = result[0] as TableBlock;
    const cellBlocks = resultTable.rows[0].cells[0].blocks!;
    const runs = (cellBlocks[0] as ParagraphBlock).runs as TextRun[];

    expect(runs).toHaveLength(3);
    expect(runs[0]).toMatchObject({ text: 'cell', pmStart: 10, pmEnd: 14 });
    expect(runs[1]).toMatchObject({ text: ' te', pmStart: 14, pmEnd: 17 });
    expect(runs[2]).toMatchObject({ text: 'xt', pmStart: 17, pmEnd: 19 });
  });

  // -----------------------------------------------------------------------
  // List blocks
  // -----------------------------------------------------------------------

  it('splits runs inside list item paragraphs', () => {
    const list: ListBlock = {
      kind: 'list',
      id: 'l1',
      listType: 'bullet',
      items: [{ paragraph: paragraph([textRun('list item', 20, 29)]) }],
    };

    const result = splitRunsAtDecorationBoundaries([list], [{ from: 24, to: 27 }]);
    const resultList = result[0] as ListBlock;
    const runs = resultList.items[0].paragraph.runs as TextRun[];

    expect(runs).toHaveLength(3);
    expect(runs[0]).toMatchObject({ text: 'list', pmStart: 20, pmEnd: 24 });
    expect(runs[1]).toMatchObject({ text: ' it', pmStart: 24, pmEnd: 27 });
    expect(runs[2]).toMatchObject({ text: 'em', pmStart: 27, pmEnd: 29 });
  });

  // -----------------------------------------------------------------------
  // Other block types pass through
  // -----------------------------------------------------------------------

  it('returns image and drawing blocks unchanged', () => {
    const image: FlowBlock = { kind: 'image', id: 'img1', src: 'test.png' } as FlowBlock;
    const drawing: FlowBlock = { kind: 'drawing', id: 'd1', drawingKind: 'shape' } as FlowBlock;

    const result = splitRunsAtDecorationBoundaries([image, drawing], [{ from: 0, to: 100 }]);
    expect(result[0]).toEqual(image);
    expect(result[1]).toEqual(drawing);
  });

  // -----------------------------------------------------------------------
  // Edge: empty text segments dropped
  // -----------------------------------------------------------------------

  it('drops empty text segments that would result from splitting at run boundaries', () => {
    // Run "ab" at [5,7]. Boundary at 5 is == start (not interior), boundary at 7 is == end.
    // Additional boundary at 6 splits into "a" [5,6] and "b" [6,7].
    const blocks: FlowBlock[] = [paragraph([textRun('ab', 5, 7)])];
    const result = splitRunsAtDecorationBoundaries(blocks, [{ from: 5, to: 6 }]);
    const runs = (result[0] as ParagraphBlock).runs as TextRun[];

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ text: 'a', pmStart: 5, pmEnd: 6 });
    expect(runs[1]).toMatchObject({ text: 'b', pmStart: 6, pmEnd: 7 });
  });
});
