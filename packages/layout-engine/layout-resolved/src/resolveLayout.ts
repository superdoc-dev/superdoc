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
  LayoutStoryLocator,
} from '@superdoc/contracts';
import { resolveParagraphContent } from './resolveParagraph.js';
import { resolveTableItem } from './resolveTable.js';
import { resolveImageItem } from './resolveImage.js';
import { resolveDrawingItem } from './resolveDrawing.js';
import type { BlockMapEntry } from './resolvedBlockLookup.js';
import { computeSdtContainerKey } from './sdtContainerKey.js';
import { hashParagraphBorders } from './paragraphBorderHash.js';
import {
  deriveBlockVersion,
  fragmentSignature,
  resolveFragmentLayoutIdentity,
  sourceAnchorSignature,
} from './versionSignature.js';

export type ResolveLayoutInput = {
  layout: Layout;
  flowMode: FlowMode;
  blocks: FlowBlock[];
  measures: Measure[];
};

export function buildBlockMap(blocks: FlowBlock[], measures: Measure[]): Map<string, BlockMapEntry> {
  const map = new Map<string, BlockMapEntry>();
  for (let i = 0; i < blocks.length; i++) {
    map.set(blocks[i].id, { block: blocks[i], measure: measures[i] });
  }
  return map;
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
): ResolvedParagraphContent | undefined {
  if (fragment.kind !== 'para') return undefined;

  const entry = blockMap.get(fragment.blockId);
  if (!entry || entry.block.kind !== 'paragraph' || entry.measure.kind !== 'paragraph') return undefined;

  return resolveParagraphContent(fragment, entry.block as ParagraphBlock, entry.measure as ParagraphMeasure);
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
    return computeSdtContainerKey(block.attrs?.sdt, block.attrs?.containerSdt);
  }

  if (fragment.kind === 'list-item' && block.kind === 'list') {
    const listBlock = block as ListBlock;
    const item = listBlock.items.find((listItem) => listItem.id === fragment.itemId);
    return computeSdtContainerKey(item?.paragraph.attrs?.sdt, item?.paragraph.attrs?.containerSdt);
  }

  if (fragment.kind === 'table' && block.kind === 'table') {
    return computeSdtContainerKey(block.attrs?.sdt, block.attrs?.containerSdt);
  }

  // image, drawing — no SDT container keys
  return null;
}

function computeBlockVersion(
  blockId: string,
  blockMap: Map<string, BlockMapEntry>,
  cache: Map<string, string>,
): string {
  const cached = cache.get(blockId);
  if (cached !== undefined) return cached;
  const entry = blockMap.get(blockId);
  if (!entry) {
    cache.set(blockId, 'missing');
    return 'missing';
  }
  const version = deriveBlockVersion(entry.block);
  cache.set(blockId, version);
  return version;
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
): ResolvedPaintItem {
  const sdtContainerKey = resolveFragmentSdtContainerKey(fragment, blockMap);
  const blockVer = computeBlockVersion(fragment.blockId, blockMap, blockVersionCache);
  const version = fragmentSignature(fragment, blockVer);
  const layoutSourceIdentity = resolveFragmentLayoutIdentity(fragment, story);

  // Route to kind-specific resolvers for types that carry extracted block/measure data.
  switch (fragment.kind) {
    case 'table': {
      const item = resolveTableItem(fragment as TableFragment, fragmentIndex, pageIndex, blockMap);
      if (sdtContainerKey != null) item.sdtContainerKey = sdtContainerKey;
      if (fragment.sourceAnchor != null) item.sourceAnchor = fragment.sourceAnchor;
      item.layoutSourceIdentity = layoutSourceIdentity;
      applyPaintVersions(item, version);
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
        content: resolveParagraphContentIfApplicable(fragment, blockMap),
        layoutSourceIdentity,
      };
      if (sdtContainerKey != null) item.sdtContainerKey = sdtContainerKey;
      if (fragment.sourceAnchor != null) item.sourceAnchor = fragment.sourceAnchor;

      // Pre-extract block/measure for para and list-item fragments so the painter
      // can prefer resolved data over a blockLookup read.
      const entry = blockMap.get(fragment.blockId);
      if (entry) {
        if (fragment.kind === 'para' && entry.block.kind === 'paragraph' && entry.measure.kind === 'paragraph') {
          item.block = entry.block as ParagraphBlock;
          item.measure = entry.measure as ParagraphMeasure;
          if (item.sourceAnchor == null) item.sourceAnchor = (entry.block as ParagraphBlock).sourceAnchor;
        } else if (fragment.kind === 'list-item' && entry.block.kind === 'list' && entry.measure.kind === 'list') {
          const listBlock = entry.block as ListBlock;
          const listItem = listBlock.items.find((candidate) => candidate.id === (fragment as ListItemFragment).itemId);
          item.block = listBlock;
          item.measure = entry.measure as ListMeasure;
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
      applyPaintVersions(item, version);
      return item;
    }
  }
}

export function resolveLayout(input: ResolveLayoutInput): ResolvedLayout {
  const { layout, flowMode, blocks, measures } = input;
  const blockMap = buildBlockMap(blocks, measures);
  const blockVersionCache = new Map<string, string>();

  const pages: ResolvedPage[] = layout.pages.map((page, pageIndex) => ({
    id: `page-${pageIndex}`,
    index: pageIndex,
    columns: page.columns,
    columnRegions: page.columnRegions,
    number: page.number,
    width: page.size?.w ?? layout.pageSize.w,
    height: page.size?.h ?? layout.pageSize.h,
    items: page.fragments.map((fragment, fragmentIndex) =>
      resolveFragmentItem(fragment, fragmentIndex, pageIndex, blockMap, blockVersionCache),
    ),
    margins: page.margins,
    footnoteReserved: page.footnoteReserved,
    numberText: page.numberText,
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
  };

  if (blocks.length > 0) {
    resolved.blockVersions = Object.fromEntries(
      blocks.map((block) => [block.id, computeBlockVersion(block.id, blockMap, blockVersionCache)]),
    );
  }
  if (layout.layoutEpoch != null) {
    resolved.layoutEpoch = layout.layoutEpoch;
  }

  return resolved;
}
