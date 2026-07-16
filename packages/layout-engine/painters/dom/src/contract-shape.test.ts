/**
 * Compile-time + runtime contract lockdown for the painter's public surface.
 *
 * These assertions fail when someone reintroduces a legacy field on
 * `DomPainterInput`, changes `DomPainterHandle`, or makes
 * `PageDecorationPayload.items` optional. The boundary tests in
 * `tests/src/architecture-boundaries.test.ts` cover the import side; this
 * file covers the type-shape side.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { ResolvedLayout, ResolvedPaintItem } from '@superdoc/contracts';
import type { DomPainterHandle, DomPainterInput, PageDecorationPayload } from './index.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertTrue<T extends true> = T;

describe('DomPainter public contract shape', () => {
  it('DomPainterInput is exactly { resolvedLayout: ResolvedLayout }', () => {
    type _Check = AssertTrue<Equal<DomPainterInput, { resolvedLayout: ResolvedLayout }>>;
    expectTypeOf<DomPainterInput>().toEqualTypeOf<{ resolvedLayout: ResolvedLayout }>();
  });

  it('DomPainterHandle exposes only the painter-owned methods', () => {
    type ExpectedKeys =
      | 'paint'
      | 'setProviders'
      | 'setVirtualizationPins'
      | 'getMountedPageIndices'
      | 'onScroll'
      | 'setZoom'
      | 'setScrollContainer'
      | 'setShowFormattingMarks'
      | 'dispose';
    type _Check = AssertTrue<Equal<keyof DomPainterHandle, ExpectedKeys>>;
    expectTypeOf<keyof DomPainterHandle>().toEqualTypeOf<ExpectedKeys>();
  });

  it('PageDecorationPayload.items is required (synthesis path is gone)', () => {
    type ItemsType = PageDecorationPayload['items'];
    type _Check = AssertTrue<Equal<ItemsType, ResolvedPaintItem[]>>;
    expectTypeOf<ItemsType>().toEqualTypeOf<ResolvedPaintItem[]>();
  });

  it('PageDecorationPayload.offset is required (no paint-time fallback) — SD-2957', () => {
    type OffsetType = PageDecorationPayload['offset'];
    type _Check = AssertTrue<Equal<OffsetType, number>>;
    expectTypeOf<OffsetType>().toEqualTypeOf<number>();
  });
});
