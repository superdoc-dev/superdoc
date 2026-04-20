import { describe, expect, it, vi } from 'vitest';
import type { FlowBlock, Measure } from '@superdoc/contracts';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import { layoutHeaderFooterWithCache, HeaderFooterLayoutCache } from '../src/layoutHeaderFooter';

const makeBlock = (id: string, text = 'Hello'): FlowBlock => ({
  kind: 'paragraph',
  id,
  runs: [{ text, fontFamily: 'Arial', fontSize: 16 }],
});

const makeMeasure = (height: number): Measure => ({
  kind: 'paragraph',
  lines: [
    {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 1,
      width: 100,
      ascent: height * 0.8,
      descent: height * 0.2,
      lineHeight: height,
    },
  ],
  totalHeight: height,
});

describe('layoutHeaderFooterWithCache', () => {
  it('measures and lays out each section variant', async () => {
    const sections = {
      default: [makeBlock('a')],
      first: [makeBlock('b')],
    };

    const measureBlock = vi.fn(async () => makeMeasure(20));
    const result = await layoutHeaderFooterWithCache(sections, { width: 400, height: 80 }, measureBlock);

    expect(measureBlock).toHaveBeenCalledTimes(2);
    expect(result.default?.layout.pages[0].fragments).toHaveLength(1);
    expect(result.first?.layout.height).toBeGreaterThan(0);
  });

  it('caches measurements across runs', async () => {
    const cache = new HeaderFooterLayoutCache();
    const sections = { default: [makeBlock('a')] };
    const measureBlock = vi.fn(async () => makeMeasure(10));

    await layoutHeaderFooterWithCache(sections, { width: 300, height: 40 }, measureBlock, cache);
    await layoutHeaderFooterWithCache(sections, { width: 300, height: 40 }, measureBlock, cache);

    expect(measureBlock).toHaveBeenCalledTimes(1);
  });

  it('returns no layouts when the body layout has zero pages', async () => {
    const sections = {
      default: [
        {
          kind: 'paragraph',
          id: 'page-token-footer',
          runs: [
            { text: 'Page ', fontFamily: 'Arial', fontSize: 16 },
            { text: '0', token: 'pageNumber', fontFamily: 'Arial', fontSize: 16 },
          ],
        } satisfies FlowBlock,
      ],
    };
    const measureBlock = vi.fn(async () => makeMeasure(12));

    const result = await layoutHeaderFooterWithCache(
      sections,
      { width: 300, height: 40 },
      measureBlock,
      undefined,
      undefined,
      () => ({ displayText: '1', totalPages: 0 }),
      'footer',
    );

    expect(result).toEqual({});
    expect(measureBlock).not.toHaveBeenCalled();
  });

  describe('integration test', () => {
    it('full pipeline: PM JSON with page tokens → FlowBlocks → Measures → Layout', async () => {
      // 1. Create PM JSON with page number tokens (simulates header/footer from SuperConverter)
      const headerPmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Page ' },
              { type: 'page-number' },
              { type: 'text', text: ' of ' },
              { type: 'total-page-number' },
            ],
          },
        ],
      };

      const footerPmDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Footer: ' }, { type: 'page-number' }],
          },
        ],
      };

      // 2. Convert PM JSON to FlowBlocks using PM adapter
      const { blocks: headerBlocks } = toFlowBlocks(headerPmDoc, { blockIdPrefix: 'header-default-' });
      const { blocks: footerBlocks } = toFlowBlocks(footerPmDoc, { blockIdPrefix: 'footer-default-' });

      // Verify tokens are present in runs
      expect(headerBlocks[0].runs[1].token).toBe('pageNumber');
      expect(headerBlocks[0].runs[3].token).toBe('totalPageCount');
      expect(footerBlocks[0].runs[1].token).toBe('pageNumber');

      // 3. Create mocked measurements (simulates measurer output)
      const headerMeasure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 3,
            toChar: 1,
            width: 150,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      const footerMeasure: Measure = {
        kind: 'paragraph',
        lines: [
          {
            fromRun: 0,
            fromChar: 0,
            toRun: 1,
            toChar: 1,
            width: 100,
            ascent: 12,
            descent: 4,
            lineHeight: 20,
          },
        ],
        totalHeight: 20,
      };

      // 4. Layout using layoutHeaderFooterWithCache
      const sections = {
        default: headerBlocks,
      };

      const measureFn = vi.fn(async (block: FlowBlock): Promise<Measure> => {
        // Use mocked measurements
        if (block.id === headerBlocks[0].id) return headerMeasure;
        throw new Error(`No measure for block ${block.id}`);
      });

      const result = await layoutHeaderFooterWithCache(sections, { width: 400, height: 50 }, measureFn);

      // 5. Verify layout output
      expect(result.default).toBeDefined();
      expect(result.default?.layout.pages).toHaveLength(1);
      expect(result.default?.layout.pages[0].fragments).toHaveLength(1);
      expect(result.default?.layout.height).toBeGreaterThan(0);
      expect(result.default?.layout.height).toBeLessThanOrEqual(50); // Within constraints

      // Verify blocks and measures are available for painters
      expect(result.default?.blocks).toHaveLength(1);
      expect(result.default?.measures).toHaveLength(1);
      expect(result.default?.blocks[0].id.startsWith('header-default-')).toBe(true);

      // 6. Verify tokens are resolved (text updated for measurement, tokens preserved for painter)
      const firstBlock = result.default?.blocks[0];
      // Tokens should be PRESERVED so painter can re-resolve at render time for each page
      expect(firstBlock?.runs.some((run) => run.token === 'pageNumber')).toBe(true);
      expect(firstBlock?.runs.some((run) => run.token === 'totalPageCount')).toBe(true);
      // Text should be resolved to page 1 (for measurement purposes)
      expect(firstBlock?.runs[1]?.text).toBe('1'); // pageNumber resolved to '1'
      expect(firstBlock?.runs[3]?.text).toBe('1'); // totalPageCount resolved to '1' (1 page total)
    });
  });
});
