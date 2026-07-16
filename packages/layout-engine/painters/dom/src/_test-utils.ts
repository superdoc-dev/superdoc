/**
 * Test-only helpers.
 *
 * These mirror the legacy {@link createDomPainter} surface (blocks/measures
 * options, `paint(layout)`, `setData`, `setResolvedLayout`) so existing tests
 * can keep their shape while the production API stays strict
 * (resolved-layout-only). Production code MUST NOT import from this file —
 * the architecture-boundary tests enforce that.
 */
import { createDomPainter } from './index.js';
import type { DomPainterOptions, DomPainterInput, PaintSnapshot } from './index.js';
import type { PageDecorationProvider } from './renderer.js';
import { resolveLayout } from '@superdoc/layout-resolved';
import type { FlowBlock, Fragment, Layout, Measure, ResolvedLayout, ResolvedPaintItem } from '@superdoc/contracts';

export const emptyResolved: ResolvedLayout = { version: 1, flowMode: 'paginated', pageGap: 0, pages: [] };

/**
 * Test-only bridge: accepts old-style `{ blocks, measures, ...options }` and
 * returns a painter whose `paint()` automatically builds a `DomPainterInput`.
 */
export function createTestPainter(opts: { blocks?: FlowBlock[]; measures?: Measure[] } & DomPainterOptions) {
  const { blocks: initBlocks, measures: initMeasures, headerProvider, footerProvider, ...painterOpts } = opts;
  let lastPaintSnapshot: PaintSnapshot | null = null;

  let currentBlocks: FlowBlock[] = initBlocks ?? [];
  let currentMeasures: Measure[] = initMeasures ?? [];
  let currentResolved: ResolvedLayout = emptyResolved;
  let headerBlocks: FlowBlock[] | undefined;
  let headerMeasures: Measure[] | undefined;
  let footerBlocks: FlowBlock[] | undefined;
  let footerMeasures: Measure[] | undefined;
  let resolvedLayoutOverridden = false;

  const resolveDecorationItems = (
    fragments: readonly Fragment[],
    kind: 'header' | 'footer',
  ): ResolvedPaintItem[] | undefined => {
    const decorationBlocks = kind === 'header' ? headerBlocks : footerBlocks;
    const decorationMeasures = kind === 'header' ? headerMeasures : footerMeasures;
    const mergedBlocks = [...(currentBlocks ?? []), ...(decorationBlocks ?? [])];
    const mergedMeasures = [...(currentMeasures ?? []), ...(decorationMeasures ?? [])];
    if (mergedBlocks.length !== mergedMeasures.length || mergedBlocks.length === 0) {
      return undefined;
    }
    const fakeLayout: Layout = { pageSize: { w: 400, h: 500 }, pages: [{ number: 1, fragments: [...fragments] }] };
    try {
      const resolved = resolveLayout({
        layout: fakeLayout,
        flowMode: opts.flowMode ?? 'paginated',
        blocks: mergedBlocks,
        measures: mergedMeasures,
      });
      return resolved.pages[0]?.items;
    } catch {
      return undefined;
    }
  };

  const wrapProvider = (
    provider: PageDecorationProvider | undefined,
    kind: 'header' | 'footer',
  ): PageDecorationProvider | undefined => {
    if (!provider) return undefined;
    return (pageNumber, pageMargins, page) => {
      const payload = provider(pageNumber, pageMargins, page);
      if (!payload) return payload;
      if (payload.items) return payload;
      const items = resolveDecorationItems(payload.fragments, kind);
      return items ? { ...payload, items } : { ...payload, items: [] };
    };
  };

  const userOnPaintSnapshot = painterOpts.onPaintSnapshot;
  const painter = createDomPainter({
    ...painterOpts,
    headerProvider: wrapProvider(headerProvider, 'header'),
    footerProvider: wrapProvider(footerProvider, 'footer'),
    onPaintSnapshot: (snapshot) => {
      lastPaintSnapshot = snapshot;
      userOnPaintSnapshot?.(snapshot);
    },
  });

  return {
    paint(layout: Layout, mount: HTMLElement, mapping?: unknown) {
      // Auto-synthesize minimal blocks/measures for any layout fragment whose
      // blockId isn't covered by currentBlocks. Tests that only care about
      // wrapper-level rendering (column separators, page chrome) can skip the
      // boilerplate of building matching blocks for every fragment they place.
      const knownIds = new Set(currentBlocks.map((b) => b.id));
      const syntheticBlocks: FlowBlock[] = [];
      const syntheticMeasures: Measure[] = [];
      for (const page of layout.pages) {
        for (const fragment of page.fragments ?? []) {
          if (fragment.kind !== 'para' || knownIds.has(fragment.blockId)) continue;
          syntheticBlocks.push({ kind: 'paragraph', id: fragment.blockId, runs: [] });
          syntheticMeasures.push({ kind: 'paragraph', lines: [], totalHeight: 0 });
          knownIds.add(fragment.blockId);
        }
      }
      const effectiveBlocks = syntheticBlocks.length ? [...currentBlocks, ...syntheticBlocks] : currentBlocks;
      const effectiveMeasures = syntheticMeasures.length ? [...currentMeasures, ...syntheticMeasures] : currentMeasures;

      const effectiveResolved = resolvedLayoutOverridden
        ? currentResolved
        : resolveLayout({
            layout,
            flowMode: opts.flowMode ?? 'paginated',
            blocks: effectiveBlocks,
            measures: effectiveMeasures,
          });
      const input: DomPainterInput = {
        resolvedLayout: effectiveResolved,
      };
      painter.paint(input, mount, mapping as never);
    },
    setData(
      blocks: FlowBlock[],
      measures: Measure[],
      hb?: FlowBlock[],
      hm?: Measure[],
      fb?: FlowBlock[],
      fm?: Measure[],
    ) {
      currentBlocks = blocks;
      currentMeasures = measures;
      headerBlocks = hb;
      headerMeasures = hm;
      footerBlocks = fb;
      footerMeasures = fm;
    },
    setResolvedLayout(rl: ResolvedLayout | null) {
      currentResolved = rl ?? emptyResolved;
      resolvedLayoutOverridden = true;
    },
    setProviders(header?: PageDecorationProvider, footer?: PageDecorationProvider) {
      painter.setProviders(wrapProvider(header, 'header'), wrapProvider(footer, 'footer'));
    },
    setVirtualizationPins(pageIndices: number[] | null | undefined) {
      painter.setVirtualizationPins(pageIndices);
    },
    getMountedPageIndices() {
      return painter.getMountedPageIndices();
    },
    getPaintSnapshot() {
      return lastPaintSnapshot;
    },
    onScroll() {
      painter.onScroll();
    },
    setZoom(zoom: number) {
      painter.setZoom(zoom);
    },
    setScrollContainer(el: HTMLElement | null) {
      painter.setScrollContainer(el);
    },
    setShowFormattingMarks(showFormattingMarks: boolean) {
      painter.setShowFormattingMarks(showFormattingMarks);
    },
    dispose() {
      painter.dispose();
    },
  };
}
