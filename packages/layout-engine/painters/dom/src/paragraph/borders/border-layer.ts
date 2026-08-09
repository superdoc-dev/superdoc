/**
 * Paragraph border DOM layer creation and CSS styling.
 *
 * Creates absolutely-positioned overlay elements for paragraph borders
 * and shading, with indent-aware sizing and between-border group support.
 *
 * @ooxml w:pPr/w:pBdr — paragraph border properties
 * @ooxml w:pPr/w:pBdr/w:top, w:bottom, w:left, w:right — side borders
 * @ooxml w:pPr/w:pBdr/w:between — between border (rendered as bottom within groups)
 * @ooxml w:pPr/w:shd — paragraph shading (background fill)
 * @spec  ECMA-376 §17.3.1.24 (pBdr), §17.3.1.31 (shd)
 */
import type { ParagraphAttrs, ParagraphBorder, ParagraphBorders } from '@superdoc/contracts';
import type { BetweenBorderInfo } from './group-analysis.js';

const PX_PER_PT = 96 / 72;

// ─── Border box sizing ─────────────────────────────────────────────

/**
 * Computes the indent-aware bounding box for paragraph border/shading layers.
 * Borders hug the paragraph content, inset by left/right/firstLine/hanging indents.
 */
export const getParagraphBorderBox = (
  fragmentWidth: number,
  indent?: ParagraphAttrs['indent'],
): { leftInset: number; width: number } => {
  const indentLeft = Number.isFinite(indent?.left) ? indent!.left! : 0;
  const indentRight = Number.isFinite(indent?.right) ? indent!.right! : 0;
  const firstLine = Number.isFinite(indent?.firstLine) ? indent!.firstLine! : 0;
  const hanging = Number.isFinite(indent?.hanging) ? indent!.hanging! : 0;
  const firstLineOffset = firstLine - hanging;
  const minLeftInset = Math.min(indentLeft, indentLeft + firstLineOffset);
  const leftInset = Math.max(0, minLeftInset);
  const rightInset = Math.max(0, indentRight);
  return {
    leftInset,
    width: Math.max(0, fragmentWidth - leftInset - rightInset),
  };
};

// ─── Border space (padding between border and text) ─────────────────

/**
 * Computes the outward expansion for the border/shading layers based on
 * the `space` attribute (OOXML: distance between border and text, in points).
 *
 * Within between-border groups, suppressed sides don't expand (the gap
 * extension handles visual continuity instead).
 *
 * @spec ECMA-376 §17.3.1.24 — space attribute on pBdr child elements
 */
export const computeBorderSpaceExpansion = (
  borders?: ParagraphBorders,
  betweenInfo?: BetweenBorderInfo,
): { top: number; bottom: number; left: number; right: number } => {
  if (!borders) return { top: 0, bottom: 0, left: 0, right: 0 };

  const suppressTop = betweenInfo?.suppressTopBorder ?? false;
  const suppressBottom = betweenInfo?.suppressBottomBorder ?? false;
  const showBetween = betweenInfo?.showBetweenBorder ?? false;

  return {
    // When top is suppressed (non-first group member), use the between border's space
    // to extend upward and fill the gap left by the previous paragraph's reduced extension.
    top: suppressTop
      ? borders.between?.space
        ? borders.between.space * PX_PER_PT
        : 0
      : borders.top?.space
        ? borders.top.space * PX_PER_PT
        : 0,
    bottom: !suppressBottom && !showBetween && borders.bottom?.space ? borders.bottom.space * PX_PER_PT : 0,
    left: borders.left?.space ? borders.left.space * PX_PER_PT : 0,
    right: borders.right?.space ? borders.right.space * PX_PER_PT : 0,
  };
};

// ─── Decoration layer factory ──────────────────────────────────────

/**
 * Builds overlay elements for paragraph shading and borders.
 * Returns layers in the order they should be appended (shading below borders).
 *
 * When `betweenInfo` indicates this fragment is in a border group:
 * - The border layer extends downward by `gapBelow` px into the paragraph-spacing
 *   gap, making left/right borders visually continuous across the group.
 * - `suppressTopBorder` hides the top border for non-first group members.
 * - `showBetweenBorder` replaces the bottom border with the between definition.
 *
 * The `space` attribute on each border side expands the layer outward,
 * creating padding between the border line and the paragraph text.
 */
export const createParagraphDecorationLayers = (
  doc: Document,
  fragmentWidth: number,
  attrs?: ParagraphAttrs,
  betweenInfo?: BetweenBorderInfo,
): { shadingLayer?: HTMLElement; borderLayer?: HTMLElement } => {
  if (!attrs?.borders && !attrs?.shading) return {};

  const borderBox = getParagraphBorderBox(fragmentWidth, attrs.indent);
  const space = computeBorderSpaceExpansion(attrs.borders, betweenInfo);

  // Extend layers into the spacing gap for continuous group borders.
  // Both real between (showBetweenBorder) and nil/none between (suppressBottomBorder)
  // need gap extension to keep left/right borders continuous through the spacing gap.
  //
  // For showBetweenBorder: reduce extension by between.space so the between border
  // (drawn as CSS bottom border) sits higher in the gap, creating padding to the next
  // paragraph. The next paragraph's top expansion fills the remaining gap portion.
  const betweenSpaceBelow =
    betweenInfo?.showBetweenBorder && attrs.borders?.between?.space ? attrs.borders.between.space * PX_PER_PT : 0;
  const rawGap = betweenInfo?.showBetweenBorder || betweenInfo?.suppressBottomBorder ? betweenInfo!.gapBelow : 0;
  const gapExtension = Math.max(0, rawGap - betweenSpaceBelow);

  // Border widths for each rendered side. With box-sizing: border-box, CSS borders are
  // drawn INSIDE the element. To position the border's inner edge at `space` distance
  // from the text, the border layer must be expanded by space + borderWidth.
  // The shading layer only needs space (it has no CSS borders).
  const bw = computeRenderedBorderWidths(attrs.borders, betweenInfo);

  const shadingBottom = gapExtension + space.bottom;
  const borderBottom = gapExtension + space.bottom + bw.bottom;

  const commonStyles = {
    position: 'absolute',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  } as const;

  let shadingLayer: HTMLElement | undefined;
  if (attrs.shading) {
    shadingLayer = doc.createElement('div');
    shadingLayer.classList.add('superdoc-paragraph-shading');
    Object.assign(shadingLayer.style, commonStyles);
    shadingLayer.style.top = space.top > 0 ? `-${space.top}px` : '0px';
    shadingLayer.style.bottom = shadingBottom > 0 ? `-${shadingBottom}px` : '0px';
    shadingLayer.style.left = `${borderBox.leftInset - space.left}px`;
    shadingLayer.style.width = `${borderBox.width + space.left + space.right}px`;
    applyParagraphShadingStyles(shadingLayer, attrs.shading);
  }

  let borderLayer: HTMLElement | undefined;
  if (attrs.borders) {
    borderLayer = doc.createElement('div');
    borderLayer.classList.add('superdoc-paragraph-border');
    Object.assign(borderLayer.style, commonStyles);
    borderLayer.style.top = space.top + bw.top > 0 ? `-${space.top + bw.top}px` : '0px';
    borderLayer.style.bottom = borderBottom > 0 ? `-${borderBottom}px` : '0px';
    borderLayer.style.left = `${borderBox.leftInset - space.left - bw.left}px`;
    borderLayer.style.width = `${borderBox.width + space.left + bw.left + space.right + bw.right}px`;
    borderLayer.style.zIndex = '1';
    applyParagraphBorderStyles(borderLayer, attrs.borders, betweenInfo);
  }

  return { shadingLayer, borderLayer };
};

/**
 * Computes the rendered CSS border widths per side, accounting for suppressed sides.
 * Used to expand the border layer so the inner edge is at the correct `space` offset.
 */
const computeRenderedBorderWidths = (
  borders?: ParagraphBorders,
  betweenInfo?: BetweenBorderInfo,
): { top: number; bottom: number; left: number; right: number } => {
  if (!borders) return { top: 0, bottom: 0, left: 0, right: 0 };
  const suppressTop = betweenInfo?.suppressTopBorder ?? false;
  const suppressBottom = betweenInfo?.suppressBottomBorder ?? false;
  const showBetween = betweenInfo?.showBetweenBorder ?? false;

  return {
    top: !suppressTop ? (borders.top?.width ?? 0) : 0,
    bottom: showBetween ? (borders.between?.width ?? 0) : !suppressBottom ? (borders.bottom?.width ?? 0) : 0,
    left: borders.left?.width ?? 0,
    right: borders.right?.width ?? 0,
  };
};

// ─── Border CSS application ────────────────────────────────────────

type CssBorderSide = 'top' | 'right' | 'bottom' | 'left';
const BORDER_SIDES: CssBorderSide[] = ['top', 'right', 'bottom', 'left'];

/**
 * Applies paragraph border styles to an HTML element.
 *
 * Handles between-border groups:
 * - `suppressTopBorder`: skips top border for non-first group members
 * - `showBetweenBorder`: replaces bottom with the between border definition
 */
export const applyParagraphBorderStyles = (
  element: HTMLElement,
  borders?: ParagraphAttrs['borders'],
  betweenInfo?: BetweenBorderInfo,
): void => {
  if (!borders) return;
  const showBetweenBorder = betweenInfo?.showBetweenBorder ?? false;
  const suppressTopBorder = betweenInfo?.suppressTopBorder ?? false;
  const suppressBottomBorder = betweenInfo?.suppressBottomBorder ?? false;

  element.style.boxSizing = 'border-box';
  BORDER_SIDES.forEach((side) => {
    if (side === 'top' && suppressTopBorder) return;
    if (side === 'bottom' && suppressBottomBorder) return;
    const border = borders[side];
    if (!border) return;
    setBorderSideStyle(element, side, border);
  });

  // Between border renders as a bottom border, overwriting any normal bottom border
  // when the fragment is within a border group (consecutive paragraphs with matching borders)
  if (showBetweenBorder && borders.between) {
    setBorderSideStyle(element, 'bottom', borders.between);
  }
};

const setBorderSideStyle = (element: HTMLElement, side: CssBorderSide, border: ParagraphBorder): void => {
  const resolvedStyle =
    border.style && border.style !== 'none' ? border.style : border.style === 'none' ? 'none' : 'solid';
  if (resolvedStyle === 'none') {
    element.style.setProperty(`border-${side}-style`, 'none');
    element.style.setProperty(`border-${side}-width`, '0px');
    if (border.color) {
      element.style.setProperty(`border-${side}-color`, border.color);
    }
    return;
  }

  const width = border.width != null ? Math.max(0, border.width) : undefined;
  element.style.setProperty(`border-${side}-style`, resolvedStyle);
  element.style.setProperty(`border-${side}-width`, `${width ?? 1}px`);
  element.style.setProperty(`border-${side}-color`, border.color ?? '#000');
};

// ─── Dataset stamping ─────────────────────────────────────────────

/**
 * Stamps between-border info onto an element's dataset for debugging
 * and incremental update cache invalidation.
 */
export const stampBetweenBorderDataset = (element: HTMLElement, betweenInfo?: BetweenBorderInfo): void => {
  if (!betweenInfo) return;
  if (betweenInfo.showBetweenBorder) element.dataset.betweenBorder = 'true';
  if (betweenInfo.suppressTopBorder) element.dataset.suppressTopBorder = 'true';
  if (betweenInfo.suppressBottomBorder) element.dataset.suppressBottomBorder = 'true';
  if (betweenInfo.gapBelow) element.dataset.gapBelow = String(betweenInfo.gapBelow);
};

// ─── Shading CSS application ───────────────────────────────────────

/**
 * Applies paragraph shading (background color) to an HTML element.
 */
export const applyParagraphShadingStyles = (element: HTMLElement, shading?: ParagraphAttrs['shading']): void => {
  if (!shading?.fill) return;
  element.style.backgroundColor = shading.fill;
};
