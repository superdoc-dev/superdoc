/**
 * Test-only bridge around `createDomPainter`.
 *
 * The production painter accepts a pre-computed `DomPainterInput`
 * (`{ resolvedLayout, sourceLayout }`). Most tests, however, still express
 * their fixtures as `{ blocks, measures }` plus a raw `Layout`. This helper
 * lets those tests keep that shape by running `resolveLayout` internally
 * on every `paint(layout, mount)` call.
 *
 * Use this in tests only. Production code must call `createDomPainter`
 * directly with a `DomPainterInput`.
 */

import { createDomPainter } from '../index.js';
import type { DomPainterHandle, DomPainterOptions } from '../index.js';
import { resolveLayout } from '@superdoc/layout-resolved';
import type { DomPainterInput, PositionMapping } from '../renderer.js';
import type { FlowBlock, Layout, Measure, ResolvedLayout } from '@superdoc/contracts';

const emptyResolved: ResolvedLayout = {
  version: 1,
  flowMode: 'paginated',
  pageGap: 0,
  pages: [],
};

export type TestPainterOptions = { blocks?: FlowBlock[]; measures?: Measure[] } & DomPainterOptions;

export type TestPainterHandle = Omit<DomPainterHandle, 'paint'> & {
  /** Accepts either a raw `Layout` (resolved internally) or a full `DomPainterInput`. */
  paint(input: DomPainterInput | Layout, mount: HTMLElement, mapping?: PositionMapping): void;
  /** Update the blocks/measures used for subsequent `paint(layout, mount)` calls. */
  setData(blocks: FlowBlock[], measures: Measure[]): void;
};

export function createTestPainter(opts: TestPainterOptions): TestPainterHandle {
  const { blocks: initBlocks, measures: initMeasures, ...painterOpts } = opts;
  const painter = createDomPainter(painterOpts);

  let currentBlocks: FlowBlock[] = initBlocks ?? [];
  let currentMeasures: Measure[] = initMeasures ?? [];

  return {
    paint(input: DomPainterInput | Layout, mount: HTMLElement, mapping?: PositionMapping) {
      const resolvedInput: DomPainterInput = isDomPainterInput(input)
        ? input
        : {
            resolvedLayout:
              currentBlocks.length === 0 && currentMeasures.length === 0
                ? emptyResolved
                : resolveLayout({
                    layout: input,
                    flowMode: opts.flowMode ?? 'paginated',
                    blocks: currentBlocks,
                    measures: currentMeasures,
                  }),
            sourceLayout: input,
          };
      painter.paint(resolvedInput, mount, mapping);
    },
    setData(blocks: FlowBlock[], measures: Measure[]) {
      currentBlocks = blocks;
      currentMeasures = measures;
    },
    setProviders: painter.setProviders,
    setVirtualizationPins: painter.setVirtualizationPins,
    getMountedPageIndices: painter.getMountedPageIndices,
    onScroll: painter.onScroll,
    setZoom: painter.setZoom,
    setScrollContainer: painter.setScrollContainer,
  };
}

function isDomPainterInput(value: DomPainterInput | Layout): value is DomPainterInput {
  return typeof value === 'object' && value !== null && 'resolvedLayout' in value && 'sourceLayout' in value;
}
