import type {
  Layout,
  FlowMode,
  FlowBlock,
  Measure,
  Fragment,
  DrawingFragment,
  ImageFragment,
  ListItemFragment,
  ParaFragment,
  TableFragment,
  Line,
  ParagraphBorders,
  ResolvedLayout,
  ResolvedPage,
  ResolvedPaintItem,
  ResolvedFragmentItem,
  ResolvedParagraphContent,
  ListMeasure,
  ListBlock,
  ParagraphBlock,
  ParagraphMeasure,
  TableMeasure,
  LayoutStoryLocator,
  LineSegment,
  PageRefLocation,
  Run,
  TableBlock,
  TextRun,
} from '@superdoc/contracts';
import { buildPageRefAnchorMap, getSdtContainerKey } from '@superdoc/contracts';
import { resolveParagraphContent } from './resolveParagraph.js';
import { resolveTableItem } from './resolveTable.js';
import { resolveImageItem } from './resolveImage.js';
import { resolveDrawingItem } from './resolveDrawing.js';
import type { BlockMapEntry } from './resolvedBlockLookup.js';
import { hashParagraphBorders } from './paragraphBorderHash.js';
import {
  deriveBlockVersion,
  fragmentSignature,
  resolveFragmentLayoutIdentity,
  sourceAnchorSignature,
} from './versionSignature.js';
import { resolvePageRefText } from './resolvePageRefText.js';

export type ResolveLayoutInput = {
  layout: Layout;
  flowMode: FlowMode;
  blocks: FlowBlock[];
  measures: Measure[];
  /**
   * The document's font-mapping signature, folded into each block's paint-reuse version so a
   * runtime `fonts.map` change repaints (the same way a font load busts reuse via the global
   * epoch). Omitted/'' for default documents, leaving the version unchanged from before.
   */
  fontSignature?: string;
  bookmarks?: Map<string, number>;
};

export function buildBlockMap(blocks: FlowBlock[], measures: Measure[]): Map<string, BlockMapEntry> {
  const map = new Map<string, BlockMapEntry>();
  for (let i = 0; i < blocks.length; i++) {
    map.set(blocks[i].id, { block: blocks[i], measure: measures[i] });
  }
  return map;
}

type PageRefResolutionContext = {
  sourcePage: number;
  anchorMap?: Map<string, PageRefLocation>;
};

type ParagraphPageRefResolution = {
  block: ParagraphBlock;
  fragment: ParaFragment;
  changed: boolean;
};

type ResolvedPageRefRunText = {
  text: string;
  originalLength: number;
};

function resolveParagraphPageRefs(
  fragment: ParaFragment,
  block: ParagraphBlock,
  measure: ParagraphMeasure,
  context?: PageRefResolutionContext,
): ParagraphPageRefResolution {
  const runTexts = collectResolvedPageRefRunTexts(block, context);

  if (runTexts.size === 0) {
    return { block, fragment, changed: false };
  }

  const nextRuns = resolvePageRefRuns(block, runTexts);
  const sourceLines = fragment.lines ?? measure.lines.slice(fragment.fromLine, fragment.toLine);
  const nextLines = sourceLines.map((line) => adjustLineForResolvedPageRefs(line, runTexts));

  return {
    block: { ...block, runs: nextRuns },
    fragment: { ...fragment, lines: nextLines },
    changed: true,
  };
}

function resolveParagraphPageRefBlock(
  block: ParagraphBlock,
  measure?: ParagraphMeasure,
  context?: PageRefResolutionContext,
): { block: ParagraphBlock; measure?: ParagraphMeasure; changed: boolean } {
  const runTexts = collectResolvedPageRefRunTexts(block, context);
  if (runTexts.size === 0) return { block, changed: false };
  return {
    block: { ...block, runs: resolvePageRefRuns(block, runTexts) },
    measure: measure
      ? { ...measure, lines: measure.lines.map((line) => adjustLineForResolvedPageRefs(line, runTexts)) }
      : undefined,
    changed: true,
  };
}

function collectResolvedPageRefRunTexts(
  block: ParagraphBlock,
  context?: PageRefResolutionContext,
): Map<number, ResolvedPageRefRunText> {
  const runTexts = new Map<number, ResolvedPageRefRunText>();
  if (!context?.anchorMap?.size) return runTexts;

  block.runs.forEach((run, index) => {
    if (!isPageReferenceTextRun(run)) return;
    const target = context.anchorMap?.get(run.pageRefMetadata.bookmarkId);
    if (!target) return;
    const resolvedText = resolvePageRefText({
      sourcePage: context.sourcePage,
      sourcePmPosition: run.pmStart,
      target,
      metadata: run.pageRefMetadata,
    });
    if (resolvedText !== run.text) {
      runTexts.set(index, { text: resolvedText, originalLength: run.text.length });
    }
  });

  return runTexts;
}

function resolvePageRefRuns(
  block: ParagraphBlock,
  runTexts: Map<number, ResolvedPageRefRunText>,
): ParagraphBlock['runs'] {
  return block.runs.map((run, index) =>
    runTexts.has(index) && isTextRun(run) ? { ...run, text: runTexts.get(index)!.text } : run,
  );
}

function resolveTablePageRefs(
  block: TableBlock,
  measure?: TableMeasure,
  context?: PageRefResolutionContext,
): { block: TableBlock; measure?: TableMeasure; changed: boolean } {
  if (!context?.anchorMap?.size) return { block, changed: false };

  let changed = false;
  let measureChanged = false;
  const measureRows = measure?.rows.slice();
  const rows = block.rows.map((row, rowIndex) => {
    let rowChanged = false;
    const measureRow = measureRows?.[rowIndex];
    const measureCells = measureRow?.cells.slice();
    const cells = row.cells.map((cell, cellIndex) => {
      let cellChanged = false;
      let nextParagraph = cell.paragraph;
      let nextCellMeasure = measureCells?.[cellIndex];
      if (cell.paragraph) {
        const resolved = resolveParagraphPageRefBlock(cell.paragraph, nextCellMeasure?.paragraph, context);
        nextParagraph = resolved.block;
        if (resolved.measure && nextCellMeasure) {
          nextCellMeasure = { ...nextCellMeasure, paragraph: resolved.measure };
        }
        cellChanged ||= resolved.changed;
      }

      let nextBlocks = cell.blocks;
      let nextBlockMeasures = nextCellMeasure?.blocks;
      if (cell.blocks) {
        nextBlocks = cell.blocks.map((childBlock, childIndex) => {
          const childMeasure = nextBlockMeasures?.[childIndex];
          if (childBlock.kind === 'paragraph') {
            const resolved = resolveParagraphPageRefBlock(
              childBlock,
              childMeasure?.kind === 'paragraph' ? (childMeasure as ParagraphMeasure) : undefined,
              context,
            );
            if (resolved.measure && nextBlockMeasures) {
              nextBlockMeasures = nextBlockMeasures.slice();
              nextBlockMeasures[childIndex] = resolved.measure;
            }
            cellChanged ||= resolved.changed;
            return resolved.block;
          }
          if (childBlock.kind === 'table') {
            const resolved = resolveTablePageRefs(
              childBlock,
              childMeasure?.kind === 'table' ? (childMeasure as TableMeasure) : undefined,
              context,
            );
            if (resolved.measure && nextBlockMeasures) {
              nextBlockMeasures = nextBlockMeasures.slice();
              nextBlockMeasures[childIndex] = resolved.measure;
            }
            cellChanged ||= resolved.changed;
            return resolved.block;
          }
          return childBlock;
        });
      }

      if (!cellChanged) return cell;
      rowChanged = true;
      if (nextCellMeasure && measureCells) {
        if (nextBlockMeasures && nextBlockMeasures !== nextCellMeasure.blocks) {
          nextCellMeasure = { ...nextCellMeasure, blocks: nextBlockMeasures };
        }
        measureCells[cellIndex] = nextCellMeasure;
        measureChanged = true;
      }
      return {
        ...cell,
        ...(nextParagraph ? { paragraph: nextParagraph } : {}),
        ...(nextBlocks ? { blocks: nextBlocks } : {}),
      };
    });

    if (!rowChanged) return row;
    changed = true;
    if (measureRow && measureCells && measureCells !== measureRow.cells) {
      measureRows![rowIndex] = { ...measureRow, cells: measureCells };
    }
    return { ...row, cells };
  });

  return changed
    ? {
        block: { ...block, rows },
        measure: measure && measureChanged && measureRows ? { ...measure, rows: measureRows } : measure,
        changed: true,
      }
    : { block, changed: false };
}

function resolveListItemPageRefs(
  block: ListBlock,
  itemId: string,
  measure?: ListMeasure,
  context?: PageRefResolutionContext,
): { block: ListBlock; measure?: ListMeasure; changed: boolean } {
  if (!context?.anchorMap?.size) return { block, changed: false };

  let changed = false;
  let measureChanged = false;
  const measureItems = measure?.items.slice();
  const items = block.items.map((item) => {
    if (item.id !== itemId) return item;
    const itemMeasureIndex = measureItems?.findIndex((candidate) => candidate.itemId === itemId) ?? -1;
    const itemMeasure = itemMeasureIndex >= 0 ? measureItems?.[itemMeasureIndex] : undefined;
    const resolved = resolveParagraphPageRefBlock(item.paragraph, itemMeasure?.paragraph, context);
    if (!resolved.changed) return item;
    if (resolved.measure && itemMeasure && measureItems) {
      measureItems[itemMeasureIndex] = { ...itemMeasure, paragraph: resolved.measure };
      measureChanged = true;
    }
    changed = true;
    return { ...item, paragraph: resolved.block };
  });

  return changed
    ? {
        block: { ...block, items },
        measure: measure && measureChanged && measureItems ? { ...measure, items: measureItems } : measure,
        changed: true,
      }
    : { block, changed: false };
}

function isTextRun(run: Run): run is TextRun {
  return (run.kind === 'text' || run.kind === undefined) && 'text' in run;
}

function isPageReferenceTextRun(
  run: Run,
): run is TextRun & { pageRefMetadata: NonNullable<TextRun['pageRefMetadata']> } {
  return isTextRun(run) && run.token === 'pageReference' && run.pageRefMetadata != null;
}

function adjustLineForResolvedPageRefs(line: Line, runTexts: Map<number, ResolvedPageRefRunText>): Line {
  let changed = false;
  const nextLine: Line = { ...line };

  for (const [runIndex, resolved] of runTexts) {
    if (runIndex < line.fromRun || runIndex > line.toRun) continue;
    changed = true;
    if (line.fromRun === runIndex) nextLine.fromChar = clampResolvedRunBoundary(line.fromChar, resolved);
    if (line.toRun === runIndex) nextLine.toChar = clampResolvedRunBoundary(line.toChar, resolved);
  }

  if (line.segments?.length) {
    const segments = line.segments.map((segment) => {
      const resolved = runTexts.get(segment.runIndex);
      if (resolved == null) return segment;
      changed = true;
      return {
        ...segment,
        fromChar: clampResolvedRunBoundary(segment.fromChar, resolved),
        toChar: clampResolvedRunBoundary(segment.toChar, resolved),
      } satisfies LineSegment;
    });
    nextLine.segments = segments;
  }

  return changed ? nextLine : line;
}

function clampResolvedRunBoundary(offset: number, resolved: ResolvedPageRefRunText): number {
  if (offset === resolved.originalLength) return resolved.text.length;
  return Math.min(offset, resolved.text.length);
}

function sumLineHeights(lines: Line[], from: number, to: number): number {
  let total = 0;
  for (let i = from; i < to && i < lines.length; i++) {
    total += lines[i].lineHeight;
  }
  return total;
}

function computeFragmentHeight(fragment: Fragment, blockMap: Map<string, BlockMapEntry>): number {
  if (fragment.kind === 'image' || fragment.kind === 'drawing' || fragment.kind === 'table') {
    return fragment.height;
  }

  const entry = blockMap.get(fragment.blockId);
  if (!entry) return 0;

  if (fragment.kind === 'para') {
    if (fragment.lines) {
      return fragment.lines.reduce((sum, line) => sum + line.lineHeight, 0);
    }
    if (entry.measure.kind === 'paragraph') {
      return sumLineHeights(entry.measure.lines, fragment.fromLine, fragment.toLine);
    }
    return 0;
  }

  if (fragment.kind === 'list-item') {
    const listMeasure = entry.measure as ListMeasure;
    if (listMeasure.kind !== 'list') return 0;
    const item = listMeasure.items.find((it) => it.itemId === fragment.itemId);
    if (!item) return 0;
    return sumLineHeights(item.paragraph.lines, fragment.fromLine, fragment.toLine);
  }

  return 0;
}

function isAnchoredMediaFragment(fragment: Fragment): fragment is ImageFragment | DrawingFragment {
  return (fragment.kind === 'image' || fragment.kind === 'drawing') && fragment.isAnchored === true;
}

/**
 * Resolved layout only serializes wrapper stacking for anchored media.
 * Inline media intentionally keep their legacy DOM-order paint behavior.
 */
function resolveFragmentZIndex(fragment: Fragment): number | undefined {
  if (!isAnchoredMediaFragment(fragment)) {
    return undefined;
  }

  return fragment.zIndex;
}

/** Mirrors fragmentKey() from painter-dom renderer.ts for stable identity. */
function resolveFragmentId(fragment: Fragment): string {
  switch (fragment.kind) {
    case 'para':
      return `para:${fragment.blockId}:${fragment.fromLine}:${fragment.toLine}`;
    case 'list-item':
      return `list-item:${fragment.blockId}:${fragment.itemId}:${fragment.fromLine}:${fragment.toLine}`;
    case 'image':
      return `image:${fragment.blockId}:${fragment.x}:${fragment.y}`;
    case 'drawing':
      return `drawing:${fragment.blockId}:${fragment.x}:${fragment.y}`;
    case 'table': {
      const partialKey = fragment.partialRow
        ? `:${fragment.partialRow.fromLineByCell.join(',')}-${fragment.partialRow.toLineByCell.join(',')}`
        : '';
      return `table:${fragment.blockId}:${fragment.fromRow}:${fragment.toRow}${partialKey}`;
    }
  }
}

function resolveParagraphContentIfApplicable(
  fragment: Fragment,
  blockMap: Map<string, BlockMapEntry>,
  pageRefContext?: PageRefResolutionContext,
): ResolvedParagraphContent | undefined {
  if (fragment.kind !== 'para') return undefined;

  const entry = blockMap.get(fragment.blockId);
  if (!entry || entry.block.kind !== 'paragraph' || entry.measure.kind !== 'paragraph') return undefined;

  const paragraphBlock = entry.block as ParagraphBlock;
  const paragraphMeasure = entry.measure as ParagraphMeasure;
  const resolvedPageRefs = resolveParagraphPageRefs(
    fragment as ParaFragment,
    paragraphBlock,
    paragraphMeasure,
    pageRefContext,
  );

  return resolveParagraphContent(resolvedPageRefs.fragment, resolvedPageRefs.block, paragraphMeasure);
}

function resolveFragmentParagraphBorders(
  fragment: Fragment,
  blockMap: Map<string, BlockMapEntry>,
): ParagraphBorders | undefined {
  const entry = blockMap.get(fragment.blockId);
  if (!entry) return undefined;

  if (fragment.kind === 'para' && entry.block.kind === 'paragraph') {
    return (entry.block as ParagraphBlock).attrs?.borders;
  }

  if (fragment.kind === 'list-item' && entry.block.kind === 'list') {
    const block = entry.block as ListBlock;
    const item = block.items.find((listItem) => listItem.id === fragment.itemId);
    return item?.paragraph.attrs?.borders;
  }

  return undefined;
}

function resolveFragmentSdtContainerKey(fragment: Fragment, blockMap: Map<string, BlockMapEntry>): string | null {
  const entry = blockMap.get(fragment.blockId);
  if (!entry) return null;
  const block = entry.block;

  if (fragment.kind === 'para' && block.kind === 'paragraph') {
    return getSdtContainerKey(block.attrs?.sdt, block.attrs?.containerSdt);
  }

  if (fragment.kind === 'list-item' && block.kind === 'list') {
    const listBlock = block as ListBlock;
    const item = listBlock.items.find((listItem) => listItem.id === fragment.itemId);
    return getSdtContainerKey(item?.paragraph.attrs?.sdt, item?.paragraph.attrs?.containerSdt);
  }

  if (fragment.kind === 'table' && block.kind === 'table') {
    return getSdtContainerKey(block.attrs?.sdt, block.attrs?.containerSdt);
  }

  // image, drawing — no SDT container keys
  return null;
}

function computeBlockVersion(
  blockId: string,
  blockMap: Map<string, BlockMapEntry>,
  cache: Map<string, string>,
  fontSignature = '',
): string {
  const cached = cache.get(blockId);
  if (cached !== undefined) return cached;
  const entry = blockMap.get(blockId);
  if (!entry) {
    cache.set(blockId, 'missing');
    return 'missing';
  }
  // Prepend the document's font-mapping signature so a `fonts.map` change busts paint reuse the
  // same way a font load (getFontConfigVersion, folded inside deriveBlockVersion) does. The cache
  // is per resolveLayout pass, so the signature is constant here; '' leaves the version unchanged.
  const versioned = deriveFontAwareBlockVersion(entry.block, fontSignature);
  cache.set(blockId, versioned);
  return versioned;
}

function deriveFontAwareBlockVersion(block: FlowBlock, fontSignature = ''): string {
  const version = deriveBlockVersion(block);
  return fontSignature ? `${fontSignature}|${version}` : version;
}

function applyPaintVersions(item: Extract<ResolvedPaintItem, { kind: 'fragment' }>, visualVersion: string): void {
  const evidenceVersion = sourceAnchorSignature(item.sourceAnchor);
  item.version = visualVersion;
  if (evidenceVersion) {
    item.evidenceVersion = evidenceVersion;
    item.paintCacheVersion = `${visualVersion}|source:${evidenceVersion}`;
  } else {
    item.paintCacheVersion = visualVersion;
  }
}

export function resolveFragmentItem(
  fragment: Fragment,
  fragmentIndex: number,
  pageIndex: number,
  blockMap: Map<string, BlockMapEntry>,
  blockVersionCache: Map<string, string>,
  story?: LayoutStoryLocator,
  fontSignature = '',
  pageRefContext?: PageRefResolutionContext,
): ResolvedPaintItem {
  const sdtContainerKey = resolveFragmentSdtContainerKey(fragment, blockMap);
  const blockVer = computeBlockVersion(fragment.blockId, blockMap, blockVersionCache, fontSignature);
  const version = fragmentSignature(fragment, blockVer);
  const layoutSourceIdentity = resolveFragmentLayoutIdentity(fragment, story);

  // Route to kind-specific resolvers for types that carry extracted block/measure data.
  switch (fragment.kind) {
    case 'table': {
      const item = resolveTableItem(fragment as TableFragment, fragmentIndex, pageIndex, blockMap);
      const tablePageRefs = resolveTablePageRefs(item.block, item.measure, pageRefContext);
      if (tablePageRefs.changed) {
        item.block = tablePageRefs.block;
        if (tablePageRefs.measure) item.measure = tablePageRefs.measure;
      }
      if (sdtContainerKey != null) item.sdtContainerKey = sdtContainerKey;
      if (fragment.sourceAnchor != null) item.sourceAnchor = fragment.sourceAnchor;
      item.layoutSourceIdentity = layoutSourceIdentity;
      applyPaintVersions(
        item,
        tablePageRefs.changed
          ? fragmentSignature(fragment, deriveFontAwareBlockVersion(tablePageRefs.block, fontSignature))
          : version,
      );
      return item;
    }
    case 'image': {
      const item = resolveImageItem(fragment as ImageFragment, fragmentIndex, pageIndex, blockMap);
      if (sdtContainerKey != null) item.sdtContainerKey = sdtContainerKey;
      if (fragment.sourceAnchor != null) item.sourceAnchor = fragment.sourceAnchor;
      item.layoutSourceIdentity = layoutSourceIdentity;
      applyPaintVersions(item, version);
      return item;
    }
    case 'drawing': {
      const item = resolveDrawingItem(fragment as DrawingFragment, fragmentIndex, pageIndex, blockMap);
      if (sdtContainerKey != null) item.sdtContainerKey = sdtContainerKey;
      if (fragment.sourceAnchor != null) item.sourceAnchor = fragment.sourceAnchor;
      item.layoutSourceIdentity = layoutSourceIdentity;
      applyPaintVersions(item, version);
      return item;
    }
    default: {
      const entry = blockMap.get(fragment.blockId);
      const paragraphPageRefs =
        fragment.kind === 'para' && entry?.block.kind === 'paragraph' && entry.measure.kind === 'paragraph'
          ? resolveParagraphPageRefs(
              fragment as ParaFragment,
              entry.block as ParagraphBlock,
              entry.measure as ParagraphMeasure,
              pageRefContext,
            )
          : null;
      const listPageRefs =
        fragment.kind === 'list-item' && entry?.block.kind === 'list'
          ? resolveListItemPageRefs(
              entry.block as ListBlock,
              (fragment as ListItemFragment).itemId,
              entry.measure.kind === 'list' ? (entry.measure as ListMeasure) : undefined,
              pageRefContext,
            )
          : null;
      const itemVersion = paragraphPageRefs?.changed
        ? fragmentSignature(
            paragraphPageRefs.fragment,
            deriveFontAwareBlockVersion(paragraphPageRefs.block, fontSignature),
          )
        : listPageRefs?.changed
          ? fragmentSignature(fragment, deriveFontAwareBlockVersion(listPageRefs.block, fontSignature))
          : version;
      // para, list-item — existing generic resolution
      const item: ResolvedFragmentItem = {
        kind: 'fragment',
        id: resolveFragmentId(fragment),
        pageIndex,
        x: fragment.x,
        y: fragment.y,
        width: fragment.width,
        height: computeFragmentHeight(fragment, blockMap),
        zIndex: resolveFragmentZIndex(fragment),
        fragmentKind: fragment.kind,
        fragment,
        blockId: fragment.blockId,
        fragmentIndex,
        content: paragraphPageRefs
          ? resolveParagraphContent(
              paragraphPageRefs.fragment,
              paragraphPageRefs.block,
              (entry as BlockMapEntry).measure as ParagraphMeasure,
            )
          : resolveParagraphContentIfApplicable(fragment, blockMap, pageRefContext),
        layoutSourceIdentity,
      };
      if (sdtContainerKey != null) item.sdtContainerKey = sdtContainerKey;
      if (fragment.sourceAnchor != null) item.sourceAnchor = fragment.sourceAnchor;

      // Pre-extract block/measure for para and list-item fragments so the painter
      // can prefer resolved data over a blockLookup read.
      if (entry) {
        if (fragment.kind === 'para' && entry.block.kind === 'paragraph' && entry.measure.kind === 'paragraph') {
          item.block = paragraphPageRefs?.block ?? (entry.block as ParagraphBlock);
          item.measure = entry.measure as ParagraphMeasure;
          if (item.sourceAnchor == null) item.sourceAnchor = (entry.block as ParagraphBlock).sourceAnchor;
        } else if (fragment.kind === 'list-item' && entry.block.kind === 'list' && entry.measure.kind === 'list') {
          const listBlock = listPageRefs?.block ?? (entry.block as ListBlock);
          const listItem = listBlock.items.find((candidate) => candidate.id === (fragment as ListItemFragment).itemId);
          item.block = listBlock;
          item.measure = listPageRefs?.measure ?? (entry.measure as ListMeasure);
          if (item.sourceAnchor == null) {
            item.sourceAnchor = listItem?.sourceAnchor ?? listItem?.paragraph.sourceAnchor ?? listBlock.sourceAnchor;
          }
        }
      }

      // Pre-compute paragraph border data for between-border grouping
      const borders = resolveFragmentParagraphBorders(fragment, blockMap);
      if (borders) {
        item.paragraphBorders = borders;
        item.paragraphBorderHash = hashParagraphBorders(borders);
      }

      if (fragment.kind === 'para') {
        const para = fragment as ParaFragment;
        if (para.pmStart != null) item.pmStart = para.pmStart;
        if (para.pmEnd != null) item.pmEnd = para.pmEnd;
        if (para.continuesFromPrev != null) item.continuesFromPrev = para.continuesFromPrev;
        if (para.continuesOnNext != null) item.continuesOnNext = para.continuesOnNext;
        if (para.markerWidth != null) item.markerWidth = para.markerWidth;
      } else if (fragment.kind === 'list-item') {
        const listItem = fragment as ListItemFragment;
        if (listItem.continuesFromPrev != null) item.continuesFromPrev = listItem.continuesFromPrev;
        if (listItem.continuesOnNext != null) item.continuesOnNext = listItem.continuesOnNext;
        if (listItem.markerWidth != null) item.markerWidth = listItem.markerWidth;
      }
      applyPaintVersions(item, itemVersion);
      return item;
    }
  }
}

export function resolveLayout(input: ResolveLayoutInput): ResolvedLayout {
  const { layout, flowMode, blocks, measures, bookmarks } = input;
  const fontSignature = input.fontSignature ?? '';
  const blockMap = buildBlockMap(blocks, measures);
  const blockVersionCache = new Map<string, string>();
  const pageRefAnchorMap = bookmarks?.size ? buildPageRefAnchorMap(bookmarks, layout, blocks, measures) : undefined;

  const pages: ResolvedPage[] = layout.pages.map((page, pageIndex) => ({
    id: `page-${pageIndex}`,
    index: pageIndex,
    columns: page.columns,
    columnRegions: page.columnRegions,
    number: page.number,
    width: page.size?.w ?? layout.pageSize.w,
    height: page.size?.h ?? layout.pageSize.h,
    items: page.fragments.map((fragment, fragmentIndex) =>
      resolveFragmentItem(
        fragment,
        fragmentIndex,
        pageIndex,
        blockMap,
        blockVersionCache,
        undefined,
        fontSignature,
        pageRefAnchorMap ? { sourcePage: page.number, anchorMap: pageRefAnchorMap } : undefined,
      ),
    ),
    margins: page.margins,
    footnoteReserved: page.footnoteReserved,
    displayNumber: page.displayNumber,
    numberText: page.numberText,
    effectivePageNumber: page.effectivePageNumber,
    pageNumberFormat: page.pageNumberFormat,
    pageNumberChapterText: page.pageNumberChapterText,
    pageNumberChapterSeparator: page.pageNumberChapterSeparator,
    vAlign: page.vAlign,
    baseMargins: page.baseMargins,
    sectionIndex: page.sectionIndex,
    sectionRefs: page.sectionRefs,
    orientation: page.orientation,
  }));

  const resolved: ResolvedLayout = {
    version: 1,
    flowMode,
    pageGap: layout.pageGap ?? 0,
    pages,
    ...(layout.documentBackground ? { documentBackground: layout.documentBackground } : {}),
  };

  if (blocks.length > 0) {
    resolved.blockVersions = Object.fromEntries(
      blocks.map((block) => [block.id, computeBlockVersion(block.id, blockMap, blockVersionCache, fontSignature)]),
    );
  }
  if (layout.layoutEpoch != null) {
    resolved.layoutEpoch = layout.layoutEpoch;
  }

  return resolved;
}
