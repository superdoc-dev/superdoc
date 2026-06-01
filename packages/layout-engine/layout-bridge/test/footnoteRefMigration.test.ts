/**
 * SD-3051: Stability guarantee — when block-aware breaks (SD-3049) cause refs
 * to migrate between pages during the convergence loop, the final layout must
 * be deterministic across repeated runs of the same input. The reserve loop
 * already has cycle detection (incrementalLayout.ts:1864) and growReserves is
 * monotonic; this regression test guards against future regressions of those
 * properties.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

const makeParagraph = (id: string, text: string, pmStart: number): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart, pmEnd: pmStart + text.length }],
});

const makeMeasure = (lineHeight: number, lineCount: number): Measure => ({
  kind: 'paragraph',
  lines: Array.from({ length: lineCount }, (_, i) => ({
    fromRun: 0,
    fromChar: i,
    toRun: 0,
    toChar: i + 1,
    width: 200,
    ascent: lineHeight * 0.8,
    descent: lineHeight * 0.2,
    lineHeight,
  })),
  totalHeight: lineCount * lineHeight,
});

describe('SD-3051: footnote layout is deterministic across runs', () => {
  /**
   * Builds a fixture that exercises the migration-prone path: multiple refs
   * spread across pages with footnotes large enough that block-aware breaks
   * shift refs between pages relative to a reserve-naive layout.
   */
  const buildFixture = () => {
    const BODY_LINES = 40;
    const FOOTNOTE_LINES = 6;
    const LINE_H = 20;
    const FOOTNOTE_LINE_H = 12;

    let pos = 0;
    const blocks: FlowBlock[] = [];
    for (let i = 0; i < BODY_LINES; i += 1) {
      const text = `Body line ${i + 1}.`;
      blocks.push(makeParagraph(`body-${i}`, text, pos));
      pos += text.length + 1;
    }
    // Three refs, spread so they fall on the boundary of pages
    const refIndexes = [10, 20, 30];
    const refs = refIndexes.map((idx, n) => {
      const refBlock = blocks[idx];
      const refPos = (refBlock.kind === 'paragraph' ? (refBlock.runs?.[0]?.pmStart ?? 0) : 0) + 2;
      return { id: String(n + 1), pos: refPos };
    });
    const blocksById = new Map<string, FlowBlock[]>();
    for (let n = 1; n <= 3; n += 1) {
      blocksById.set(String(n), [makeParagraph(`footnote-${n}-0-paragraph`, `Footnote ${n}.`, 0)]);
    }

    const measureBlock = vi.fn(async (b: FlowBlock) => {
      if (b.id.startsWith('footnote-')) return makeMeasure(FOOTNOTE_LINE_H, FOOTNOTE_LINES);
      return makeMeasure(LINE_H, 1);
    });

    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    return {
      blocks,
      options: {
        pageSize: { w: 612, h: 600 + margins.top + margins.bottom },
        margins,
        footnotes: { refs, blocksById, topPadding: 6, dividerHeight: 6 },
      },
      measureBlock,
    };
  };

  it('produces identical page counts and reserves on repeated runs', async () => {
    const f1 = buildFixture();
    const r1 = await incrementalLayout([], null, f1.blocks, f1.options, f1.measureBlock);

    const f2 = buildFixture();
    const r2 = await incrementalLayout([], null, f2.blocks, f2.options, f2.measureBlock);

    expect(r1.layout.pages.length).toBe(r2.layout.pages.length);

    for (let i = 0; i < r1.layout.pages.length; i += 1) {
      expect(r1.layout.pages[i].footnoteReserved ?? 0).toBe(r2.layout.pages[i].footnoteReserved ?? 0);
    }
  });

  it('produces identical ref-to-page assignments on repeated runs', async () => {
    const refToPage = (result: Awaited<ReturnType<typeof incrementalLayout>>) => {
      const out = new Map<string, number>();
      result.layout.pages.forEach((page, pageIndex) => {
        for (const f of page.fragments) {
          const id = String(f.blockId);
          // The first non-continuation fragment of each footnote indicates
          // the anchor page. Continuation fragments will be assigned to
          // later pages, so we record the *minimum* page seen.
          const match = id.match(/^footnote-(\d+)-/);
          if (!match) continue;
          const fnId = match[1];
          if (!out.has(fnId)) out.set(fnId, pageIndex);
          else out.set(fnId, Math.min(out.get(fnId) ?? pageIndex, pageIndex));
        }
      });
      return out;
    };

    const f1 = buildFixture();
    const r1 = await incrementalLayout([], null, f1.blocks, f1.options, f1.measureBlock);
    const a1 = refToPage(r1);

    const f2 = buildFixture();
    const r2 = await incrementalLayout([], null, f2.blocks, f2.options, f2.measureBlock);
    const a2 = refToPage(r2);

    expect(a1.size).toBe(a2.size);
    a1.forEach((page, fnId) => {
      expect(a2.get(fnId)).toBe(page);
    });
  });
});
