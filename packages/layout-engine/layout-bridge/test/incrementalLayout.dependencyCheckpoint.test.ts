import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type {
  DrawingBlock,
  DrawingMeasure,
  FlowBlock,
  ImageBlock,
  ImageMeasure,
  Layout,
  Line,
  Measure,
  Page,
  ParagraphBlock,
  ParagraphMeasure,
  TableBlock,
} from '@superdoc/contracts';
import { clearIncrementalModuleState, incrementalLayout, type IncrementalLayoutReuseOptions } from '../src/index.js';
import { computeDirtyRegions } from '../src/diff.js';
import { tableBlock, tableMeasure } from './mock-data.js';

const OPTIONS = {
  pageSize: { w: 240, h: 140 },
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  columns: { count: 1, gap: 0 },
};

function paragraph(id: string, text: string, pmStart: number): ParagraphBlock {
  return {
    kind: 'paragraph',
    id,
    runs: [{ kind: 'text', text, pmStart, pmEnd: pmStart + text.length }],
  };
}

function paragraphs(count: number): ParagraphBlock[] {
  return Array.from({ length: count }, (_, index) => paragraph(`p${index}`, `text-${index}`, 1 + index * 20));
}

function anchoredDrawing(): DrawingBlock {
  return {
    kind: 'drawing',
    id: 'body-anchor',
    drawingKind: 'vectorShape',
    geometry: { width: 42, height: 32 },
    anchor: {
      isAnchored: true,
      hRelativeFrom: 'column',
      vRelativeFrom: 'paragraph',
      offsetH: 120,
      offsetV: 4,
    },
    wrap: { type: 'Square' },
  };
}

function nonFlowingPageRelativeImage(carrierParagraphId: string, id = 'page-background'): ImageBlock {
  return {
    kind: 'image',
    id,
    src: 'data:image/png;base64,AA==',
    attrs: { anchorParagraphId: carrierParagraphId },
    anchor: {
      isAnchored: true,
      behindDoc: true,
      hRelativeFrom: 'page',
      vRelativeFrom: 'page',
      offsetH: 0,
      offsetV: 0,
    },
    wrap: { type: 'None', behindDoc: true },
  };
}

function tableDependency(pmStart: number): TableBlock {
  const sourceParagraph = tableBlock.rows[0]!.cells[0]!.blocks![0];
  if (sourceParagraph.kind !== 'paragraph') throw new Error('Expected table fixture paragraph');
  return {
    ...tableBlock,
    rows: [
      {
        ...tableBlock.rows[0]!,
        cells: [
          {
            ...tableBlock.rows[0]!.cells[0]!,
            blocks: [paragraph(sourceParagraph.id, sourceParagraph.runs[0]!.text, pmStart)],
          },
        ],
      },
    ],
  };
}

function paragraphMeasure(block: ParagraphBlock): ParagraphMeasure {
  const textLength = block.runs.reduce((length, run) => length + ('text' in run ? run.text.length : 0), 0);
  const line: Line = {
    fromRun: 0,
    fromChar: 0,
    toRun: 0,
    toChar: textLength,
    width: 100,
    ascent: 22,
    descent: 8,
    lineHeight: 30,
  };
  return { kind: 'paragraph', lines: [line], totalHeight: 30 };
}

const drawingMeasure: DrawingMeasure = {
  kind: 'drawing',
  drawingKind: 'vectorShape',
  width: 42,
  height: 32,
  scale: 1,
  naturalWidth: 42,
  naturalHeight: 32,
  geometry: { width: 42, height: 32 },
};

const imageMeasure: ImageMeasure = { kind: 'image', width: 220, height: 120 };

async function measureBlock(block: FlowBlock): Promise<Measure> {
  if (block.kind === 'paragraph') return paragraphMeasure(block);
  if (block.kind === 'drawing') return drawingMeasure;
  if (block.kind === 'image') return imageMeasure;
  if (block.kind === 'table') return tableMeasure;
  throw new Error(`Unexpected block kind ${block.kind}`);
}

function pageStartKey(page: Page): string {
  const first = page.fragments[0];
  const sectionIndex = page.sectionIndex ?? 0;
  if (!first) return `#empty#0#${sectionIndex}#0`;
  const from = 'fromLine' in first ? first.fromLine : 'fromRow' in first ? first.fromRow : 0;
  const carry = 'continuesFromPrev' in first && first.continuesFromPrev === true ? 1 : 0;
  return `${first.blockId}#${from ?? 0}#${sectionIndex}#${carry}`;
}

function blockPageIndex(layout: Layout): Map<string, { firstPage: number; lastPage: number }> {
  const index = new Map<string, { firstPage: number; lastPage: number }>();
  layout.pages.forEach((page, pageIndex) => {
    for (const fragment of page.fragments) {
      const previous = index.get(fragment.blockId);
      if (previous) previous.lastPage = pageIndex;
      else index.set(fragment.blockId, { firstPage: pageIndex, lastPage: pageIndex });
    }
  });
  return index;
}

function buildReuse(
  previousBlocks: FlowBlock[],
  nextBlocks: FlowBlock[],
  previousLayout: Layout,
  dependencyClass: 'body-anchored-objects' | 'non-flowing-page-relative-body-anchors' | 'page-references' | 'tables',
  editPmEnd: number,
): IncrementalLayoutReuseOptions {
  const previousPageStartKeys = previousLayout.pages.map(pageStartKey);
  const previousPageStartKeyIndex = new Map<string, number[]>();
  previousPageStartKeys.forEach((key, index) => {
    previousPageStartKeyIndex.set(key, [...(previousPageStartKeyIndex.get(key) ?? []), index]);
  });
  const provedDirtyRegion = computeDirtyRegions(previousBlocks, nextBlocks);
  const pageRelativeAnchorPageIndex = previousLayout.pages.findIndex((page) =>
    page.fragments.some((fragment) => fragment.blockId === 'page-background'),
  );
  return {
    previousLayout,
    retainedMetadataSourceLayoutEpoch: previousLayout.layoutEpoch ?? null,
    previousPageStartKeys,
    previousPageStartKeyIndex,
    previousBlockPageIndex: blockPageIndex(previousLayout),
    currentBlockIndexById: new Map(nextBlocks.map((block, index) => [block.id, index])),
    // The production host admits three pages beyond the proved affected
    // frontier; the bridge may materialize up to two lookahead pages while it
    // proves convergence, keeping total pagination within the six-page gate.
    maxRelaidPages: 3,
    requireDocumentStartCheckpoint: false,
    dirtyBlockIds: provedDirtyRegion.changedBlockIds,
    pmShift: { atChar: editPmEnd, delta: 1 },
    provedDirtyRegion,
    dependencyProof: {
      profile: 'page-checkpoint-local-text',
      blockIdsUnchanged: true,
      blockIdsUnique: true,
      globalDependenciesAbsent: false,
      globalDependenciesFencedByPageCheckpoint: true,
      admittedDependencyClasses: [dependencyClass],
      ...(dependencyClass === 'non-flowing-page-relative-body-anchors'
        ? {
            nonFlowingPageRelativeAnchorDependency: {
              version: 1 as const,
              sourceLayoutEpoch: previousLayout.layoutEpoch!,
              inventoryFingerprint: 'page-background-inventory-v1',
              entries: [
                {
                  blockId: 'page-background',
                  carrierParagraphId: 'p21',
                  sourcePageIndex: pageRelativeAnchorPageIndex,
                  sectionIndex: previousLayout.pages[pageRelativeAnchorPageIndex]?.sectionIndex ?? 0,
                  geometryFingerprint: 'page-background-geometry-v1',
                  measureFingerprint: 'page-background-measure-v1',
                  pageGeometryFingerprint: 'page-background-page-geometry-v1',
                },
              ],
            },
          }
        : {}),
      ...(dependencyClass === 'page-references'
        ? {
            pageReferencesAbsent: false as const,
            pageReferenceDependencyClosure: {
              referenceBlockIds: ['p2'],
              targetBookmarkIds: ['target'],
            },
          }
        : { pageReferencesAbsent: true as const }),
      multiColumnSectionsProvedNonBalanceable: true,
      renderInputsUnchanged: true,
    },
  };
}

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function applyOrdinaryTextEdit(blocks: FlowBlock[], edit: ParagraphBlock): FlowBlock[] {
  const editStart = edit.runs[0]!.pmStart!;
  return blocks.map((block) => {
    if (block.kind === 'paragraph') {
      const run = block.runs[0]!;
      if (block.id === edit.id) return paragraph(edit.id, `${run.text}!`, run.pmStart!);
      return run.pmStart! > editStart ? paragraph(block.id, run.text, run.pmStart! + 1) : block;
    }
    if (block.kind !== 'table') return block;
    return {
      ...block,
      rows: block.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => ({
          ...cell,
          blocks: cell.blocks?.map((nested) => {
            if (nested.kind !== 'paragraph') return nested;
            const run = nested.runs[0]!;
            return run.pmStart! > editStart ? paragraph(nested.id, run.text, run.pmStart! + 1) : nested;
          }),
        })),
      })),
    };
  });
}

describe('incrementalLayout admitted checkpoint dependencies', () => {
  beforeEach(() => clearIncrementalModuleState());

  for (const position of ['before', 'after'] as const) {
    it(`matches cold layout with a stable body anchor ${position} the dirty paragraph`, async () => {
      const base = paragraphs(36);
      const dependencyIndex = position === 'before' ? 15 : 21;
      const previousBlocks: FlowBlock[] = [
        ...base.slice(0, dependencyIndex),
        anchoredDrawing(),
        ...base.slice(dependencyIndex),
      ];
      const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
      previous.layout.layoutEpoch = 1;

      const edit = base[18]!;
      const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
      const incremental = await incrementalLayout(
        previousBlocks,
        previous.layout,
        nextBlocks,
        OPTIONS,
        measureBlock,
        undefined,
        previous.measures,
        undefined,
        undefined,
        buildReuse(previousBlocks, nextBlocks, previous.layout, 'body-anchored-objects', edit.runs[0]!.pmEnd!),
      );

      clearIncrementalModuleState();
      const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
      expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
      expect(incremental.layoutReuse.pagesPaginated).toBeLessThanOrEqual(6);
      expect(json(incremental.layout)).toEqual(json(cold.layout));
    });

    it(`matches cold layout with a stable table ${position} the dirty paragraph`, async () => {
      const base = paragraphs(36);
      const dependencyIndex = position === 'before' ? 15 : 21;
      const dependencyPmStart = position === 'before' ? 301 : 501;
      const previousBlocks: FlowBlock[] = [
        ...base.slice(0, dependencyIndex),
        tableDependency(dependencyPmStart),
        ...base.slice(dependencyIndex),
      ];
      const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
      previous.layout.layoutEpoch = 1;

      const edit = base[18]!;
      const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
      const incremental = await incrementalLayout(
        previousBlocks,
        previous.layout,
        nextBlocks,
        OPTIONS,
        measureBlock,
        undefined,
        previous.measures,
        undefined,
        undefined,
        buildReuse(previousBlocks, nextBlocks, previous.layout, 'tables', edit.runs[0]!.pmEnd!),
      );

      clearIncrementalModuleState();
      const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
      expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
      expect(incremental.layoutReuse.pagesPaginated).toBeLessThanOrEqual(6);
      expect(json(incremental.layout)).toEqual(json(cold.layout));
    });
  }

  it('matches cold layout with a stable non-flowing page-relative image in the retained tail', async () => {
    const base = paragraphs(36);
    const previousBlocks: FlowBlock[] = [...base.slice(0, 21), nonFlowingPageRelativeImage('p21'), ...base.slice(21)];
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    const edit = base[18]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildReuse(
        previousBlocks,
        nextBlocks,
        previous.layout,
        'non-flowing-page-relative-body-anchors',
        edit.runs[0]!.pmEnd!,
      ),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
    expect(incremental.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: 'm4-affected-frontier-converged-tail-adopted',
    });
    expect(incremental.layoutReuse.pagesPaginated).toBeLessThanOrEqual(6);
    expect(json(incremental.layout)).toEqual(json(cold.layout));
  });

  it('validates a retained page-relative image through structural block-id rewrites', async () => {
    const base = paragraphs(36);
    const previousBlocks: FlowBlock[] = [...base.slice(0, 21), nonFlowingPageRelativeImage('p21'), ...base.slice(21)];
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    const edit = base[18]!;
    const currentCarrierId = 'p21-current';
    const currentImageId = 'page-background-current';
    const edited = applyOrdinaryTextEdit(previousBlocks, edit).map((block) => {
      if (block.id === 'p21' && block.kind === 'paragraph') return { ...block, id: currentCarrierId };
      if (block.id === 'page-background' && block.kind === 'image') {
        return {
          ...block,
          id: currentImageId,
          attrs: { ...block.attrs, anchorParagraphId: currentCarrierId },
        };
      }
      return block;
    });
    const splitTail = paragraph('p18-tail', 'tail', edit.runs[0]!.pmEnd! + 1);
    const dirtyIndex = edited.findIndex((block) => block.id === edit.id);
    const nextBlocks = [...edited.slice(0, dirtyIndex + 1), splitTail, ...edited.slice(dirtyIndex + 1)];
    const stableBlockIds = new Set(nextBlocks.map((block) => block.id));
    stableBlockIds.delete(edit.id);
    stableBlockIds.delete(splitTail.id);
    const previousToCurrent = new Map([
      ['p21', currentCarrierId],
      ['page-background', currentImageId],
    ]);
    const currentToPrevious = new Map([...previousToCurrent].map(([previousId, currentId]) => [currentId, previousId]));
    const reuse = buildReuse(
      previousBlocks,
      nextBlocks,
      previous.layout,
      'non-flowing-page-relative-body-anchors',
      edit.runs[0]!.pmEnd!,
    );
    reuse.allowBlockIdChurn = true;
    reuse.previousBlockIndexById = new Map(previousBlocks.map((block, index) => [block.id, index]));
    reuse.currentBlockIndexById = new Map(nextBlocks.map((block, index) => [block.id, index]));
    reuse.blockIdRewrites = { previousToCurrent, currentToPrevious };
    reuse.dirtyBlockIds = [edit.id, splitTail.id];
    reuse.provedDirtyRegion = {
      firstDirtyIndex: dirtyIndex,
      lastStableIndex: dirtyIndex - 1,
      insertedBlockIds: [splitTail.id],
      deletedBlockIds: [],
      changedBlockIds: [edit.id, splitTail.id],
      stableBlockIds,
    };

    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      reuse,
    );

    expect(incremental.layoutReuse).not.toMatchObject({
      reason: 'm4-layout-reuse-disabled-page-relative-anchor-current-shape-mismatch',
    });
    expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
  });

  it('fails closed when the dirty block introduces an unproved page-relative image', async () => {
    const base = paragraphs(36);
    const previousBlocks: FlowBlock[] = [...base.slice(0, 21), nonFlowingPageRelativeImage('p21'), ...base.slice(21)];
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    const nextBlocks = previousBlocks.map((block) =>
      block.id === 'p18' ? nonFlowingPageRelativeImage('p17', 'p18') : block,
    );
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildReuse(
        previousBlocks,
        nextBlocks,
        previous.layout,
        'non-flowing-page-relative-body-anchors',
        base[18]!.runs[0]!.pmEnd!,
      ),
    );

    expect(incremental.layoutReuse).toMatchObject({
      mode: 'full',
      reason: 'm4-layout-reuse-disabled-page-relative-anchor-inventory-changed',
    });
  });

  it('admits a typed PAGEREF closure without turning it into a pagination token pass', async () => {
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    const edit = previousBlocks[18]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const reuse = buildReuse(previousBlocks, nextBlocks, previous.layout, 'page-references', edit.runs[0]!.pmEnd!);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      reuse,
    );
    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
    expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
    expect(incremental.layoutReuse.pagesPaginated).toBeLessThanOrEqual(6);
    expect(json(incremental.layout)).toEqual(json(cold.layout));

    const malformed = {
      ...reuse,
      dependencyProof: { ...reuse.dependencyProof, pageReferenceDependencyClosure: undefined },
    } as IncrementalLayoutReuseOptions;
    const rejected = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      malformed,
    );
    expect(rejected.layoutReuse).toMatchObject({
      mode: 'full',
      reason: 'm4-layout-reuse-disabled-dependency-proof-invalid',
    });
  });

  // Plan 11: the closure must hold with a REAL pageReference token run in the
  // retained pages, not only with the closure claimed abstractly. Pagination
  // stays exact under splice; ref TEXT recomputation is the resolve stage's
  // contract (anchor-stable → incremental splice, anchor-moved → named full;
  // pinned in v2-host resolve-layout-incremental.test.ts).
  function pageRefParagraph(id: string, text: string, pmStart: number): ParagraphBlock {
    return {
      kind: 'paragraph',
      id,
      runs: [
        {
          kind: 'text',
          text,
          pmStart,
          pmEnd: pmStart + text.length,
          token: 'pageReference',
          pageRefMetadata: { bookmarkId: 'target', instruction: 'PAGEREF target' },
        } as ParagraphBlock['runs'][number],
      ],
    };
  }

  it('splices cold-exact around a real pageReference token with the typed closure admitted', async () => {
    const base = paragraphs(36);
    const previousBlocks: FlowBlock[] = base.map((block, index) =>
      index === 2 ? pageRefParagraph(block.id, block.runs[0]!.text, block.runs[0]!.pmStart!) : block,
    );
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = base[18]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildReuse(previousBlocks, nextBlocks, previous.layout, 'page-references', edit.runs[0]!.pmEnd!),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
    expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
    expect(incremental.layoutReuse.pagesPaginated).toBeLessThanOrEqual(6);
    expect(json(incremental.layout)).toEqual(json(cold.layout));
  });

  it('admits a real pageReference closure from the required document-start checkpoint', async () => {
    const base = paragraphs(36);
    const previousBlocks: FlowBlock[] = base.map((block, index) =>
      index === 2 ? pageRefParagraph(block.id, block.runs[0]!.text, block.runs[0]!.pmStart!) : block,
    );
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = base[18]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const checkpointReuse = buildReuse(
      previousBlocks,
      nextBlocks,
      previous.layout,
      'page-references',
      edit.runs[0]!.pmEnd!,
    );
    const reuse: IncrementalLayoutReuseOptions = {
      ...checkpointReuse,
      requireDocumentStartCheckpoint: true,
      dependencyProof: {
        profile: 'document-start-local-text',
        blockIdsUnchanged: true,
        blockIdsUnique: true,
        globalDependenciesAbsent: false,
        globalDependenciesFencedByDocumentStart: true,
        multiColumnSectionsProvedNonBalanceable: true,
        renderInputsUnchanged: true,
        pageReferencesAbsent: false,
        pageReferenceDependencyClosure: checkpointReuse.dependencyProof!.pageReferenceDependencyClosure!,
      },
    };
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      reuse,
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
    expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice', checkpointPageIndex: 0 });
    expect(json(incremental.layout)).toEqual(json(cold.layout));
  });

  it('keeps an edit at the reference-carrying paragraph itself cold-exact', async () => {
    const base = paragraphs(36);
    const previousBlocks: FlowBlock[] = base.map((block, index) =>
      index === 18 ? pageRefParagraph(block.id, block.runs[0]!.text, block.runs[0]!.pmStart!) : block,
    );
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = previousBlocks[18] as ParagraphBlock;
    const nextBlocks = previousBlocks.map((block) => {
      if (block.kind !== 'paragraph') return block;
      const run = block.runs[0]! as { text: string; pmStart?: number };
      if (block.id === edit.id) {
        return pageRefParagraph(block.id, `${run.text}!`, run.pmStart!);
      }
      return run.pmStart! > edit.runs[0]!.pmStart! ? paragraph(block.id, run.text, run.pmStart! + 1) : block;
    });
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildReuse(previousBlocks, nextBlocks, previous.layout, 'page-references', edit.runs[0]!.pmEnd!),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    expect(incremental.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: 'm4-affected-frontier-converged-tail-adopted',
    });
  });

  // Plan 13: the anchor closure must hold when the ANCHOR ITSELF is the
  // dirty block, not only when a stable anchor sits near a dirty paragraph.
  // A wrap-affecting geometry change (offsetV) re-places the drawing and can
  // shift line packing on its page; the outcome must stay typed + cold-exact.
  it('keeps a dirty anchored drawing cold-exact with the body-anchored-objects class admitted', async () => {
    const base = paragraphs(36);
    const previousBlocks: FlowBlock[] = [...base.slice(0, 18), anchoredDrawing(), ...base.slice(18)];
    const previous = await incrementalLayout([], null, previousBlocks, OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    const previousAnchor = previous.layout.pages
      .flatMap((page) => page.fragments)
      .find((fragment) => fragment.blockId === 'body-anchor');
    expect(previousAnchor).toMatchObject({ kind: 'drawing', blockId: 'body-anchor' });

    const nextBlocks = previousBlocks.map((block) =>
      block.kind === 'drawing' && block.id === 'body-anchor'
        ? { ...block, anchor: { ...block.anchor!, offsetV: 12 } }
        : block,
    );
    const reuse = buildReuse(previousBlocks, nextBlocks, previous.layout, 'body-anchored-objects', 0);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      { ...reuse, pmShift: undefined },
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, OPTIONS, measureBlock);
    const coldAnchor = cold.layout.pages
      .flatMap((page) => page.fragments)
      .find((fragment) => fragment.blockId === 'body-anchor');
    expect(coldAnchor).toMatchObject({ kind: 'drawing', blockId: 'body-anchor' });
    expect(coldAnchor?.y).not.toBe(previousAnchor?.y);
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    expect(incremental.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: 'm4-terminal-suffix-relaid-with-prefix-adoption',
    });
  });
});
