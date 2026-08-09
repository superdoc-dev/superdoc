import { describe, expect, it } from 'bun:test';
import type {
  FlowBlock,
  Layout,
  Measure,
  ParagraphBlock,
  ParagraphMeasure,
  SectionMetadata,
} from '@superdoc/contracts';
import {
  buildChapterContextByPage,
  buildChapterContextByPageCooperatively,
  layoutDocument,
  layoutDocumentCooperatively,
  resolvePageNumberTokens,
  resolvePageNumberTokensCooperatively,
  type LayoutExecutionCheckpoint,
  type NumberingContext,
} from './index.js';

function paragraphFixture(count: number): { blocks: FlowBlock[]; measures: Measure[] } {
  const blocks: FlowBlock[] = [];
  const measures: Measure[] = [];
  for (let index = 0; index < count; index += 1) {
    blocks.push({
      kind: 'paragraph',
      id: `p-${index}`,
      runs: [{ text: `paragraph ${index}` }],
    });
    measures.push({
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 1,
          width: 80,
          ascent: 8,
          descent: 2,
          lineHeight: 10,
        },
      ],
      totalHeight: 10,
    } satisfies ParagraphMeasure);
  }
  return { blocks, measures };
}

describe('cooperative layout execution', () => {
  it('drains the same paginator state machine as the synchronous API', async () => {
    const fixture = paragraphFixture(96);
    const options = {
      pageSize: { w: 400, h: 240 },
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    };
    const checkpoints: LayoutExecutionCheckpoint[] = [];

    const synchronous = layoutDocument(fixture.blocks, fixture.measures, options);
    const cooperative = await layoutDocumentCooperatively(fixture.blocks, fixture.measures, options, {
      checkpointEveryBlocks: 8,
      yieldToHost: async (checkpoint) => {
        checkpoints.push(checkpoint);
      },
    });

    expect(cooperative).toEqual(synchronous);
    expect(checkpoints.some((checkpoint) => checkpoint.phase === 'layout-document:block')).toBe(true);
    expect(checkpoints.some((checkpoint) => checkpoint.phase === 'layout-document:finalize-page')).toBe(true);
  });

  it('abandons local paginator state at a block checkpoint when ownership is revoked', async () => {
    const fixture = paragraphFixture(256);
    const controller = new AbortController();
    const visitedBlockIndexes: number[] = [];
    const superseded = new Error('strict layout superseded');

    const run = layoutDocumentCooperatively(
      fixture.blocks,
      fixture.measures,
      {},
      {
        signal: controller.signal,
        checkpointEveryBlocks: 4,
        yieldToHost: async (checkpoint) => {
          if (checkpoint.phase !== 'layout-document:block') return;
          visitedBlockIndexes.push(checkpoint.index ?? -1);
          if ((checkpoint.index ?? 0) >= 20) controller.abort(superseded);
        },
      },
    );

    await expect(run).rejects.toBe(superseded);
    expect(Math.max(...visitedBlockIndexes)).toBeLessThan(fixture.blocks.length);
    expect(fixture.blocks).toHaveLength(256);
    expect(fixture.measures).toHaveLength(256);
  });

  it('interrupts document-scale footnote-anchor preflight before pagination starts', async () => {
    const fixture = paragraphFixture(256);
    const blocks = fixture.blocks.map(
      (block, index) =>
        ({
          ...block,
          attrs: { pmStart: index * 2, pmEnd: index * 2 + 1 },
        }) as ParagraphBlock,
    );
    const refs = blocks.map((_, index) => ({ id: `fn-${index}`, pos: index * 2 }));
    const bodyHeightById = new Map(refs.map((ref) => [ref.id, 20]));
    const firstLineHeightById = new Map(refs.map((ref) => [ref.id, 8]));
    const controller = new AbortController();
    const superseded = new Error('footnote preflight superseded');
    const phases: LayoutExecutionCheckpoint['phase'][] = [];

    const run = layoutDocumentCooperatively(
      blocks,
      fixture.measures,
      { footnotes: { refs, bodyHeightById, firstLineHeightById } },
      {
        signal: controller.signal,
        checkpointEveryBlocks: 8,
        yieldToHost: async (checkpoint) => {
          phases.push(checkpoint.phase);
          if (checkpoint.phase === 'layout-document:preflight-footnote' && (checkpoint.index ?? 0) >= 24) {
            controller.abort(superseded);
          }
        },
      },
    );

    await expect(run).rejects.toBe(superseded);
    expect(phases).toContain('layout-document:preflight-footnote');
    expect(phases).not.toContain('layout-document:block');
  });

  it('interrupts chapter-numbering construction during its fragment scan', async () => {
    const fixture = paragraphFixture(128);
    const blocks = fixture.blocks.map(
      (block, index) =>
        ({
          ...block,
          attrs: {
            headingLevel: 1,
            wordLayout: { marker: { markerText: String(index + 1) } },
          },
        }) as ParagraphBlock,
    );
    const layout: Layout = {
      pageSize: { w: 400, h: 240 },
      pages: blocks.map((block, index) => ({
        number: index + 1,
        sectionIndex: 0,
        fragments: [{ kind: 'para', blockId: block.id, fromLine: 0, toLine: 1, x: 0, y: 0, width: 80 }],
      })),
    };
    const sections: SectionMetadata[] = [{ sectionIndex: 0, numbering: { chapterStyle: 1 } }];
    const blockById = new Map(blocks.map((block) => [block.id, block]));
    const controller = new AbortController();
    const superseded = new Error('chapter context superseded');
    const visited: number[] = [];

    const run = buildChapterContextByPageCooperatively(layout, blockById, sections, {
      signal: controller.signal,
      checkpointEveryBlocks: 4,
      yieldToHost: async (checkpoint) => {
        if (checkpoint.phase !== 'numbering-context:chapter') return;
        visited.push(checkpoint.index ?? -1);
        if ((checkpoint.index ?? 0) >= 20) controller.abort(superseded);
      },
    });

    await expect(run).rejects.toBe(superseded);
    expect(Math.max(...visited)).toBeLessThan(layout.pages.length);
    expect(buildChapterContextByPage(layout, blockById, sections).size).toBe(layout.pages.length);
  });

  it('cancels page-token scans without publishing a partial result', async () => {
    const fixture = paragraphFixture(64);
    const blocks = fixture.blocks.map((block, index) =>
      index % 2 === 0
        ? ({
            ...block,
            attrs: { hasPageTokens: true },
            runs: [{ text: '0', token: 'pageNumber' }],
          } as ParagraphBlock)
        : block,
    );
    const layout: Layout = {
      pageSize: { w: 400, h: 240 },
      pages: blocks.map((block, index) => ({
        number: index + 1,
        fragments: [
          {
            kind: 'para',
            blockId: block.id,
            fromLine: 0,
            toLine: 1,
            x: 0,
            y: 0,
            width: 80,
          },
        ],
      })),
    };
    const numbering: NumberingContext = {
      totalPages: layout.pages.length,
      displayPages: layout.pages.map((page) => ({
        physicalPage: page.number,
        displayNumber: page.number,
        displayText: String(page.number),
        sectionIndex: 0,
      })),
    };
    const controller = new AbortController();
    const superseded = new Error('page-token pass superseded');

    const run = resolvePageNumberTokensCooperatively(layout, blocks, fixture.measures, numbering, undefined, {
      signal: controller.signal,
      yieldToHost: async (checkpoint) => {
        if (checkpoint.phase === 'page-token:page' && (checkpoint.index ?? 0) >= 8) {
          controller.abort(superseded);
        }
      },
    });

    await expect(run).rejects.toBe(superseded);
    expect(resolvePageNumberTokens(layout, blocks, fixture.measures, numbering).affectedBlockIds.size).toBe(32);
    expect((blocks[0] as ParagraphBlock).runs[0]!.text).toBe('0');
  });
});
