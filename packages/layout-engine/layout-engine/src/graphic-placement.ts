import type {
  ColumnLayoutForAnchor,
  DrawingBlock,
  DrawingMeasure,
  GraphicPlacement,
  ImageBlock,
  ImageMeasure,
  ImageWrap,
  PageMargins,
  TableAnchor,
  TableMeasure,
  TableWrap,
} from '@superdoc/contracts';
import { getFragmentZIndex, resolveAnchoredGraphicX, resolveAnchoredGraphicY } from '@superdoc/contracts';

type GraphicAnchor = GraphicPlacement | TableAnchor;
type GraphicWrapType = ImageWrap['type'] | TableWrap['type'];

export type ResolveGraphicPlacementInput = {
  anchor?: GraphicAnchor;
  objectWidth: number;
  objectHeight: number;
  columnIndex: number;
  columns: ColumnLayoutForAnchor;
  pageMargins?: PageMargins;
  pageWidth?: number;
  contentTop: number;
  contentBottom: number;
  pageBottomMargin?: number;
  anchorParagraphY?: number;
  firstLineHeight?: number;
  preRegisteredFallbackToContentTop?: boolean;
  fallbackX?: number;
  wrapType?: GraphicWrapType;
  layer?: {
    behindDoc?: boolean;
    zIndex?: number;
  };
};

export type ResolvedGraphicPlacement = {
  paint: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  exclusion: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  layer: {
    behindDoc: boolean;
    zIndex?: number;
  };
};

function normalizeHorizontalAnchor(anchor: GraphicAnchor): Parameters<typeof resolveAnchoredGraphicX>[0] {
  const alignH = anchor.alignH;
  const mappedAlignH =
    alignH === 'left' || alignH === 'center' || alignH === 'right'
      ? alignH
      : alignH === 'inside'
        ? 'left'
        : alignH === 'outside'
          ? 'right'
          : undefined;

  return {
    hRelativeFrom: anchor.hRelativeFrom,
    alignH: mappedAlignH,
    offsetH: anchor.offsetH,
  };
}

function normalizeVerticalAnchor(anchor: GraphicAnchor): Parameters<typeof resolveAnchoredGraphicY>[0]['anchor'] {
  const alignV = anchor.alignV;
  const mappedAlignV = alignV === 'top' || alignV === 'center' || alignV === 'bottom' ? alignV : undefined;

  return {
    vRelativeFrom: anchor.vRelativeFrom,
    alignV: mappedAlignV,
    offsetV: anchor.offsetV,
  };
}

function wrapAffectsTextFlow(wrapType: GraphicWrapType | undefined): boolean {
  return wrapType !== 'Inline' && wrapType !== 'None';
}

/**
 * Resolve anchored graphic placement once for all downstream layout consumers.
 *
 * The returned paint and exclusion coordinates intentionally share the same
 * origin. Callers should not add anchor offsets again when registering text-wrap
 * exclusion zones or creating paint fragments.
 */
export function resolveGraphicPlacement(input: ResolveGraphicPlacementInput): ResolvedGraphicPlacement {
  const {
    anchor,
    objectWidth,
    objectHeight,
    columnIndex,
    columns,
    pageMargins,
    pageWidth,
    contentTop,
    contentBottom,
    pageBottomMargin,
    anchorParagraphY,
    firstLineHeight,
    preRegisteredFallbackToContentTop,
    fallbackX = pageMargins?.left ?? 0,
    wrapType,
    layer,
  } = input;

  const x = anchor
    ? resolveAnchoredGraphicX(
        normalizeHorizontalAnchor(anchor),
        columnIndex,
        columns,
        objectWidth,
        { left: pageMargins?.left, right: pageMargins?.right },
        pageWidth,
      )
    : fallbackX;

  const y = resolveAnchoredGraphicY({
    anchor: anchor ? normalizeVerticalAnchor(anchor) : undefined,
    objectHeight,
    contentTop,
    contentBottom,
    pageBottomMargin,
    anchorParagraphY,
    firstLineHeight,
    preRegisteredFallbackToContentTop,
  });

  const behindDoc = anchor != null && 'behindDoc' in anchor ? anchor.behindDoc === true : layer?.behindDoc === true;
  const affectsTextWrap = wrapAffectsTextFlow(wrapType);
  const bounds = { x, y, width: objectWidth, height: objectHeight };

  return {
    paint: bounds,
    exclusion: affectsTextWrap ? { ...bounds } : null,
    layer: {
      behindDoc,
      zIndex: layer?.zIndex,
    },
  };
}

export function resolveDrawingPlacement(
  block: ImageBlock | DrawingBlock,
  measure: ImageMeasure | DrawingMeasure,
  context: Omit<ResolveGraphicPlacementInput, 'anchor' | 'objectWidth' | 'objectHeight' | 'wrapType' | 'layer'>,
): ResolvedGraphicPlacement {
  return resolveGraphicPlacement({
    ...context,
    anchor: block.anchor,
    objectWidth: measure.width ?? 0,
    objectHeight: measure.height ?? 0,
    wrapType: block.wrap?.type,
    layer: {
      behindDoc: block.anchor?.behindDoc,
      zIndex: getFragmentZIndex(block),
    },
  });
}

export function resolveTablePlacement(
  anchor: TableAnchor | undefined,
  measure: TableMeasure,
  wrap: TableWrap | undefined,
  context: Omit<ResolveGraphicPlacementInput, 'anchor' | 'objectWidth' | 'objectHeight' | 'wrapType' | 'layer'>,
): ResolvedGraphicPlacement {
  return resolveGraphicPlacement({
    ...context,
    anchor,
    objectWidth: measure.totalWidth ?? 0,
    objectHeight: measure.totalHeight ?? 0,
    wrapType: wrap?.type,
  });
}
