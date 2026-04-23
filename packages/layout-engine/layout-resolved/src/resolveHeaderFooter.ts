import type {
  FlowBlock,
  HeaderFooterLayout,
  Measure,
  ResolvedHeaderFooterLayout,
  ResolvedHeaderFooterPage,
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
): ResolvedHeaderFooterLayout {
  const pages: ResolvedHeaderFooterPage[] = layout.pages.map((page) => {
    const pageBlocks = page.blocks ?? blocks;
    const pageMeasures = page.measures ?? measures;
    const blockMap = buildBlockMap(pageBlocks, pageMeasures);
    const blockVersionCache = new Map<string, string>();

    return {
      number: page.number,
      numberText: page.numberText,
      items: page.fragments.map((fragment, fragmentIndex) =>
        resolveFragmentItem(fragment, fragmentIndex, page.number - 1, blockMap, blockVersionCache),
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
