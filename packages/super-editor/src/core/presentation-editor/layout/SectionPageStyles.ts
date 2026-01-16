import type { Layout } from '@superdoc/contracts';

export type ConverterPageStyles = {
  pageMargins?: { left?: number; right?: number; top?: number; bottom?: number };
};

export function getCurrentSectionPageStyles(
  layout: Layout | null,
  pageIndex: number,
  converterPageStyles?: ConverterPageStyles | null,
): {
  pageSize: { width: number; height: number };
  pageMargins: { left: number; right: number; top: number; bottom: number };
  sectionIndex: number;
  orientation: 'portrait' | 'landscape';
} {
  const PPI = 96;
  const page = layout?.pages?.[pageIndex];

  const converterStyles = converterPageStyles ?? {};
  const defaultMargins = converterStyles.pageMargins ?? { left: 1, right: 1, top: 1, bottom: 1 };

  const safeMargins = {
    left: typeof defaultMargins.left === 'number' ? defaultMargins.left : 1,
    right: typeof defaultMargins.right === 'number' ? defaultMargins.right : 1,
    top: typeof defaultMargins.top === 'number' ? defaultMargins.top : 1,
    bottom: typeof defaultMargins.bottom === 'number' ? defaultMargins.bottom : 1,
  };

  if (!page) {
    return {
      pageSize: { width: 8.5, height: 11 },
      pageMargins: safeMargins,
      sectionIndex: 0,
      orientation: 'portrait',
    };
  }

  const pageOrientation =
    page.orientation === 'landscape' || page.orientation === 'portrait' ? page.orientation : 'portrait';

  const standardPortrait = { w: 8.5 * PPI, h: 11 * PPI };
  const standardLandscape = { w: 11 * PPI, h: 8.5 * PPI };
  const orientationDefault = pageOrientation === 'landscape' ? standardLandscape : standardPortrait;

  const pageWidthPx = page.size?.w ?? orientationDefault.w;
  const pageHeightPx = page.size?.h ?? orientationDefault.h;

  const marginLeftPx = page.margins?.left ?? safeMargins.left * PPI;
  const marginRightPx = page.margins?.right ?? safeMargins.right * PPI;
  const marginTopPx = page.margins?.top ?? safeMargins.top * PPI;
  const marginBottomPx = page.margins?.bottom ?? safeMargins.bottom * PPI;

  return {
    pageSize: {
      width: pageWidthPx / PPI,
      height: pageHeightPx / PPI,
    },
    pageMargins: {
      left: marginLeftPx / PPI,
      right: marginRightPx / PPI,
      top: marginTopPx / PPI,
      bottom: marginBottomPx / PPI,
    },
    sectionIndex: page.sectionIndex ?? 0,
    orientation: pageOrientation,
  };
}
