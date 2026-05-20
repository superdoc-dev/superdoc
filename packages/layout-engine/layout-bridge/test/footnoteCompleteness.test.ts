import { describe, it, expect, vi } from 'vitest';
import type { FlowBlock, Measure, ParagraphBlock } from '@superdoc/contracts';
import { incrementalLayout } from '../src/incrementalLayout';

/**
 * SD-2656: every footnote ref in the input MUST have its body content
 * rendered somewhere in the output. The new no-reserve architecture had
 * a bug (caught visually on the reference fixture's page 16) where two footnotes anchored
 * in the same paragraph could end up with the second one missing from the
 * band — body extended too far, the planner ran out of band space, and
 * the second fn was pushed to "pending" without being rendered.
 */
describe('SD-2656: footnote completeness — every ref renders', () => {
  it('renders every anchored footnote even when many cluster on one page', async () => {
    const BODY_LINE_HEIGHT = 24;
    const FN_LINE_HEIGHT = 14;
    const FN_LINES = 2;

    // 12 body lines, each ~24 px, plus 4 fn refs anchored in the same
    // single body block. Each footnote is short. The page should easily
    // hold body + all 4 fns + overhead.
    let pos = 0;
    const text = 'a b c d e f g h i j k l';
    const block: FlowBlock = {
      kind: 'paragraph',
      id: 'body-0',
      runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart: pos, pmEnd: pos + text.length }],
    };
    pos += text.length;

    const refs = [
      { id: '1', pos: 4 },
      { id: '2', pos: 8 },
      { id: '3', pos: 14 },
      { id: '4', pos: 22 },
    ];
    const fnBlocks = new Map<string, FlowBlock[]>();
    for (const r of refs) {
      fnBlocks.set(r.id, [
        {
          kind: 'paragraph',
          id: `footnote-${r.id}-0-paragraph`,
          runs: [{ text: `fn body ${r.id}`, fontFamily: 'Arial', fontSize: 10, pmStart: 0, pmEnd: 12 }],
        },
      ]);
    }

    const measureBlock = vi.fn(async (block: FlowBlock) => {
      if (block.id.startsWith('footnote-')) {
        const lines = Array.from({ length: FN_LINES }, (_, i) => ({
          fromRun: 0,
          fromChar: i,
          toRun: 0,
          toChar: i + 1,
          width: 200,
          ascent: FN_LINE_HEIGHT * 0.8,
          descent: FN_LINE_HEIGHT * 0.2,
          lineHeight: FN_LINE_HEIGHT,
        }));
        return { kind: 'paragraph', lines, totalHeight: lines.length * FN_LINE_HEIGHT } as Measure;
      }
      const lineCount = 12;
      const lines = Array.from({ length: lineCount }, (_, i) => ({
        fromRun: 0,
        fromChar: i,
        toRun: 0,
        toChar: i + 1,
        width: 200,
        ascent: BODY_LINE_HEIGHT * 0.8,
        descent: BODY_LINE_HEIGHT * 0.2,
        lineHeight: BODY_LINE_HEIGHT,
      }));
      return { kind: 'paragraph', lines, totalHeight: lineCount * BODY_LINE_HEIGHT } as Measure;
    });

    const margins = { top: 72, right: 72, bottom: 72, left: 72 };
    const pageHeight = 900;

    const result = await incrementalLayout(
      [],
      null,
      [block],
      {
        pageSize: { w: 612, h: pageHeight },
        margins,
        footnotes: { refs, blocksById: fnBlocks, topPadding: 4, dividerHeight: 2 },
      },
      measureBlock,
    );

    // Every ref id should appear in at least one fn fragment somewhere
    // in the rendered layout (band painter is required to either place
    // the fn fully or split it across pages — never silently drop).
    const renderedFnIds = new Set<string>();
    for (const page of result.layout.pages) {
      for (const f of page.fragments) {
        if (typeof f.blockId !== 'string') continue;
        const m = f.blockId.match(/^footnote-(\d+)-/);
        if (m) renderedFnIds.add(m[1]);
      }
    }
    for (const r of refs) {
      expect(renderedFnIds.has(r.id)).toBe(true);
    }
  });

  // Reproduces the reference fixture's page-10 case: a long stretch of body
  // before a paragraph that anchors two short fns. Earlier SD dropped fn 2
  // because the legacy convergence loop left a stale per-page reserve that
  // misled body's demand check.
  it('places both fn 1 and fn 2 at the tail of a dense body page', async () => {
    const BODY_LH = 37;
    const FN_LH = 14;
    const SP_AFTER = 16;

    let pos = 0;
    const bodyBlocks: FlowBlock[] = [];
    for (let i = 0; i < 17; i += 1) {
      const t = `dense body paragraph ${i.toString().padStart(2, '0')}`;
      bodyBlocks.push({
        kind: 'paragraph',
        id: `body-${i}`,
        runs: [{ text: t, fontFamily: 'Arial', fontSize: 12, pmStart: pos, pmEnd: pos + t.length }],
      });
      pos += t.length + 1;
    }
    const tail = 'paragraph ending with two refs ab cd';
    bodyBlocks.push({
      kind: 'paragraph',
      id: 'anchor-para',
      runs: [{ text: tail, fontFamily: 'Arial', fontSize: 12, pmStart: pos, pmEnd: pos + tail.length }],
    });
    const refs2 = [
      { id: '1', pos: pos + 30 },
      { id: '2', pos: pos + 33 },
    ];
    const fnBlocks2 = new Map<string, FlowBlock[]>();
    for (const r of refs2) {
      fnBlocks2.set(r.id, [
        {
          kind: 'paragraph',
          id: `footnote-${r.id}-0-paragraph`,
          runs: [{ text: `short fn ${r.id} body`, fontFamily: 'Arial', fontSize: 10, pmStart: 0, pmEnd: 22 }],
          attrs: { spacing: { after: SP_AFTER } },
        } as ParagraphBlock,
      ]);
    }
    const measureBlock2 = vi.fn(async (b: FlowBlock) => {
      if (b.id.startsWith('footnote-')) {
        return {
          kind: 'paragraph',
          lines: [
            { fromRun: 0, fromChar: 0, toRun: 0, toChar: 22, width: 200, ascent: 11, descent: 3, lineHeight: FN_LH },
          ],
          totalHeight: FN_LH,
        } as Measure;
      }
      return {
        kind: 'paragraph',
        lines: [
          { fromRun: 0, fromChar: 0, toRun: 0, toChar: 30, width: 200, ascent: 29, descent: 8, lineHeight: BODY_LH },
        ],
        totalHeight: BODY_LH,
      } as Measure;
    });
    const result2 = await incrementalLayout(
      [],
      null,
      bodyBlocks,
      {
        pageSize: { w: 612, h: 1056 },
        margins: { top: 96, right: 72, bottom: 96, left: 72 },
        footnotes: { refs: refs2, blocksById: fnBlocks2, topPadding: 4, dividerHeight: 6 },
      },
      measureBlock2,
    );
    const renderedFnIds2 = new Set<string>();
    for (const page of result2.layout.pages) {
      for (const f of page.fragments) {
        if (typeof f.blockId !== 'string') continue;
        const m = f.blockId.match(/^footnote-(\d+)-/);
        if (m) renderedFnIds2.add(m[1]);
      }
    }
    expect(renderedFnIds2.has('1')).toBe(true);
    expect(renderedFnIds2.has('2')).toBe(true);
    // Both fns must live on the same page as their anchor paragraph.
    let anchorPage = -1;
    for (let pi = 0; pi < result2.layout.pages.length; pi++) {
      if (result2.layout.pages[pi].fragments.some((f) => f.blockId === 'anchor-para')) {
        anchorPage = pi;
        break;
      }
    }
    expect(anchorPage).toBeGreaterThanOrEqual(0);
    const pagesOf2 = (id: string) =>
      result2.layout.pages
        .map((p, idx) =>
          p.fragments.some((f) => typeof f.blockId === 'string' && f.blockId.startsWith(`footnote-${id}-`)) ? idx : -1,
        )
        .filter((i) => i >= 0);
    expect(pagesOf2('1')).toContain(anchorPage);
    expect(pagesOf2('2')).toContain(anchorPage);
  });

  it('keeps both refs from the same paragraph on the same page when they fit', async () => {
    // Mirrors the reference fixture's page-16 scenario: a paragraph with two
    // closely-clustered refs whose anchors live on different lines of
    // the SAME paragraph. Both should land on the same page's band.
    const BODY_LINE_HEIGHT = 24;
    const FN_LINE_HEIGHT = 14;

    const text = 'L1 line1 L2 line2 L3 line3';
    const block: FlowBlock = {
      kind: 'paragraph',
      id: 'two-ref-para',
      runs: [{ text, fontFamily: 'Arial', fontSize: 12, pmStart: 0, pmEnd: text.length }],
    };
    const refs = [
      { id: 'A', pos: 8 },
      { id: 'B', pos: 16 },
    ];
    const fnBlocks = new Map<string, FlowBlock[]>();
    for (const r of refs) {
      fnBlocks.set(r.id, [
        {
          kind: 'paragraph',
          id: `footnote-${r.id}-0-paragraph`,
          runs: [{ text: `fn ${r.id}`, fontFamily: 'Arial', fontSize: 10, pmStart: 0, pmEnd: 8 }],
        },
      ]);
    }
    const measureBlock = vi.fn(async (b: FlowBlock) => {
      if (b.id.startsWith('footnote-')) {
        return {
          kind: 'paragraph',
          lines: [
            {
              fromRun: 0,
              fromChar: 0,
              toRun: 0,
              toChar: 4,
              width: 200,
              ascent: 11,
              descent: 3,
              lineHeight: FN_LINE_HEIGHT,
            },
          ],
          totalHeight: FN_LINE_HEIGHT,
        } as Measure;
      }
      const lines = Array.from({ length: 6 }, (_, i) => ({
        fromRun: 0,
        fromChar: i,
        toRun: 0,
        toChar: i + 1,
        width: 200,
        ascent: 19,
        descent: 5,
        lineHeight: BODY_LINE_HEIGHT,
      }));
      return { kind: 'paragraph', lines, totalHeight: 6 * BODY_LINE_HEIGHT } as Measure;
    });

    const result = await incrementalLayout(
      [],
      null,
      [block],
      {
        pageSize: { w: 612, h: 900 },
        margins: { top: 72, right: 72, bottom: 72, left: 72 },
        footnotes: { refs, blocksById: fnBlocks, topPadding: 4, dividerHeight: 2 },
      },
      measureBlock,
    );

    // Collect the page each fn id landed on.
    const pageOfFn = new Map<string, number>();
    for (let pageIndex = 0; pageIndex < result.layout.pages.length; pageIndex++) {
      for (const f of result.layout.pages[pageIndex].fragments) {
        if (typeof f.blockId !== 'string') continue;
        const m = f.blockId.match(/^footnote-([A-Z])-/);
        if (m) pageOfFn.set(m[1], pageIndex);
      }
    }
    expect(pageOfFn.has('A')).toBe(true);
    expect(pageOfFn.has('B')).toBe(true);
    expect(pageOfFn.get('A')).toBe(pageOfFn.get('B'));
  });
});
