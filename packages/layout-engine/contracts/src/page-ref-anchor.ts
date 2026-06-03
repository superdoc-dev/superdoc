import type {
  FlowBlock,
  Fragment,
  Layout,
  ListBlock,
  Page,
  PageRefLocation,
  ParagraphBlock,
  Run,
  TableBlock,
} from './index.js';

export function buildPageRefAnchorMap(
  bookmarks: Map<string, number>,
  layout: Layout,
  blocks: FlowBlock[] = [],
): Map<string, PageRefLocation> {
  const anchors = new Map<string, PageRefLocation>();
  if (bookmarks.size === 0) return anchors;

  const blockById = new Map<string, FlowBlock>();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }

  for (const [bookmarkName, pmPosition] of bookmarks) {
    const location = findPageRefLocation(pmPosition, layout, blockById);
    if (location) {
      anchors.set(bookmarkName, { ...location, pmPosition });
    }
  }

  return anchors;
}

function findPageRefLocation(
  pmPosition: number,
  layout: Layout,
  blockById: Map<string, FlowBlock>,
): PageRefLocation | null {
  let nextLocation: PageRefLocation | null = null;
  let nextDistance = Number.POSITIVE_INFINITY;

  for (const page of layout.pages) {
    for (const fragment of page.fragments) {
      if (fragmentContainsPosition(fragment, pmPosition)) {
        return pageRefLocationFromPage(page, pmPosition);
      }

      const block = blockById.get(fragment.blockId);
      if (fragment.kind === 'para' && block?.kind === 'paragraph' && blockContainsPosition(block, pmPosition)) {
        return pageRefLocationFromPage(page, pmPosition);
      }
      if (fragment.kind === 'table' && block?.kind === 'table' && tableContainsPosition(block, pmPosition)) {
        return pageRefLocationFromPage(page, pmPosition);
      }
      if (
        fragment.kind === 'list-item' &&
        block?.kind === 'list' &&
        listItemContainsPosition(block, fragment.itemId, pmPosition)
      ) {
        return pageRefLocationFromPage(page, pmPosition);
      }

      const fragmentStart = fragmentStartPosition(fragment, block);
      if (fragmentStart != null && fragmentStart > pmPosition) {
        const distance = fragmentStart - pmPosition;
        if (distance < nextDistance) {
          nextDistance = distance;
          nextLocation = pageRefLocationFromPage(page, pmPosition);
        }
      }
    }
  }

  return nextLocation;
}

function pageRefLocationFromPage(page: Page, pmPosition: number): PageRefLocation {
  const displayNumber = Math.max(1, page.displayNumber ?? page.effectivePageNumber ?? page.number);
  return {
    physicalPage: page.number,
    displayNumber,
    displayText: page.numberText ?? String(displayNumber),
    pageFormat: page.pageNumberFormat,
    chapterNumberText: page.pageNumberChapterText,
    chapterSeparator: page.pageNumberChapterSeparator,
    sectionIndex: page.sectionIndex,
    pmPosition,
  };
}

function fragmentContainsPosition(fragment: Fragment, pmPosition: number): boolean {
  const range = fragment as { pmStart?: number; pmEnd?: number };
  return range.pmStart != null && range.pmEnd != null && pmPosition >= range.pmStart && pmPosition < range.pmEnd;
}

function blockContainsPosition(block: ParagraphBlock, pmPosition: number): boolean {
  const range = runRange(block.runs);
  return range != null && pmPosition >= range.start && pmPosition < range.end;
}

function tableContainsPosition(block: TableBlock, pmPosition: number): boolean {
  for (const row of block.rows) {
    for (const cell of row.cells) {
      const blocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
      for (const childBlock of blocks) {
        if (childBlock.kind === 'paragraph' && blockContainsPosition(childBlock, pmPosition)) return true;
        if (childBlock.kind === 'table' && tableContainsPosition(childBlock, pmPosition)) return true;
      }
    }
  }
  return false;
}

function fragmentStartPosition(fragment: Fragment, block: FlowBlock | undefined): number | null {
  const range = fragment as { pmStart?: number };
  if (range.pmStart != null) return range.pmStart;
  if (block?.kind === 'paragraph') return runRange(block.runs)?.start ?? null;
  if (block?.kind === 'table') return tableRunRange(block)?.start ?? null;
  if (fragment.kind === 'list-item' && block?.kind === 'list') {
    return listItemRunRange(block, fragment.itemId)?.start ?? null;
  }
  return null;
}

function listItemContainsPosition(block: ListBlock, itemId: string, pmPosition: number): boolean {
  const range = listItemRunRange(block, itemId);
  return range != null && pmPosition >= range.start && pmPosition < range.end;
}

function listItemRunRange(block: ListBlock, itemId: string): { start: number; end: number } | null {
  const item = block.items.find((candidate) => candidate.id === itemId);
  return item ? runRange(item.paragraph.runs) : null;
}

function tableRunRange(block: TableBlock): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const row of block.rows) {
    for (const cell of row.cells) {
      const blocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
      for (const childBlock of blocks) {
        const range =
          childBlock.kind === 'paragraph'
            ? runRange(childBlock.runs)
            : childBlock.kind === 'table'
              ? tableRunRange(childBlock)
              : null;
        if (!range) continue;
        start = Math.min(start, range.start);
        end = Math.max(end, range.end);
      }
    }
  }
  return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
}

function runRange(runs: Run[]): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const range = run as { pmStart?: number; pmEnd?: number };
    if (range.pmStart != null) start = Math.min(start, range.pmStart);
    if (range.pmEnd != null) end = Math.max(end, range.pmEnd);
  }
  return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
}
