/**
 * Plan 10 — note dependency closure at the incremental (m4) admission tier.
 *
 * The footnote PLACEMENT machinery is covered by the footnote* suites; the
 * warm seed chain by footnoteWarmStart. What was unpinned is the affected-
 * frontier admission posture for note-bearing documents:
 *
 *  1. a body edit AWAY from the note page, with the `footnotes` dependency
 *     class admitted by the typed proof, must produce EXACT cold-equal
 *     output after stripping the retained note band and injecting the current
 *     fixed-point band exactly once;
 *  2. an edit that changes the ref-carrying paragraph itself must stay
 *     cold-exact (spill/demand effects included) — on this fixture demand
 *     shifts pagination beyond the convergence budget, so the pinned outcome
 *     is the NAMED exhausted fallback with full-but-exact output;
 *  3. a proof that OMITS the `footnotes` class while footnotes exist must
 *     fail closed to a named full result with cold-exact output;
 *  4. a malformed note relationship (refs without block anchoring) must fail
 *     closed to its NAMED fallback, never a silent partial adoption.
 */
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { FlowBlock, Layout, Line, Measure, Page, ParagraphBlock, ParagraphMeasure } from '@superdoc/contracts';
import { clearIncrementalModuleState, incrementalLayout, type IncrementalLayoutReuseOptions } from '../src/index.js';
import { computeDirtyRegions } from '../src/diff.js';

const LINE_H = 30;

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
    lineHeight: LINE_H,
  };
  return { kind: 'paragraph', lines: [line], totalHeight: LINE_H };
}

const measureBlock = vi.fn(async (block: FlowBlock): Promise<Measure> => {
  if (block.kind !== 'paragraph') throw new Error(`Unexpected block kind ${block.kind}`);
  if (block.id.startsWith('footnote-')) {
    const line: Line = {
      fromRun: 0,
      fromChar: 0,
      toRun: 0,
      toChar: 4,
      width: 100,
      ascent: 10,
      descent: 2,
      lineHeight: 12,
    };
    return { kind: 'paragraph', lines: [line, line], totalHeight: 24 };
  }
  return paragraphMeasure(block);
});

/** Ref anchored inside p6; footnote body renders as a two-line band. */
const NOTE_REF_BLOCK = 'p6';
const NOTE_OPTIONS = {
  pageSize: { w: 240, h: 140 },
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  columns: { count: 1, gap: 0 },
  footnotes: {
    refs: [{ id: '1', pos: 1 + 6 * 20 + 2, blockId: NOTE_REF_BLOCK }],
    blocksById: new Map([['1', [paragraph('footnote-1-0-paragraph', 'note', 0)]]]),
    topPadding: 6,
    dividerHeight: 6,
  },
};

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

function applyOrdinaryTextEdit(blocks: ParagraphBlock[], edited: ParagraphBlock): ParagraphBlock[] {
  return blocks.map((block) =>
    block.id === edited.id
      ? paragraph(block.id, `${block.runs[0]!.text}!`, block.runs[0]!.pmStart!)
      : paragraph(
          block.id,
          block.runs[0]!.text,
          block.runs[0]!.pmStart! + (block.runs[0]!.pmStart! > edited.runs[0]!.pmStart! ? 1 : 0),
        ),
  );
}

function buildNoteReuse(
  previousBlocks: FlowBlock[],
  nextBlocks: FlowBlock[],
  previousLayout: Layout,
  editPmEnd: number,
  admitFootnotes: boolean,
): IncrementalLayoutReuseOptions {
  const previousPageStartKeys = previousLayout.pages.map(pageStartKey);
  const previousPageStartKeyIndex = new Map<string, number[]>();
  previousPageStartKeys.forEach((key, index) => {
    previousPageStartKeyIndex.set(key, [...(previousPageStartKeyIndex.get(key) ?? []), index]);
  });
  const provedDirtyRegion = computeDirtyRegions(previousBlocks, nextBlocks);
  return {
    previousLayout,
    retainedMetadataSourceLayoutEpoch: previousLayout.layoutEpoch ?? null,
    previousPageStartKeys,
    previousPageStartKeyIndex,
    previousBlockPageIndex: blockPageIndex(previousLayout),
    currentBlockIndexById: new Map(nextBlocks.map((block, index) => [block.id, index])),
    maxRelaidPages: 3,
    requireDocumentStartCheckpoint: false,
    dirtyBlockIds: provedDirtyRegion.changedBlockIds,
    pmShift: { atChar: editPmEnd, delta: 1 },
    provedDirtyRegion,
    // Mirrors the exact per-block constraint proof supplied by the host. The
    // note-seed height exception is deliberately reachable only from this
    // proved dirty-measure lane, never from an ordinary full-scan caller.
    provedDirtyMeasureConstraints: new Map(
      provedDirtyRegion.changedBlockIds.map((id) => [id, { maxWidth: 220, maxHeight: 120 }]),
    ),
    dependencyProof: {
      profile: 'page-checkpoint-local-text',
      blockIdsUnchanged: true,
      blockIdsUnique: true,
      globalDependenciesAbsent: false,
      globalDependenciesFencedByPageCheckpoint: true,
      admittedDependencyClasses: admitFootnotes ? ['footnotes'] : ['body-anchored-objects'],
      renderInputsUnchanged: true,
      pageReferencesAbsent: true,
      multiColumnSectionsProvedNonBalanceable: true,
    },
  } as IncrementalLayoutReuseOptions;
}

function buildProvedNoteOnlyReuse(blocks: ParagraphBlock[], previousLayout: Layout): IncrementalLayoutReuseOptions {
  const previousPageStartKeys = previousLayout.pages.map(pageStartKey);
  const previousPageStartKeyIndex = new Map<string, number[]>();
  previousPageStartKeys.forEach((key, index) => {
    previousPageStartKeyIndex.set(key, [...(previousPageStartKeyIndex.get(key) ?? []), index]);
  });
  const currentBlockIndexById = new Map(blocks.map((block, index) => [block.id, index]));
  const stableBlockIds = new Set(blocks.map((block) => block.id));
  stableBlockIds.delete(NOTE_REF_BLOCK);
  const provedDirtyRegion = {
    firstDirtyIndex: 6,
    lastStableIndex: 5,
    insertedBlockIds: [],
    deletedBlockIds: [],
    changedBlockIds: [NOTE_REF_BLOCK],
    stableBlockIds,
  };
  return {
    previousLayout,
    retainedMetadataSourceLayoutEpoch: previousLayout.layoutEpoch ?? null,
    previousPageStartKeys,
    previousPageStartKeyIndex,
    previousBlockPageIndex: blockPageIndex(previousLayout),
    previousBlockIndexById: currentBlockIndexById,
    currentBlockIndexById,
    maxRelaidPages: 3,
    requireDocumentStartCheckpoint: false,
    dirtyBlockIds: [NOTE_REF_BLOCK],
    provedDirtyRegion,
    provedDirtyMeasureConstraints: new Map([[NOTE_REF_BLOCK, { maxWidth: 220, maxHeight: 120 }]]),
    dependencyProof: {
      profile: 'page-checkpoint-local-text',
      blockIdsUnchanged: true,
      blockIdsUnique: true,
      globalDependenciesAbsent: false,
      globalDependenciesFencedByPageCheckpoint: true,
      admittedDependencyClasses: ['footnotes'],
      renderInputsUnchanged: true,
      pageReferencesAbsent: true,
      multiColumnSectionsProvedNonBalanceable: true,
    },
    provedNoteOnlyRefresh: {
      noteIds: ['1'],
      bodyReferenceBlockIds: [NOTE_REF_BLOCK],
    },
  };
}

function paginationGeometry(layout: Layout): unknown {
  return layout.pages.map((page) => ({
    size: page.size,
    margins: page.margins,
    sectionIndex: page.sectionIndex,
    fragments: page.fragments.map((fragment) => ({
      kind: fragment.kind,
      blockId: fragment.blockId,
      x: fragment.x,
      y: fragment.y,
      width: fragment.width,
      fromLine: 'fromLine' in fragment ? fragment.fromLine : undefined,
      toLine: 'toLine' in fragment ? fragment.toLine : undefined,
      continuesFromPrev: 'continuesFromPrev' in fragment ? fragment.continuesFromPrev : undefined,
      continuesOnNext: 'continuesOnNext' in fragment ? fragment.continuesOnNext : undefined,
    })),
  }));
}

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('incrementalLayout note dependency closure (plan 10)', () => {
  beforeEach(() => {
    clearIncrementalModuleState();
    measureBlock.mockClear();
  });

  it('keeps a body edit away from the note page cold-exact with the footnotes class admitted', async () => {
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, NOTE_OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    const retainedLayoutBeforeEdit = json(previous.layout);

    const edit = previousBlocks[20]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      NOTE_OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: previous.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
      buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, true),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, NOTE_OPTIONS, measureBlock);
    expect(paginationGeometry(incremental.layout)).toEqual(paginationGeometry(cold.layout));
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    expect(json(previous.layout)).toEqual(retainedLayoutBeforeEdit);
    const reuse = incremental.layoutReuse as { mode?: string; reason?: string; pagesPaginated?: number };
    expect(reuse.mode).toBe('tail-splice');
    expect(reuse.reason).toBe('m4-affected-frontier-converged-tail-adopted');
    expect(reuse.pagesPaginated!).toBeLessThanOrEqual(6);
  });

  it('keeps external note fragments bounded from a document-start checkpoint', async () => {
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, NOTE_OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    const edit = previousBlocks[0]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const checkpointReuse = buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, true);
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
        pageReferencesAbsent: true,
      },
    };
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      NOTE_OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: previous.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
      reuse,
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, NOTE_OPTIONS, measureBlock);
    expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice', checkpointPageIndex: 0 });
    expect(json(incremental.layout)).toEqual(json(cold.layout));
  });

  it('retains an exact note seed when the dirty proof intentionally omits the document-wide section-height scan', async () => {
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, NOTE_OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;
    expect(previous.footnoteReserveSeed).not.toBeNull();
    // The exact dirty-measure path intentionally avoids a whole-document
    // section scan. Its conservative max-height cache key can therefore
    // differ from the cold seed even though the retained note blocks and
    // measures have already been identity-validated.
    const seedFromDocumentWideScan = {
      ...previous.footnoteReserveSeed!,
      measurementHeight: previous.footnoteReserveSeed!.measurementHeight + 80,
    };

    const edit = previousBlocks[20]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      NOTE_OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: seedFromDocumentWideScan,
        noteMeasurePlaneRetainedExact: true,
      },
      buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, true),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, NOTE_OPTIONS, measureBlock);
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    expect(incremental.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: 'm4-affected-frontier-converged-tail-adopted',
    });
  });

  it('preserves the lazy retained page sequence while reinjecting the current note band', async () => {
    const previousBlocks = paragraphs(120);
    const previous = await incrementalLayout([], null, previousBlocks, NOTE_OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = previousBlocks[20]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const reuse = buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, true);

    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      NOTE_OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: previous.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
      reuse,
    );

    expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
    expect(Object.getOwnPropertyDescriptor(incremental.layout.pages, '0')?.writable).toBe(false);

    incremental.layout.layoutEpoch = 2;
    const secondEdit = nextBlocks[24]!;
    const twiceEditedBlocks = applyOrdinaryTextEdit(nextBlocks, secondEdit);
    const secondIncremental = await incrementalLayout(
      nextBlocks,
      incremental.layout,
      twiceEditedBlocks,
      NOTE_OPTIONS,
      measureBlock,
      undefined,
      incremental.measures,
      undefined,
      {
        footnoteReserveSeed: incremental.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
      buildNoteReuse(nextBlocks, twiceEditedBlocks, incremental.layout, secondEdit.runs[0]!.pmEnd!, true),
    );

    expect(secondIncremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
    expect(Object.getOwnPropertyDescriptor(secondIncremental.layout.pages, '0')?.writable).toBe(false);
  });

  it('remeasures a same-id note block when the retained note-plane object changes', async () => {
    const noteMeasureBlock = vi.fn(async (block: FlowBlock): Promise<Measure> => {
      if (block.kind !== 'paragraph') throw new Error(`Unexpected block kind ${block.kind}`);
      if (!block.id.startsWith('footnote-')) return paragraphMeasure(block);
      const textLength = block.runs.reduce((length, run) => length + ('text' in run ? run.text.length : 0), 0);
      const lineCount = textLength > 4 ? 5 : 2;
      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: textLength,
        width: 100,
        ascent: 10,
        descent: 2,
        lineHeight: 12,
      };
      return { kind: 'paragraph', lines: Array.from({ length: lineCount }, () => line), totalHeight: 12 * lineCount };
    });
    const retainedNoteBlock = paragraph('footnote-1-0-paragraph', 'note', 0);
    const currentNoteBlock = paragraph('footnote-1-0-paragraph', 'expanded note', 0);
    const previousOptions = {
      ...NOTE_OPTIONS,
      footnotes: { ...NOTE_OPTIONS.footnotes, blocksById: new Map([['1', [retainedNoteBlock]]]) },
    };
    const currentOptions = {
      ...NOTE_OPTIONS,
      footnotes: { ...NOTE_OPTIONS.footnotes, blocksById: new Map([['1', [currentNoteBlock]]]) },
    };
    const blocks = paragraphs(36);
    const previous = await incrementalLayout([], null, blocks, previousOptions, noteMeasureBlock);

    noteMeasureBlock.mockClear();
    const warm = await incrementalLayout(
      blocks,
      previous.layout,
      blocks,
      currentOptions,
      noteMeasureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: previous.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
    );

    expect(noteMeasureBlock.mock.calls.some(([block]) => block === currentNoteBlock)).toBe(true);
    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, blocks, currentOptions, noteMeasureBlock);
    expect(json(warm.layout)).toEqual(json(cold.layout));
  });

  it('reuses only the affected note page when note text keeps identical layout geometry', async () => {
    const noteMeasureBlock = vi.fn(async (block: FlowBlock): Promise<Measure> => {
      if (block.kind !== 'paragraph') throw new Error(`Unexpected block kind ${block.kind}`);
      if (!block.id.startsWith('footnote-')) return paragraphMeasure(block);
      const textLength = block.runs.reduce((length, run) => length + ('text' in run ? run.text.length : 0), 0);
      const lineCount = textLength > 12 ? 5 : 2;
      const line: Line = {
        fromRun: 0,
        fromChar: 0,
        toRun: 0,
        toChar: textLength,
        width: 100,
        ascent: 10,
        descent: 2,
        lineHeight: 12,
      };
      return {
        kind: 'paragraph',
        lines: Array.from({ length: lineCount }, () => line),
        totalHeight: 12 * lineCount,
      };
    });
    const retainedNoteBlock = paragraph('footnote-1-0-paragraph', 'note', 0);
    const currentNoteBlock = paragraph('footnote-1-0-paragraph', 'note!', 0);
    const previousOptions = {
      ...NOTE_OPTIONS,
      footnotes: { ...NOTE_OPTIONS.footnotes, blocksById: new Map([['1', [retainedNoteBlock]]]) },
    };
    const currentOptions = {
      ...NOTE_OPTIONS,
      footnotes: { ...NOTE_OPTIONS.footnotes, blocksById: new Map([['1', [currentNoteBlock]]]) },
    };
    const blocks = paragraphs(36);
    const previous = await incrementalLayout([], null, blocks, previousOptions, noteMeasureBlock);
    previous.layout.layoutEpoch = 1;
    const reuse = buildProvedNoteOnlyReuse(blocks, previous.layout);

    const incremental = await incrementalLayout(
      blocks,
      previous.layout,
      blocks,
      currentOptions,
      noteMeasureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: previous.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
      reuse,
      reuse,
    );

    expect(incremental.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: 'm4-note-only-geometry-stable-tail-adopted',
      pagesPaginated: 0,
      pagesSplicedByReuse: expect.any(Number),
    });
    expect(incremental.layoutReuse?.pagesSplicedByReuse).toBeGreaterThan(0);
    expect(incremental.extraBlocks).toContain(currentNoteBlock);
    expect(incremental.footnoteReserveSeed?.noteBlocksByBlockId?.get(currentNoteBlock.id)).toBe(currentNoteBlock);

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, blocks, currentOptions, noteMeasureBlock);
    cold.layout.layoutEpoch = incremental.layout.layoutEpoch;
    expect(json(incremental.layout)).toEqual(json(cold.layout));

    const expandedNoteBlock = paragraph('footnote-1-0-paragraph', 'expanded note body', 0);
    const expandedOptions = {
      ...NOTE_OPTIONS,
      footnotes: { ...NOTE_OPTIONS.footnotes, blocksById: new Map([['1', [expandedNoteBlock]]]) },
    };
    const expanded = await incrementalLayout(
      blocks,
      previous.layout,
      blocks,
      expandedOptions,
      noteMeasureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: previous.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
      reuse,
      reuse,
    );
    expect(expanded.layoutReuse?.reason).not.toBe('m4-note-only-geometry-stable-tail-adopted');
    expect(expanded.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: expect.stringContaining('m4-footnote-reserve-localized'),
    });

    clearIncrementalModuleState();
    const expandedCold = await incrementalLayout([], null, blocks, expandedOptions, noteMeasureBlock);
    expandedCold.layout.layoutEpoch = expanded.layout.layoutEpoch;
    expect(json(expanded.layout)).toEqual(json(expandedCold.layout));
  });

  it('keeps retained-tail checkpoint note anchors cold-exact after a preceding position shift', async () => {
    const refBlockId = 'p48';
    const previousRefPos = 1 + 48 * 20 + 2;
    const previousOptions = {
      ...NOTE_OPTIONS,
      footnotes: {
        ...NOTE_OPTIONS.footnotes,
        refs: [{ id: '1', pos: previousRefPos, blockId: refBlockId }],
      },
    };
    const currentOptions = {
      ...previousOptions,
      footnotes: {
        ...previousOptions.footnotes,
        refs: [{ id: '1', pos: previousRefPos + 1, blockId: refBlockId }],
      },
    };
    const previousBlocks = paragraphs(60);
    const previous = await incrementalLayout([], null, previousBlocks, previousOptions, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = previousBlocks[20]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      currentOptions,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      {
        footnoteReserveSeed: previous.footnoteReserveSeed,
        noteMeasurePlaneRetainedExact: true,
      },
      buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, true),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, currentOptions, measureBlock);
    const coldCheckpoints = new Map(cold.layout.blockResumeCheckpoints ?? []);
    expect(
      [...coldCheckpoints.values()].some((checkpoint) =>
        checkpoint.footnoteAnchorsThisPage.some((anchor) => anchor.pmPos === previousRefPos + 1),
      ),
    ).toBe(true);
    expect(incremental.layoutReuse).toMatchObject({ mode: 'tail-splice' });
    expect(new Map(incremental.layout.blockResumeCheckpoints ?? [])).toEqual(coldCheckpoints);
  });

  it('keeps an edit to the ref-carrying paragraph cold-exact (demand effects included)', async () => {
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, NOTE_OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = previousBlocks.find((block) => block.id === NOTE_REF_BLOCK)!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      NOTE_OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, true),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, NOTE_OPTIONS, measureBlock);
    expect(paginationGeometry(incremental.layout)).toEqual(paginationGeometry(cold.layout));
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    const reuse = incremental.layoutReuse as { mode?: string; reason?: string };
    expect(reuse.mode).toBe('tail-splice');
    expect(reuse.reason).toMatch(/^m4-footnote-reserve-localized;/);
  });

  it('stays cold-exact and typed when the proof omits the footnotes class', async () => {
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, NOTE_OPTIONS, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = previousBlocks[20]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      NOTE_OPTIONS,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, false),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, NOTE_OPTIONS, measureBlock);
    expect(paginationGeometry(incremental.layout)).toEqual(paginationGeometry(cold.layout));
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    const reuse = incremental.layoutReuse as { mode?: string; reason?: string };
    expect(reuse).toEqual(
      expect.objectContaining({
        mode: 'full',
        reason: 'm4-layout-reuse-disabled-footnote-dependency-class-missing',
      }),
    );
  });

  it('fails closed to the named fallback when note refs lack block anchoring', async () => {
    const unanchoredOptions = {
      ...NOTE_OPTIONS,
      footnotes: { ...NOTE_OPTIONS.footnotes, refs: [{ id: '1', pos: 1 + 6 * 20 + 2 }] },
    };
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, unanchoredOptions, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = previousBlocks[20]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      unanchoredOptions,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, true),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, unanchoredOptions, measureBlock);
    expect(paginationGeometry(incremental.layout)).toEqual(paginationGeometry(cold.layout));
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    const reuse = incremental.layoutReuse as { mode?: string; reason?: string };
    expect(reuse.mode).toBe('full');
    expect(reuse.reason).toBe('m4-layout-reuse-disabled-footnote-reference-block-id-missing');
  });

  it('does not require the footnotes class for an empty note input', async () => {
    const emptyNoteOptions = {
      ...NOTE_OPTIONS,
      footnotes: { ...NOTE_OPTIONS.footnotes, refs: [], blocksById: new Map<string, FlowBlock[]>() },
    };
    const previousBlocks = paragraphs(36);
    const previous = await incrementalLayout([], null, previousBlocks, emptyNoteOptions, measureBlock);
    previous.layout.layoutEpoch = 1;

    const edit = previousBlocks[20]!;
    const nextBlocks = applyOrdinaryTextEdit(previousBlocks, edit);
    const incremental = await incrementalLayout(
      previousBlocks,
      previous.layout,
      nextBlocks,
      emptyNoteOptions,
      measureBlock,
      undefined,
      previous.measures,
      undefined,
      undefined,
      buildNoteReuse(previousBlocks, nextBlocks, previous.layout, edit.runs[0]!.pmEnd!, false),
    );

    clearIncrementalModuleState();
    const cold = await incrementalLayout([], null, nextBlocks, emptyNoteOptions, measureBlock);
    expect(json(incremental.layout)).toEqual(json(cold.layout));
    expect(incremental.layoutReuse).toMatchObject({
      mode: 'tail-splice',
      reason: 'm4-affected-frontier-converged-tail-adopted',
    });
  });
});
