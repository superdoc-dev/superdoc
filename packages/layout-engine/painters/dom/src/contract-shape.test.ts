/**
 * Compile-time + runtime contract lockdown for the painter's public surface.
 *
 * These assertions fail when someone reintroduces a legacy field on
 * `DomPainterInput`, changes `DomPainterHandle`, or makes
 * `PageDecorationPayload.items` optional. The boundary tests in
 * `tests/src/architecture-boundaries.test.ts` cover the import side; this
 * file covers the type-shape side.
 */
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import type { ResolvedLayout, ResolvedPaintItem } from '@superdoc/contracts';
import { createDomPainter, type DomPainterHandle, type DomPainterInput, type PageDecorationPayload } from './index.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type AssertTrue<T extends true> = T;

describe('DomPainter public contract shape', () => {
  it('DomPainterInput is exactly { resolvedLayout: ResolvedLayout }', () => {
    type _Check = AssertTrue<Equal<DomPainterInput, { resolvedLayout: ResolvedLayout }>>;
    expectTypeOf<DomPainterInput>().toEqualTypeOf<{ resolvedLayout: ResolvedLayout }>();
  });

  it('DomPainterHandle exposes only the painter-owned methods (P7: virtualization/scroll plumbing deleted)', () => {
    type ExpectedKeys =
      | 'paint'
      | 'paintPersistentPages'
      | 'getHydratedContentPageIndices'
      | 'isPersistentPageSurfaceIntact'
      | 'setPersistentSurfaceInvalidationHandler'
      | 'consumePaintWorkSummary'
      | 'consumePositionValidationSummary'
      | 'setProviders'
      | 'getPersistentPageIndices'
      | 'setShowFormattingMarks'
      | 'dispose';
    type _Check = AssertTrue<Equal<keyof DomPainterHandle, ExpectedKeys>>;
    expectTypeOf<keyof DomPainterHandle>().toEqualTypeOf<ExpectedKeys>();
  });

  it('keeps private integration seams out of the enumerable runtime surface', () => {
    expect(Object.keys(createDomPainter({})).sort()).toEqual([
      'consumePaintWorkSummary',
      'consumePositionValidationSummary',
      'dispose',
      'getHydratedContentPageIndices',
      'getPersistentPageIndices',
      'isPersistentPageSurfaceIntact',
      'paint',
      'paintPersistentPages',
      'setPersistentSurfaceInvalidationHandler',
      'setProviders',
      'setShowFormattingMarks',
    ]);
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
