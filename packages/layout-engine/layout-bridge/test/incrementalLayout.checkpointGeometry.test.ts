/**
 * SD-3772 D2: deep mid-section checkpoint resume must reproduce cold layout
 * geometry exactly for the admitted dependency-rich class, including
 * documents with tall FLOWING header/footer content (margin inflation) and
 * differing per-section margins. A checkpoint page missing its stamped base
 * margins is a legacy/incomplete retained page and takes a named full
 * fallback instead of guessing from effective (inflated) margins.
 */

import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type {
  FlowBlock,
  Layout,
  Line,
  Page,
  ParagraphBlock,
  ParagraphMeasure,
  SectionBreakBlock,
} from '@superdoc/contracts';
import { clearIncrementalModuleState, incrementalLayout, type IncrementalLayoutReuseOptions } from '../src/index.js';

const PAGE_SIZE = { w: 600, h: 500 };
const DOC_MARGINS = { top: 40, right: 40, bottom: 40, left: 40, header: 20, footer: 20 };

function paragraph(id: string, text: string, pmStart: number): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [{ kind: 'text', text, pmStart, pmEnd: pmStart + text.length }],
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

/** One 60px line per body paragraph; furniture heights are distinguishable. */
async function measureBlock(block: FlowBlock): Promise<ParagraphMeasure> {
  if (block.kind !== 'paragraph') throw new Error(`unexpected block kind ${block.kind}`);
  const lineHeights = block.id.startsWith('hdr-tall')
    ? [60, 60]
    : block.id.startsWith('hdr-small')
      ? [10]
      : block.id.startsWith('ftr-')
        ? [50]
        : [60];
  return {
    kind: 'paragraph',
    lines: lineHeights.map(makeLine),
    totalHeight: lineHeights.reduce((sum, height) => sum + height, 0),
  };
}

function buildBlocks(
  edited: boolean,
  options: { dirtyBlockId?: string; unequalColumnParagraphCount?: number } = {},
): FlowBlock[] {
  const dirtyBlockId = options.dirtyBlockId ?? 'q40';
  const unequalColumnParagraphCount = options.unequalColumnParagraphCount ?? 6;
  const blocks: FlowBlock[] = [];
  let pm = 1;
  const push = (block: FlowBlock, textLength: number) => {
    blocks.push(block);
    pm += textLength + 2;
  };
  // Section 0: single column, document margins, small header.
  for (let index = 0; index < 10; index += 1) {
    push(paragraph(`p${index}`, `section-zero-${index}`, pm), 20);
  }
  // Section 1: the SD-3772 genuinely-unequal explicit two-column
  // carrier — balancing is a deliberate engine no-op for this class.
  const sb1: SectionBreakBlock = {
    kind: 'sectionBreak',
    id: 'sb1',
    type: 'nextPage',
    attrs: { sectionIndex: 1 },
    margins: { ...DOC_MARGINS },
    columns: { count: 2, gap: 40, equalWidth: false, widths: [120, 360] },
    headerRefs: { default: 'hdr-small' },
  };
  push(sb1, 0);
  for (let index = 0; index < unequalColumnParagraphCount; index += 1) {
    const id = `c${index}`;
    const text = edited && dirtyBlockId === id ? `columnS-${index}` : `columns-${index}`;
    push(paragraph(id, text, pm), text.length);
  }
  // Section 2: single column again, DIFFERENT base margins, tall flowing
  // header + footer (their content heights inflate the effective margins).
  const sb2: SectionBreakBlock = {
    kind: 'sectionBreak',
    id: 'sb2',
    type: 'nextPage',
    attrs: { sectionIndex: 2 },
    margins: { top: 60, right: 40, bottom: 50, left: 40, header: 20, footer: 20 },
    columns: { count: 1, gap: 0 },
    headerRefs: { default: 'hdr-tall' },
    footerRefs: { default: 'ftr-tall' },
  };
  push(sb2, 0);
  for (let index = 0; index < 60; index += 1) {
    // The edit is pm-length-neutral (one replaced character) so the proved
    // dirty region is exactly one block with no position transforms.
    const id = `q${index}`;
    const text = edited && dirtyBlockId === id ? `section-twO-${index}` : `section-two-${index}`;
    push(paragraph(id, text, pm), text.length);
  }
  return blocks;
}

function buildHeaderFooter() {
  return {
    headerBlocksByRId: new Map<string, FlowBlock[]>([
      ['hdr-small', [paragraph('hdr-small-p', 'small header', 1)]],
      ['hdr-tall', [paragraph('hdr-tall-p', 'tall flowing header', 1)]],
    ]),
    footerBlocksByRId: new Map<string, FlowBlock[]>([['ftr-tall', [paragraph('ftr-tall-p', 'tall footer', 1)]]]),
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
    sectionMetadata: [
      { sectionIndex: 0, headerRefs: { default: 'hdr-small' } },
      { sectionIndex: 1, headerRefs: { default: 'hdr-small' } },
      { sectionIndex: 2, headerRefs: { default: 'hdr-tall' }, footerRefs: { default: 'ftr-tall' } },
    ],
  };
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
  dirtyBlockId = 'q40',
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
      admittedDependencyClasses: ['multiple-sections', 'non-balanceable-multi-column-sections'],
      multiColumnSectionsProvedNonBalanceable: true,
      renderInputsUnchanged: true,
      pageReferencesAbsent: true,
    },
  };
}

function buildHeaderFooterOnlyReuse(
  previousLayout: Layout,
  previousGeometryFingerprint: string,
): IncrementalLayoutReuseOptions {
  const keys = previousLayout.pages.map(buildPageStartKey);
  return {
    previousLayout,
    retainedMetadataSourceLayoutEpoch: previousLayout.layoutEpoch ?? null,
    previousPageStartKeys: keys,
    previousPageStartKeyIndex: new Map(keys.map((key, index) => [key, [index]])),
    previousBlockPageIndex: buildBlockPageIndex(previousLayout),
    provedHeaderFooterOnlyRefresh: {
      bodyProjectionRetainedExact: true,
      bodyLayoutInputsUnchanged: true,
      previousGeometryFingerprint,
    },
  };
}

function pageGeometry(layout: Layout) {
  return layout.pages.map((page) => ({
    size: page.size ?? null,
    margins: page.margins ?? null,
    baseMargins: page.baseMargins ?? null,
    sectionIndex: page.sectionIndex ?? 0,
    displayNumber: page.displayNumber ?? null,
    numberText: page.numberText ?? null,
    orientation: page.orientation ?? null,
    columns: page.columns ?? null,
    fragments: page.fragments.map((fragment) => ({
      blockId: fragment.blockId,
      x: fragment.x,
      y: fragment.y,
      fromLine: 'fromLine' in fragment ? fragment.fromLine : null,
    })),
  }));
}

describe('incrementalLayout deep checkpoint geometry (SD-3772 D2)', () => {
  beforeEach(() => {
    clearIncrementalModuleState();
  });

  it('retains body pagination when a header text edit preserves measured furniture geometry', async () => {
    const blocks = buildBlocks(false);
    const previousFurniture = buildHeaderFooter();
    const previous = await incrementalLayout([], null, blocks, layoutOptions(), measureBlock, previousFurniture);
    previous.layout.layoutEpoch = 1;

    const currentFurniture = buildHeaderFooter();
    currentFurniture.headerBlocksByRId.set('hdr-tall', [paragraph('hdr-tall-p', 'updated tall flowing header', 1)]);
    const incremental = await incrementalLayout(
      blocks,
      previous.layout,
      blocks,
      layoutOptions(),
      measureBlock,
      currentFurniture,
      previous.measures,
      undefined,
      undefined,
      buildHeaderFooterOnlyReuse(previous.layout, previous.headerFooterGeometryFingerprint),
    );

    expect(incremental.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: 'm4-header-footer-geometry-stable-body-tail-adopted',
      pagesPaginated: 0,
      checkpointPageIndex: 0,
    });
    expect(incremental.measures).toBe(previous.measures);
    expect(incremental.measureReuse).toMatchObject({ mode: 'body-stable', blocksMeasured: 0 });

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, blocks, layoutOptions(), measureBlock, currentFurniture);
    expect(pageGeometry(incremental.layout)).toEqual(pageGeometry(cold.layout));
    expect(incremental.headers).toEqual(cold.headers);
  });

  it('falls back to canonical pagination when a header edit changes measured furniture height', async () => {
    const blocks = buildBlocks(false);
    const previous = await incrementalLayout([], null, blocks, layoutOptions(), measureBlock, buildHeaderFooter());
    previous.layout.layoutEpoch = 1;

    const shorterFurniture = buildHeaderFooter();
    shorterFurniture.headerBlocksByRId.set('hdr-tall', [
      paragraph('hdr-small-replacement', 'short replacement header', 1),
    ]);
    const incremental = await incrementalLayout(
      blocks,
      previous.layout,
      blocks,
      layoutOptions(),
      measureBlock,
      shorterFurniture,
      previous.measures,
      undefined,
      undefined,
      buildHeaderFooterOnlyReuse(previous.layout, previous.headerFooterGeometryFingerprint),
    );

    expect(incremental.layoutReuse?.mode).toBe('full');
    expect(incremental.layoutReuse?.reason).toContain('header-footer-only=furniture-geometry-changed');

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, blocks, layoutOptions(), measureBlock, shorterFurniture);
    expect(pageGeometry(incremental.layout)).toEqual(pageGeometry(cold.layout));
  });

  it('resumes a deep mid-section checkpoint with tall flowing furniture and matches cold geometry exactly', async () => {
    const previousBlocks = buildBlocks(false);
    const previous = await incrementalLayout(
      [],
      null,
      previousBlocks,
      layoutOptions(),
      measureBlock,
      buildHeaderFooter(),
    );
    previous.layout.layoutEpoch = 1;

    // The fixture must actually exercise margin inflation: section-2 pages
    // carry an effective top (header distance 20 + tall header 120 = 140)
    // above their base top (60), and stamped base margins on every page.
    const sectionTwoPage = previous.layout.pages.find((page) => page.sectionIndex === 2);
    expect(sectionTwoPage?.baseMargins).toEqual({ top: 60, bottom: 50 });
    expect(sectionTwoPage?.margins?.top).toBeGreaterThan(100);
    expect(previous.layout.pages.every((page) => page.baseMargins != null)).toBe(true);

    const nextBlocks = buildBlocks(true);
    const reuseOptions = buildReuseOptions(previous.layout, nextBlocks);
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
      reuseOptions,
    );

    // A real DEEP mid-section resume: the checkpoint sits past section 2's
    // first page, so the resumed run restores section state it never re-read
    // from the leading blocks.
    expect(incremental.layoutReuse.mode).toBe('tail-splice');
    const sectionTwoFirstPage = previous.layout.pages.findIndex((page) => page.sectionIndex === 2);
    expect(incremental.layoutReuse.checkpointPageIndex).toBeGreaterThan(sectionTwoFirstPage);

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, layoutOptions(), measureBlock, buildHeaderFooter());
    expect(incremental.layout.pages.length).toBe(cold.layout.pages.length);
    expect(pageGeometry(incremental.layout)).toEqual(pageGeometry(cold.layout));
  });

  it('resumes inside a continuous unequal-column section without changing its reflow boundary', async () => {
    const fixtureOptions = { dirtyBlockId: 'c15', unequalColumnParagraphCount: 20 };
    const previousBlocks = buildBlocks(false, fixtureOptions);
    const previous = await incrementalLayout(
      [],
      null,
      previousBlocks,
      layoutOptions(),
      measureBlock,
      buildHeaderFooter(),
    );
    previous.layout.layoutEpoch = 1;

    const nextBlocks = buildBlocks(true, fixtureOptions);
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
      buildReuseOptions(previous.layout, nextBlocks, fixtureOptions.dirtyBlockId),
    );

    expect(incremental.layoutReuse.mode).toBe('tail-splice');
    const sectionOneFirstPage = previous.layout.pages.findIndex((page) => page.sectionIndex === 1);
    expect(incremental.layoutReuse.checkpointPageIndex).toBeGreaterThan(sectionOneFirstPage);

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, layoutOptions(), measureBlock, buildHeaderFooter());
    expect(pageGeometry(incremental.layout)).toEqual(pageGeometry(cold.layout));
  });

  it('takes the named full fallback when the checkpoint page lacks stamped base margins', async () => {
    const previousBlocks = buildBlocks(false);
    const previous = await incrementalLayout(
      [],
      null,
      previousBlocks,
      layoutOptions(),
      measureBlock,
      buildHeaderFooter(),
    );
    previous.layout.layoutEpoch = 1;
    // Simulate a legacy retained layout recorded before base margins were
    // stamped on every page: the checkpoint must NOT fall back to the
    // already-inflated effective margins.
    for (const page of previous.layout.pages) {
      delete (page as { baseMargins?: unknown }).baseMargins;
    }

    const nextBlocks = buildBlocks(true);
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
      buildReuseOptions(previous.layout, nextBlocks),
    );

    expect(incremental.layoutReuse.mode).toBe('full');
    expect(incremental.layoutReuse.reason).toBe('m4-layout-reuse-disabled-checkpoint-base-margins-missing');
  });

  it('rejects a page-checkpoint proof that omits its admitted dependency classes', async () => {
    const previousBlocks = buildBlocks(false);
    const previous = await incrementalLayout(
      [],
      null,
      previousBlocks,
      layoutOptions(),
      measureBlock,
      buildHeaderFooter(),
    );
    previous.layout.layoutEpoch = 1;
    const nextBlocks = buildBlocks(true);
    const reuse = buildReuseOptions(previous.layout, nextBlocks) as IncrementalLayoutReuseOptions & {
      dependencyProof: Record<string, unknown>;
    };
    delete reuse.dependencyProof.admittedDependencyClasses;

    const result = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      layoutOptions(),
      measureBlock,
      buildHeaderFooter(),
      previous.measures,
      undefined,
      undefined,
      reuse,
    );

    expect(result.layoutReuse).toMatchObject({
      mode: 'full',
      reason: 'm4-layout-reuse-disabled-dependency-proof-invalid',
    });
  });

  // Plan 14 / SD-3772 D1: a page-checkpoint proof that does NOT positively
  // prove every multi-column section genuinely unequal (balancing inert) is
  // invalid as a WHOLE — end-of-section balancing is a post-pagination
  // finalizer whose seed a mid-section checkpoint cannot restore, so the
  // admission must fail closed at the bridge even if the host mislabeled it.
  it('rejects a page-checkpoint proof that does not prove multi-column sections non-balanceable', async () => {
    const previousBlocks = buildBlocks(false);
    const previous = await incrementalLayout(
      [],
      null,
      previousBlocks,
      layoutOptions(),
      measureBlock,
      buildHeaderFooter(),
    );
    previous.layout.layoutEpoch = 1;
    const nextBlocks = buildBlocks(true);
    const reuse = buildReuseOptions(previous.layout, nextBlocks) as IncrementalLayoutReuseOptions & {
      dependencyProof: Record<string, unknown>;
    };
    reuse.dependencyProof.multiColumnSectionsProvedNonBalanceable = false;

    const result = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      layoutOptions(),
      measureBlock,
      buildHeaderFooter(),
      previous.measures,
      undefined,
      undefined,
      reuse,
    );

    expect(result.layoutReuse).toMatchObject({
      mode: 'full',
      reason: 'm4-layout-reuse-disabled-dependency-proof-invalid',
    });

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, layoutOptions(), measureBlock, buildHeaderFooter());
    expect(result.layout.pages).toEqual(cold.layout.pages);
    expect(new Map(result.layout.blockResumeCheckpoints ?? [])).toEqual(
      new Map(cold.layout.blockResumeCheckpoints ?? []),
    );
  });
});
