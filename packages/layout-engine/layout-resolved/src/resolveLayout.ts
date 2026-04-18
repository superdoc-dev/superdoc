import type {
  Layout,
  FlowMode,
  FlowBlock,
  Measure,
  Fragment,
  DrawingFragment,
  ImageFragment,
  TableFragment,
  Line,
  ResolvedLayout,
  ResolvedPage,
  ResolvedPaintItem,
  ResolvedParagraphContent,
  ListMeasure,
  ParagraphBlock,
  ParagraphMeasure,
} from '@superdoc/contracts';
import { resolveParagraphContent } from './resolveParagraph.js';
import { resolveTableItem } from './resolveTable.js';
import { resolveImageItem } from './resolveImage.js';
import { resolveDrawingItem } from './resolveDrawing.js';
import type { BlockMapEntry } from './resolvedBlockLookup.js';

export type ResolveLayoutInput = {
  layout: Layout;
  flowMode: FlowMode;
  blocks: FlowBlock[];
  measures: Measure[];
};

function buildBlockMap(blocks: FlowBlock[], measures: Measure[]): Map<string, BlockMapEntry> {
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

function resolveFragmentItem(
  fragment: Fragment,
  fragmentIndex: number,
  pageIndex: number,
  blockMap: Map<string, BlockMapEntry>,
): ResolvedPaintItem {
  // Route to kind-specific resolvers for types that carry extracted block/measure data.
  switch (fragment.kind) {
    case 'table':
      return resolveTableItem(fragment as TableFragment, fragmentIndex, pageIndex, blockMap);
    case 'image':
      return resolveImageItem(fragment as ImageFragment, fragmentIndex, pageIndex, blockMap);
    case 'drawing':
      return resolveDrawingItem(fragment as DrawingFragment, fragmentIndex, pageIndex, blockMap);
    default:
      // para, list-item — existing generic resolution
      return {
        kind: 'fragment',
        id: resolveFragmentId(fragment),
        pageIndex,
        x: fragment.x,
        y: fragment.y,
        width: fragment.width,
        height: computeFragmentHeight(fragment, blockMap),
        zIndex: resolveFragmentZIndex(fragment),
        fragmentKind: fragment.kind,
        blockId: fragment.blockId,
        fragmentIndex,
        content: resolveParagraphContentIfApplicable(fragment, blockMap),
      };
  }
}

export function resolveLayout(input: ResolveLayoutInput): ResolvedLayout {
  const { layout, flowMode, blocks, measures } = input;
  const blockMap = buildBlockMap(blocks, measures);

  const pages: ResolvedPage[] = layout.pages.map((page, pageIndex) => ({
    id: `page-${pageIndex}`,
    index: pageIndex,
    number: page.number,
    width: page.size?.w ?? layout.pageSize.w,
    height: page.size?.h ?? layout.pageSize.h,
    items: page.fragments.map((fragment, fragmentIndex) =>
      resolveFragmentItem(fragment, fragmentIndex, pageIndex, blockMap),
    ),
  }));

  return {
    version: 1,
    flowMode,
    pageGap: layout.pageGap ?? 0,
    pages,
  };
}
