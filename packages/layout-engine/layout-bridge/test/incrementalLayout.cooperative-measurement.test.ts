import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { FlowBlock, ParagraphMeasure } from '@superdoc/contracts';
import { incrementalLayout, measureCache } from '../src/incrementalLayout';

const options = {
  pageSize: { w: 300, h: 400 },
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  columns: { count: 1, gap: 0 },
};

const blocks: FlowBlock[] = Array.from({ length: 12 }, (_, index) => ({
  kind: 'paragraph',
  id: `paragraph-${index}`,
  runs: [{ text: `paragraph ${index}`, fontFamily: 'Arial', fontSize: 12 }],
}));

const createMeasure = () =>
  vi.fn(
    async (_block: FlowBlock, constraints: { maxWidth: number; maxHeight: number }): Promise<ParagraphMeasure> => ({
      kind: 'paragraph',
      lines: [
        {
          fromRun: 0,
          fromChar: 0,
          toRun: 0,
          toChar: 1,
          width: constraints.maxWidth,
          ascent: 8,
          descent: 2,
          lineHeight: 10,
        },
      ],
      totalHeight: 10,
    }),
  );

describe('incrementalLayout cooperative measurement checkpoints', () => {
  beforeEach(() => measureCache.clear());

  it('uses the allocation-free due probe for every block without changing canonical output', async () => {
    const baseline = await incrementalLayout([], null, blocks, options, createMeasure());
    measureCache.clear();

    let probes = 0;
    let yielded = 0;
    const legacyYield = vi.fn(async () => undefined);
    const cooperative = await incrementalLayout(
      [],
      null,
      blocks,
      options,
      createMeasure(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        yieldToHost: legacyYield,
        yieldEveryBlocks: 1,
        checkpointIfDue: () => {
          probes += 1;
          if (probes % 4 !== 0) return null;
          yielded += 1;
          return Promise.resolve();
        },
      },
    );

    expect(cooperative.layout).toEqual(baseline.layout);
    expect(cooperative.measures).toEqual(baseline.measures);
    expect(probes).toBe(blocks.length + 3);
    expect(yielded).toBe(3);
    expect(legacyYield).not.toHaveBeenCalled();
  });

  it('preserves resumable layout checkpoint identity through the time-aware due probe', async () => {
    const checkpoints: Array<{ phase: string; index?: number; total?: number } | undefined> = [];
    const legacyYield = vi.fn(async () => undefined);

    await incrementalLayout(
      [],
      null,
      blocks,
      options,
      createMeasure(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        signal: new AbortController().signal,
        yieldToHost: legacyYield,
        yieldEveryBlocks: 1,
        checkpointIfDue: (checkpoint) => {
          checkpoints.push(checkpoint);
          return null;
        },
      },
    );

    expect(checkpoints).toContainEqual({
      phase: 'layout-document:block',
      index: 0,
      total: blocks.length,
    });
    expect(legacyYield).not.toHaveBeenCalled();
  });
});
