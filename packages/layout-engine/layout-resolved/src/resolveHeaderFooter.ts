import type {
  FlowBlock,
  HeaderFooterLayout,
  Measure,
  ResolvedHeaderFooterLayout,
  ResolvedHeaderFooterPage,
  LayoutStoryLocator,
} from '@superdoc/contracts';
import { buildBlockMap, resolveFragmentItem } from './resolveLayout.js';

/**
 * Resolves a header/footer layout into a `ResolvedHeaderFooterLayout`.
 *
 * Standalone helper invoked per `HeaderFooterLayoutResult` from `incrementalLayout`.
 * The caller stores results indexed by the same key (type or rId) as the originals;
 * alignment between fragments and resolved items is guaranteed by construction.
 */
export function resolveHeaderFooterLayout(
  layout: HeaderFooterLayout,
  blocks: FlowBlock[],
  measures: Measure[],
  story?: LayoutStoryLocator,
  // Folded into each header/footer block's paint-reuse version (see resolveLayout). '' for default.
  fontSignature = '',
): ResolvedHeaderFooterLayout {
  const pages: ResolvedHeaderFooterPage[] = layout.pages.map((page) => {
    const pageBlocks = page.blocks ?? blocks;
    const pageMeasures = page.measures ?? measures;
    const blockMap = buildBlockMap(pageBlocks, pageMeasures);
    const blockVersionCache = new Map<string, string>();

    return {
      number: page.number,
      displayNumber: page.displayNumber,
      numberText: page.numberText,
      pageNumberFormat: page.pageNumberFormat,
      pageNumberChapterText: page.pageNumberChapterText,
      pageNumberChapterSeparator: page.pageNumberChapterSeparator,
      items: page.fragments.map((fragment, fragmentIndex) =>
        resolveFragmentItem(
          fragment,
          fragmentIndex,
          page.number - 1,
          blockMap,
          blockVersionCache,
          story,
          fontSignature,
        ),
      ),
    };
  });

  return {
    height: layout.height,
    minY: layout.minY,
    maxY: layout.maxY,
    renderHeight: layout.renderHeight,
    pages,
  };
}
