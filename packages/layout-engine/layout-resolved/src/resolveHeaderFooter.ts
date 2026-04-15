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
  const blockMap = buildBlockMap(blocks, measures);
  const blockVersionCache = new Map<string, string>();

  const pages: ResolvedHeaderFooterPage[] = layout.pages.map((page, pageIndex) => ({
    number: page.number,
    numberText: page.numberText,
    items: page.fragments.map((fragment, fragmentIndex) =>
      resolveFragmentItem(fragment, fragmentIndex, pageIndex, blockMap, blockVersionCache),
    ),
  }));

  return {
    height: layout.height,
    minY: layout.minY,
    maxY: layout.maxY,
    renderHeight: layout.renderHeight,
    pages,
  };
}
