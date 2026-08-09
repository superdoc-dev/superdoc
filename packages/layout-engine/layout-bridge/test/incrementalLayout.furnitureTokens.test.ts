/**
 * SD-3772 D3: stable furniture PAGE/NUMPAGES/SECTIONPAGES tokens (plain runs
 * AND fields nested in anchored textbox content — the exact SD-3772 footer
 * shape) must be cold-equivalent through checkpoint reuse, including across
 * page-count-changing edits at display-number digit boundaries (9→10 and
 * 99→100). If these fail, the canonical furniture pre-layout/final-layout
 * contract must be repaired — never hide the tokens from detection.
 */

import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type {
  DrawingMeasure,
  FlowBlock,
  Layout,
  Line,
  Page,
  ParagraphBlock,
  ParagraphMeasure,
} from '@superdoc/contracts';
import { clearIncrementalModuleState, incrementalLayout, type IncrementalLayoutReuseOptions } from '../src/index.js';

const PAGE_SIZE = { w: 600, h: 500 };
// Bottom margin 80 keeps the 36px footer band (12px paragraph + 24px
// anchored textbox) below the inflation threshold, so body pagination is
// exactly 6 lines per page.
const DOC_MARGINS = { top: 40, right: 40, bottom: 80, left: 40, header: 20, footer: 20 };
const LINES_PER_PAGE = 6; // floor((500 - 40 - 80) / 60)

function paragraph(id: string, text: string, pmStart: number): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [{ kind: 'text', text, pmStart, pmEnd: pmStart + text.length }],
    // This test isolates incremental furniture-token equivalence; its
    // synthetic one-line page packing intentionally opts out of Word's
    // default widow/orphan pagination behavior.
    attrs: { widowControl: false },
  };
}

function makeLine(lineHeight: number): Line {
  return {
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: 4,
    width: 100,
    ascent: lineHeight * 0.75,
    descent: lineHeight * 0.25,
    lineHeight,
  };
}

/**
 * Body paragraphs are one 60px line unless their text carries `grow:N`
 * (N extra lines). Footer paragraphs are 12px lines; the anchored footer
 * textbox drawing measures as a fixed 100x24 box.
 */
async function measureBlock(block: FlowBlock): Promise<ParagraphMeasure | DrawingMeasure> {
  if (block.kind === 'drawing') {
    return {
      kind: 'drawing',
      drawingKind: 'textboxShape',
      width: 100,
      height: 24,
      scale: 1,
      naturalWidth: 100,
      naturalHeight: 24,
      geometry: { width: 100, height: 24 },
    };
  }
  if (block.kind !== 'paragraph') throw new Error(`unexpected block kind ${block.kind}`);
  if (block.id.startsWith('ftr-')) {
    return { kind: 'paragraph', lines: [makeLine(12)], totalHeight: 12 };
  }
  const text = block.runs.reduce((sum, run) => sum + ('text' in run ? run.text : ''), '');
  const growMatch = /grow:(\d+)/.exec(text);
  const lineCount = 1 + (growMatch ? Number(growMatch[1]) : 0);
  const lines = Array.from({ length: lineCount }, () => makeLine(60));
  return { kind: 'paragraph', lines, totalHeight: lineCount * 60 };
}

/** The exact SD-3772 footer shape: plain token runs + an anchored textbox with nested PAGE fields. */
function buildTokenFooterBlocks(): FlowBlock[] {
  return [
    {
      kind: 'paragraph',
      id: 'ftr-tokens',
      runs: [
        { kind: 'text', text: 'Page ', pmStart: 1, pmEnd: 6 },
        { kind: 'text', text: '1', token: 'pageNumber', pmStart: 6, pmEnd: 7 },
        { kind: 'text', text: ' of ', pmStart: 7, pmEnd: 11 },
        { kind: 'text', text: '1', token: 'totalPageCount', pmStart: 11, pmEnd: 12 },
        { kind: 'text', text: ' / ', pmStart: 12, pmEnd: 15 },
        { kind: 'text', text: '1', token: 'sectionPageCount', pmStart: 15, pmEnd: 16 },
      ],
    },
    {
      kind: 'drawing',
      id: 'ftr-textbox',
      drawingKind: 'textboxShape',
      geometry: { width: 100, height: 24 },
      anchor: { isAnchored: true, vRelativeFrom: 'page', offsetV: 460 },
      contentBlocks: [
        {
          kind: 'paragraph',
          id: 'ftr-textbox-p',
          runs: [{ kind: 'text', text: '1', token: 'pageNumber', pmStart: 1, pmEnd: 2 }],
        },
      ],
      textContent: { parts: [{ text: 'Pg ' }, { text: '1', fieldType: 'PAGE' }] },
    } as FlowBlock,
  ];
}

function buildHeaderFooter() {
  return {
    headerBlocksByRId: new Map<string, FlowBlock[]>(),
    footerBlocksByRId: new Map<string, FlowBlock[]>([['ftr-main', buildTokenFooterBlocks()]]),
    constraints: {
      width: PAGE_SIZE.w - DOC_MARGINS.left - DOC_MARGINS.right,
      height: PAGE_SIZE.h - DOC_MARGINS.top - DOC_MARGINS.bottom,
      pageWidth: PAGE_SIZE.w,
      pageHeight: PAGE_SIZE.h,
      margins: { ...DOC_MARGINS },
      overflowBaseHeight: PAGE_SIZE.h - DOC_MARGINS.top - DOC_MARGINS.bottom,
    },
    measure: measureBlock,
  };
}

function layoutOptions() {
  return {
    pageSize: { ...PAGE_SIZE },
    margins: { ...DOC_MARGINS },
    sectionMetadata: [{ sectionIndex: 0, footerRefs: { default: 'ftr-main' } }],
  };
}

function buildBlocks(paragraphCount: number, growParagraphId: string | null, growLines: number): FlowBlock[] {
  const blocks: FlowBlock[] = [];
  let pm = 1;
  for (let index = 0; index < paragraphCount; index += 1) {
    const id = `p${index}`;
    const text = id === growParagraphId ? `body-${index} grow:${growLines}` : `body-${index}`;
    blocks.push(paragraph(id, text, pm));
    pm += text.length + 2;
  }
  return blocks;
}

function buildPageStartKey(page: Page): string {
  const first = page.fragments[0] as (Page['fragments'][number] & Record<string, unknown>) | undefined;
  const sectionIndex = page.sectionIndex ?? 0;
  if (!first) return `#empty#0#${sectionIndex}#0`;
  const from = 'fromLine' in first ? first.fromLine : 'fromRow' in first ? first.fromRow : 0;
  const carry = 'continuesFromPrev' in first && first.continuesFromPrev === true ? 1 : 0;
  return `${first.blockId}#${from ?? 0}#${sectionIndex}#${carry}`;
}

function buildBlockPageIndex(layout: Layout): Map<string, { firstPage: number; lastPage: number }> {
  const index = new Map<string, { firstPage: number; lastPage: number }>();
  layout.pages.forEach((page, pageIndex) => {
    for (const fragment of page.fragments) {
      const prior = index.get(fragment.blockId);
      if (prior) prior.lastPage = pageIndex;
      else index.set(fragment.blockId, { firstPage: pageIndex, lastPage: pageIndex });
    }
  });
  return index;
}

function buildReuseOptions(
  previousLayout: Layout,
  nextBlocks: FlowBlock[],
  dirtyBlockId: string,
): IncrementalLayoutReuseOptions {
  const keys = previousLayout.pages.map(buildPageStartKey);
  const keyIndex = new Map<string, number[]>();
  keys.forEach((key, index) => keyIndex.set(key, [...(keyIndex.get(key) ?? []), index]));
  const dirtyIndex = nextBlocks.findIndex((block) => block.id === dirtyBlockId);
  const provedDirtyRegion = {
    firstDirtyIndex: dirtyIndex,
    lastStableIndex: dirtyIndex - 1,
    insertedBlockIds: [] as string[],
    deletedBlockIds: [] as string[],
    changedBlockIds: [dirtyBlockId],
    stableBlockIds: new Set(nextBlocks.map((block) => block.id).filter((id) => id !== dirtyBlockId)),
  };
  return {
    previousLayout,
    retainedMetadataSourceLayoutEpoch: previousLayout.layoutEpoch ?? null,
    previousPageStartKeys: keys,
    previousBlockPageIndex: buildBlockPageIndex(previousLayout),
    previousPageStartKeyIndex: keyIndex,
    maxRelaidPages: 3,
    requireDocumentStartCheckpoint: false,
    dirtyBlockIds: [dirtyBlockId],
    currentBlockIndexById: new Map(nextBlocks.map((block, index) => [block.id, index])),
    provedDirtyRegion: provedDirtyRegion as IncrementalLayoutReuseOptions['provedDirtyRegion'],
    dependencyProof: {
      profile: 'page-checkpoint-local-text',
      blockIdsUnchanged: true,
      blockIdsUnique: true,
      globalDependenciesAbsent: false,
      globalDependenciesFencedByPageCheckpoint: true,
      admittedDependencyClasses: ['furniture-page-tokens', 'furniture-anchored-objects'],
      multiColumnSectionsProvedNonBalanceable: true,
      renderInputsUnchanged: true,
      pageReferencesAbsent: true,
    },
  };
}

function pageGeometry(layout: Layout) {
  return layout.pages.map((page) => ({
    margins: page.margins ?? null,
    baseMargins: page.baseMargins ?? null,
    displayNumber: page.displayNumber ?? null,
    numberText: page.numberText ?? null,
    fragments: page.fragments.map((fragment) => ({
      blockId: fragment.blockId,
      x: fragment.x,
      y: fragment.y,
    })),
  }));
}

async function runScenario(paragraphCount: number, growParagraphId: string, growLines: number) {
  clearIncrementalModuleState();
  const previousBlocks = buildBlocks(paragraphCount, null, 0);
  const previous = await incrementalLayout(
    [],
    null,
    previousBlocks,
    layoutOptions(),
    measureBlock,
    buildHeaderFooter(),
  );
  previous.layout.layoutEpoch = 1;

  const nextBlocks = buildBlocks(paragraphCount, growParagraphId, growLines);
  const incremental = await incrementalLayout(
    previousBlocks,
    previous.layout,
    nextBlocks,
    layoutOptions(),
    measureBlock,
    buildHeaderFooter(),
    previous.measures,
    undefined,
    undefined,
    buildReuseOptions(previous.layout, nextBlocks, growParagraphId),
  );

  clearIncrementalModuleState();
  const cold = await incrementalLayout([], null, nextBlocks, layoutOptions(), measureBlock, buildHeaderFooter());
  return { previous, incremental, cold };
}

describe('incrementalLayout furniture token equivalence (SD-3772 D3)', () => {
  beforeEach(() => {
    clearIncrementalModuleState();
  });

  it('keeps furniture output cold-equivalent for a steady mid-document checkpoint edit', async () => {
    const paragraphCount = 9 * LINES_PER_PAGE;
    const { previous, incremental, cold } = await runScenario(paragraphCount, 'p28', 0);
    expect(previous.layout.pages.length).toBe(9);
    expect(incremental.layoutReuse.mode).toBe('tail-splice');
    expect(pageGeometry(incremental.layout)).toEqual(pageGeometry(cold.layout));
    expect(incremental.footers).toEqual(cold.footers);
    expect(incremental.headers).toEqual(cold.headers);
  });

  it('keeps furniture output cold-equivalent across the 9→10 page-count digit boundary', async () => {
    const paragraphCount = 9 * LINES_PER_PAGE;
    // The terminal paragraph grows past the last page boundary: the relaid
    // terminal suffix adds page 10, so PAGE/NUMPAGES cross a digit boundary.
    const { previous, incremental, cold } = await runScenario(paragraphCount, `p${paragraphCount - 1}`, LINES_PER_PAGE);
    expect(previous.layout.pages.length).toBe(9);
    expect(cold.layout.pages.length).toBe(10);
    expect(incremental.layout.pages.length).toBe(10);
    expect(incremental.layoutReuse.mode).toBe('tail-splice');
    expect(pageGeometry(incremental.layout)).toEqual(pageGeometry(cold.layout));
    expect(incremental.footers).toEqual(cold.footers);
    expect(incremental.headers).toEqual(cold.headers);
  });

  it('keeps furniture output cold-equivalent across the 99→100 page-count digit boundary', async () => {
    const paragraphCount = 99 * LINES_PER_PAGE;
    const { previous, incremental, cold } = await runScenario(paragraphCount, `p${paragraphCount - 1}`, LINES_PER_PAGE);
    expect(previous.layout.pages.length).toBe(99);
    expect(cold.layout.pages.length).toBe(100);
    expect(incremental.layout.pages.length).toBe(100);
    expect(incremental.layoutReuse.mode).toBe('tail-splice');
    expect(pageGeometry(incremental.layout)).toEqual(pageGeometry(cold.layout));
    expect(incremental.footers).toEqual(cold.footers);
    expect(incremental.headers).toEqual(cold.headers);
  });
});
