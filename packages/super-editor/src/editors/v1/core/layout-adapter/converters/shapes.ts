/**
 * Shape Node Converter
 *
 * Handles conversion of ProseMirror shape nodes (vectorShape, shapeGroup, shapeContainer, shapeTextbox)
 * to DrawingBlocks
 */

import type {
  DrawingBlock,
  FlowBlock,
  ImageBlock,
  ParagraphBlock,
  TextboxDrawing,
  VectorShapeDrawing,
  ShapeGroupDrawing,
  ImageAnchor,
  CustomGeometryData,
  SourceAnchor,
  ShapeTextContent,
  TextPart,
} from '@superdoc/contracts';
import { getOuterShadowPaintExtent as getSharedOuterShadowPaintExtent } from '@superdoc/contracts';
import type { PMNode, NodeHandlerContext, BlockIdGenerator, PositionMap } from '../types.js';
import type { EffectExtent, LineEnds } from '../utilities.js';
import {
  pickNumber,
  isPlainObject,
  coerceNumber,
  coercePositiveNumber,
  coerceBoolean,
  toBoolean,
  toBoxSpacing,
  toDrawingContentSnapshot,
  isShapeGroupTransform,
  normalizeShapeSize,
  normalizeShapeGroupChildren,
  normalizeFillColor,
  normalizeStrokeColor,
  normalizeLineEnds,
  normalizeEffectExtent,
  normalizeShapeEffects,
  normalizeTextContent,
  normalizeTextVerticalAlign,
  normalizeTextInsets,
  normalizeZIndex,
  resolveFloatingZIndex,
  mergeWrapDistancesFromPadding,
  ptToPx,
} from '../utilities.js';
import { getLastParagraphFont } from './paragraph.js';

// ============================================================================
// Constants
// ============================================================================

const WRAP_TYPES = new Set(['None', 'Square', 'Tight', 'Through', 'TopAndBottom', 'Inline']);
const WRAP_TEXT_VALUES = new Set(['bothSides', 'left', 'right', 'largest']);
const H_RELATIVE_VALUES = new Set(['column', 'page', 'margin']);
const V_RELATIVE_VALUES = new Set(['paragraph', 'page', 'margin']);
const H_ALIGN_VALUES = new Set(['left', 'center', 'right']);
const V_ALIGN_VALUES = new Set(['top', 'center', 'bottom']);

// ============================================================================
// Helper Functions - Wrap & Anchor Normalization
// ============================================================================
// Note: Helper functions for type coercion, box spacing, and drawing content
// are imported from utilities.ts to avoid duplication

/**
 * Safely extract attributes from a PMNode as a Record<string, unknown>
 *
 * @param node - ProseMirror node
 * @returns Attributes as a Record<string, unknown>, or empty object if not valid
 */
const getAttrs = (node: PMNode): Record<string, unknown> => {
  return isPlainObject(node.attrs) ? (node.attrs as Record<string, unknown>) : {};
};

const isHiddenDrawing = (attrs: Record<string, unknown>): boolean => {
  if (toBoolean(attrs.hidden) === true) return true;
  return typeof attrs.visibility === 'string' && attrs.visibility.toLowerCase() === 'hidden';
};

type ShapeDrawingBlock = VectorShapeDrawing | TextboxDrawing | ShapeGroupDrawing;
type ShapeDrawingGeometry = ShapeDrawingBlock['geometry'];
type ShapeGroupChild = ShapeGroupDrawing['shapes'][number];

type TextboxAttrsPayload = {
  attributes?: Record<string, unknown>;
};

const TEXTBOX_CONTAINER_TYPES = new Set([
  'run',
  'link',
  'hyperlink',
  'structuredContent',
  'fieldAnnotation',
  'smartTag',
]);

const resolveTextFormattingFromMarks = (marks: PMNode['marks']): TextPart['formatting'] | undefined => {
  if (!Array.isArray(marks) || marks.length === 0) return undefined;

  const formatting: NonNullable<TextPart['formatting']> = {};

  marks.forEach((mark) => {
    if (!mark || typeof mark.type !== 'string') return;
    const attrs = isPlainObject(mark.attrs) ? mark.attrs : {};
    if (mark.type === 'bold') formatting.bold = true;
    if (mark.type === 'italic') formatting.italic = true;

    const color = typeof attrs.color === 'string' ? attrs.color.replace(/^#/, '') : undefined;
    if (color) formatting.color = color;

    const fontFamily = typeof attrs.fontFamily === 'string' ? attrs.fontFamily : undefined;
    if (fontFamily) formatting.fontFamily = fontFamily;

    const fontSize = pickNumber(attrs.fontSize);
    if (fontSize != null) formatting.fontSize = fontSize;
  });

  return Object.keys(formatting).length > 0 ? formatting : undefined;
};

const pushTextPart = (parts: TextPart[], part: TextPart): void => {
  if (!part.text && !part.fieldType && !part.isLineBreak) return;
  parts.push(part);
};

const extractTextPartsFromTextboxInline = (node: PMNode | undefined, parts: TextPart[]): void => {
  if (!node) return;
  const formatting = resolveTextFormattingFromMarks(node.marks);

  if (typeof node.text === 'string') {
    pushTextPart(parts, {
      text: node.text,
      ...(formatting ? { formatting } : {}),
    });
    return;
  }

  switch (node.type) {
    case 'text':
      pushTextPart(parts, {
        text: '',
        ...(formatting ? { formatting } : {}),
      });
      return;
    case 'tab':
      pushTextPart(parts, { text: '\t', ...(formatting ? { formatting } : {}) });
      return;
    case 'lineBreak':
      pushTextPart(parts, { text: '\n', isLineBreak: true, ...(formatting ? { formatting } : {}) });
      return;
    case 'page-number':
      pushTextPart(parts, {
        text: '',
        fieldType: 'PAGE',
        pageNumberFormat:
          typeof node.attrs?.pageNumberFormat === 'string'
            ? (node.attrs.pageNumberFormat as TextPart['pageNumberFormat'])
            : undefined,
        ...(formatting ? { formatting } : {}),
      });
      return;
    case 'total-page-number':
      pushTextPart(parts, {
        text:
          typeof node.attrs?.resolvedText === 'string'
            ? node.attrs.resolvedText
            : typeof node.attrs?.importedCachedText === 'string'
              ? node.attrs.importedCachedText
              : '',
        fieldType: 'NUMPAGES',
        pageNumberFormat:
          typeof node.attrs?.pageNumberFormat === 'string'
            ? (node.attrs.pageNumberFormat as TextPart['pageNumberFormat'])
            : undefined,
        ...(formatting ? { formatting } : {}),
      });
      return;
    default:
      break;
  }

  if (Array.isArray(node.content) && (TEXTBOX_CONTAINER_TYPES.has(node.type) || node.content.length > 0)) {
    node.content.forEach((child) => extractTextPartsFromTextboxInline(child, parts));
  }
};

const extractTextboxTextContent = (node: PMNode): ShapeTextContent | undefined => {
  if (!Array.isArray(node.content) || node.content.length === 0) return undefined;

  const parts: TextPart[] = [];
  let horizontalAlign: ShapeTextContent['horizontalAlign'];

  const paragraphs = node.content.filter((child) => child?.type === 'paragraph');
  const paragraphHasRenderableContent = (paragraph: PMNode): boolean =>
    Array.isArray(paragraph.content) && paragraph.content.length > 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const justification = paragraph.attrs?.paragraphProperties;
    if (!horizontalAlign && isPlainObject(justification)) {
      const value = justification.justification;
      if (value === 'left' || value === 'center' || value === 'right') {
        horizontalAlign = value;
      }
    }

    paragraph.content?.forEach((child) => extractTextPartsFromTextboxInline(child, parts));

    if (paragraphIndex < paragraphs.length - 1) {
      const nextParagraph = paragraphs[paragraphIndex + 1];
      parts.push({
        text: '\n',
        isLineBreak: true,
        isEmptyParagraph: !paragraphHasRenderableContent(paragraph) || !paragraphHasRenderableContent(nextParagraph),
      });
    }
  });

  return parts.length > 0 ? { parts, ...(horizontalAlign ? { horizontalAlign } : {}) } : undefined;
};

const isParagraphNode = (node: PMNode | undefined): node is PMNode => node?.type === 'paragraph';

const toTextboxParagraphBlocks = (node: PMNode, context: NodeHandlerContext): ParagraphBlock[] => {
  const shapeTextboxNode = node.type === 'shapeTextbox' ? node : resolveNestedShapeTextboxNode(node);
  const paragraphToFlowBlocks = context.converters?.paragraphToFlowBlocks;
  if (!shapeTextboxNode || !paragraphToFlowBlocks || !Array.isArray(shapeTextboxNode.content)) {
    return [];
  }

  const textboxBlocks: FlowBlock[] = [];
  for (const child of shapeTextboxNode.content) {
    if (!isParagraphNode(child)) continue;

    const convertedBlocks = paragraphToFlowBlocks({
      para: child,
      nextBlockId: context.nextBlockId,
      positions: context.positions,
      storyKey: context.storyKey,
      trackedChangesConfig: context.trackedChangesConfig,
      bookmarks: context.bookmarks,
      hyperlinkConfig: context.hyperlinkConfig,
      themeColors: context.themeColors,
      converters: context.converters,
      converterContext: context.converterContext,
      enableComments: context.enableComments,
      previousParagraphFont: getLastParagraphFont(textboxBlocks),
    });

    textboxBlocks.push(...convertedBlocks);
  }

  return textboxBlocks.filter((block): block is ParagraphBlock => block.kind === 'paragraph');
};

export function hydrateTextboxDrawingContent(
  node: PMNode,
  drawingBlock: DrawingBlock,
  context: Pick<NodeHandlerContext, 'nextBlockId' | 'positions' | 'converters' | 'converterContext'> &
    Partial<
      Pick<
        NodeHandlerContext,
        'storyKey' | 'trackedChangesConfig' | 'bookmarks' | 'hyperlinkConfig' | 'themeColors' | 'enableComments'
      >
    >,
): DrawingBlock {
  if (drawingBlock.drawingKind !== 'textboxShape') {
    return drawingBlock;
  }

  return {
    ...drawingBlock,
    contentBlocks: toTextboxParagraphBlocks(node, context as NodeHandlerContext),
  };
}

const parseTextboxInsetValue = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.endsWith('pt')) {
    return ptToPx(parseFloat(trimmed.slice(0, -2)));
  }
  if (trimmed.endsWith('px')) {
    return pickNumber(trimmed.slice(0, -2));
  }
  if (trimmed.endsWith('in')) {
    const inches = parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(inches) ? inches * 96 : undefined;
  }
  return pickNumber(trimmed);
};

const resolveTextboxInsetsFromAttrs = (
  attrs: Record<string, unknown>,
): VectorShapeDrawing['textInsets'] | undefined => {
  const explicitInsets = normalizeTextInsets(attrs.textInsets);
  if (explicitInsets) return explicitInsets;

  const textboxAttrs = isPlainObject(attrs.attributes)
    ? (attrs.attributes as TextboxAttrsPayload['attributes'])
    : undefined;
  const inset = typeof textboxAttrs?.inset === 'string' ? textboxAttrs.inset : undefined;
  if (!inset) return undefined;

  const values = inset.split(',').map((entry) => parseTextboxInsetValue(entry));
  if (values.length !== 4 || values.some((entry) => entry == null)) return undefined;

  return {
    top: values[1] as number,
    right: values[2] as number,
    bottom: values[3] as number,
    left: values[0] as number,
  };
};

const resolveTextboxVerticalAlignFromAttrs = (
  attrs: Record<string, unknown>,
): VectorShapeDrawing['textVerticalAlign'] | undefined => {
  const explicitAlign = normalizeTextVerticalAlign(attrs.textVerticalAlign);
  if (explicitAlign) return explicitAlign;

  const textboxAttrs = isPlainObject(attrs.attributes)
    ? (attrs.attributes as TextboxAttrsPayload['attributes'])
    : undefined;
  const style = typeof textboxAttrs?.style === 'string' ? textboxAttrs.style : undefined;
  if (!style) return undefined;

  const match = style.match(/v-text-anchor\s*:\s*(top|middle|bottom)/i);
  if (!match) return undefined;
  if (match[1].toLowerCase() === 'middle') return 'center';
  return match[1].toLowerCase() as 'top' | 'bottom';
};

const resolveNestedShapeTextboxNode = (node: PMNode): PMNode | undefined =>
  Array.isArray(node.content) ? node.content.find((child) => child?.type === 'shapeTextbox') : undefined;

/**
 * Normalize wrap type value to a valid ImageBlock wrap type
 *
 * @param value - Raw value to validate
 * @returns Valid wrap type or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeWrapType('Square') // => 'Square'
 * normalizeWrapType('Invalid') // => undefined
 * normalizeWrapType(123) // => undefined
 * ```
 */
const normalizeWrapType = (value: unknown): NonNullable<ImageBlock['wrap']>['type'] | undefined => {
  if (typeof value !== 'string') return undefined;
  return WRAP_TYPES.has(value) ? (value as NonNullable<ImageBlock['wrap']>['type']) : undefined;
};

/**
 * Normalize wrap text value to a valid wrapText option
 *
 * @param value - Raw value to validate
 * @returns Valid wrapText value or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeWrapText('bothSides') // => 'bothSides'
 * normalizeWrapText('invalid') // => undefined
 * ```
 */
const normalizeWrapText = (value: unknown): NonNullable<ImageBlock['wrap']>['wrapText'] | undefined => {
  if (typeof value !== 'string') return undefined;
  return WRAP_TEXT_VALUES.has(value) ? (value as NonNullable<ImageBlock['wrap']>['wrapText']) : undefined;
};

/**
 * Normalize polygon points array for wrap configuration
 *
 * @param value - Raw polygon data
 * @returns Array of [x, y] coordinate pairs, or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizePolygon([[0, 0], [100, 0], [100, 100]]) // => [[0, 0], [100, 0], [100, 100]]
 * normalizePolygon([[0], [100, 'x']]) // => undefined (invalid points filtered out)
 * normalizePolygon('not-array') // => undefined
 * ```
 */
const normalizePolygon = (value: unknown): number[][] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const polygon: number[][] = [];
  value.forEach((point) => {
    if (!Array.isArray(point) || point.length < 2) return;
    const x = pickNumber(point[0]);
    const y = pickNumber(point[1]);
    if (x == null || y == null) return;
    polygon.push([x, y]);
  });
  return polygon.length > 0 ? polygon : undefined;
};

/**
 * Normalize wrap configuration from raw OOXML data
 *
 * @param value - Raw wrap configuration object
 * @returns Normalized ImageBlock wrap configuration, or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeWrap({
 *   type: 'Square',
 *   attrs: { wrapText: 'bothSides', distTop: 10 }
 * }) // => { type: 'Square', wrapText: 'bothSides', distTop: 10 }
 *
 * normalizeWrap({ type: 'Inline' }) // => undefined (Inline type is filtered)
 * normalizeWrap('invalid') // => undefined
 * ```
 */
const normalizeWrap = (value: unknown): ImageBlock['wrap'] | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const type = normalizeWrapType(value.type);
  if (!type || type === 'Inline') {
    return undefined;
  }

  const wrap: ImageBlock['wrap'] = { type };
  const attrs = isPlainObject(value.attrs) ? value.attrs : {};

  const wrapText = normalizeWrapText(attrs.wrapText);
  if (wrapText) {
    wrap.wrapText = wrapText;
  }

  const distTop = pickNumber(attrs.distTop ?? attrs.distT);
  if (distTop != null) wrap.distTop = distTop;
  const distBottom = pickNumber(attrs.distBottom ?? attrs.distB);
  if (distBottom != null) wrap.distBottom = distBottom;
  const distLeft = pickNumber(attrs.distLeft ?? attrs.distL);
  if (distLeft != null) wrap.distLeft = distLeft;
  const distRight = pickNumber(attrs.distRight ?? attrs.distR);
  if (distRight != null) wrap.distRight = distRight;

  const polygon = normalizePolygon(attrs.polygon);
  if (polygon) {
    wrap.polygon = polygon;
  }

  const behindDoc = toBoolean(attrs.behindDoc);
  if (behindDoc != null) {
    wrap.behindDoc = behindDoc;
  }

  return wrap;
};

/**
 * Normalize anchor relative positioning value
 *
 * @param value - Raw relative positioning value
 * @param allowed - Set of allowed values
 * @returns Valid relative position string or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeAnchorRelative('column', H_RELATIVE_VALUES) // => 'column'
 * normalizeAnchorRelative('invalid', H_RELATIVE_VALUES) // => undefined
 * ```
 */
const normalizeAnchorRelative = (value: unknown, allowed: Set<string>): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return allowed.has(value) ? value : undefined;
};

/**
 * Normalize anchor alignment value
 *
 * @param value - Raw alignment value
 * @param allowed - Set of allowed alignment values
 * @returns Valid alignment string or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeAnchorAlign('center', H_ALIGN_VALUES) // => 'center'
 * normalizeAnchorAlign('invalid', H_ALIGN_VALUES) // => undefined
 * ```
 */
const normalizeAnchorAlign = (value: unknown, allowed: Set<string>): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return allowed.has(value) ? value : undefined;
};

/**
 * Normalize anchor data from OOXML attributes
 *
 * @param value - Raw anchor data object
 * @param attrs - Node attributes for fallback values
 * @param wrapBehindDoc - Optional behindDoc value from wrap config
 * @returns Normalized anchor configuration, or undefined if no anchor data present
 *
 * @example
 * ```typescript
 * normalizeAnchorData(
 *   { hRelativeFrom: 'column', vRelativeFrom: 'paragraph', offsetH: 50 },
 *   {},
 *   false
 * ) // => { isAnchored: true, hRelativeFrom: 'column', vRelativeFrom: 'paragraph', offsetH: 50 }
 *
 * normalizeAnchorData(null, { isAnchor: true }, undefined)
 * // => { isAnchored: true }
 * ```
 */
const normalizeAnchorData = (
  value: unknown,
  attrs: Record<string, unknown>,
  wrapBehindDoc?: boolean,
): ImageAnchor | undefined => {
  const raw = isPlainObject(value) ? value : undefined;
  const marginOffset = isPlainObject(attrs.marginOffset) ? attrs.marginOffset : undefined;
  const simplePos = isPlainObject(attrs.simplePos) ? attrs.simplePos : undefined;
  const originalAttrs = isPlainObject(attrs.originalAttributes) ? attrs.originalAttributes : undefined;
  const isAnchored = attrs.isAnchor === true || Boolean(raw);

  const anchor: ImageAnchor = {};
  if (isAnchored) {
    anchor.isAnchored = true;
  }

  const hRelative = normalizeAnchorRelative(raw?.hRelativeFrom, H_RELATIVE_VALUES);
  if (hRelative) anchor.hRelativeFrom = hRelative as ImageAnchor['hRelativeFrom'];

  const vRelative = normalizeAnchorRelative(raw?.vRelativeFrom, V_RELATIVE_VALUES);
  if (vRelative) anchor.vRelativeFrom = vRelative as ImageAnchor['vRelativeFrom'];

  const alignH = normalizeAnchorAlign(raw?.alignH, H_ALIGN_VALUES);
  if (alignH) anchor.alignH = alignH as ImageAnchor['alignH'];

  const alignV = normalizeAnchorAlign(raw?.alignV, V_ALIGN_VALUES);
  if (alignV) anchor.alignV = alignV as ImageAnchor['alignV'];

  const offsetH = pickNumber(marginOffset?.horizontal ?? marginOffset?.left ?? raw?.offsetH ?? simplePos?.x);
  if (offsetH != null) anchor.offsetH = offsetH;

  const offsetV = pickNumber(marginOffset?.top ?? marginOffset?.vertical ?? raw?.offsetV ?? simplePos?.y);
  if (offsetV != null) anchor.offsetV = offsetV;

  const behindDoc = toBoolean(raw?.behindDoc ?? wrapBehindDoc ?? originalAttrs?.behindDoc);
  if (behindDoc != null) anchor.behindDoc = behindDoc;

  const hasData =
    anchor.isAnchored ||
    anchor.hRelativeFrom != null ||
    anchor.vRelativeFrom != null ||
    anchor.alignH != null ||
    anchor.alignV != null ||
    anchor.offsetH != null ||
    anchor.offsetV != null ||
    anchor.behindDoc != null;

  return hasData ? anchor : undefined;
};

/**
 * Build a DrawingBlock from normalized shape attributes
 *
 * This helper eliminates code duplication across all shape converters by
 * centralizing the common DrawingBlock construction logic.
 *
 * @param rawAttrs - Extracted and normalized attributes
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @param node - Original PM node
 * @param geometry - Calculated geometry configuration
 * @param drawingKind - Type of drawing ('vectorShape' or 'shapeGroup')
 * @param extraProps - Additional properties specific to drawing kind
 * @returns Complete DrawingBlock
 *
 * @example
 * ```typescript
 * const geometry = {
 *   width: 100,
 *   height: 50,
 *   rotation: 0,
 *   flipH: false,
 *   flipV: false
 * };
 * const block = buildDrawingBlock(attrs, nextBlockId, positions, node, geometry, 'vectorShape');
 * ```
 */
export const buildDrawingBlock = (
  rawAttrs: Record<string, unknown>,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  node: PMNode,
  geometry: ShapeDrawingGeometry,
  drawingKind: ShapeDrawingBlock['drawingKind'],
  extraProps?: Partial<ShapeDrawingBlock> & {
    lineEnds?: LineEnds;
    effectExtent?: EffectExtent;
  },
): ShapeDrawingBlock => {
  const normalizedWrap = normalizeWrap(rawAttrs.wrap);
  if (normalizedWrap) {
    mergeWrapDistancesFromPadding(
      normalizedWrap,
      toBoxSpacing(rawAttrs.padding as Record<string, unknown> | undefined),
    );
  }
  const sourceAnchor = isPlainObject(rawAttrs.sourceAnchor) ? (rawAttrs.sourceAnchor as SourceAnchor) : undefined;
  const baseAnchor = normalizeAnchorData(rawAttrs.anchorData, rawAttrs, normalizedWrap?.behindDoc);
  const pos = positions.get(node);
  const attrsWithPm: Record<string, unknown> = { ...rawAttrs };
  if (pos) {
    attrsWithPm.pmStart = pos.start;
    attrsWithPm.pmEnd = pos.end;
  }

  const behindDoc = baseAnchor?.behindDoc === true || normalizedWrap?.behindDoc === true;
  // Try to get zIndex from relativeHeight first, fallback to direct zIndex attribute
  const zIndexFromRelativeHeight = normalizeZIndex(rawAttrs.originalAttributes);
  const resolvedZIndex = resolveFloatingZIndex(behindDoc, zIndexFromRelativeHeight, coerceNumber(rawAttrs.zIndex) ?? 1);

  return {
    kind: 'drawing',
    id: nextBlockId('drawing'),
    drawingKind,
    padding: toBoxSpacing(rawAttrs.padding as Record<string, unknown> | undefined),
    margin:
      toBoxSpacing(rawAttrs.marginOffset as Record<string, unknown> | undefined) ??
      toBoxSpacing(rawAttrs.margin as Record<string, unknown> | undefined),
    anchor: baseAnchor,
    wrap: normalizedWrap,
    zIndex: resolvedZIndex,
    drawingContentId: typeof rawAttrs.drawingContentId === 'string' ? rawAttrs.drawingContentId : undefined,
    drawingContent: toDrawingContentSnapshot(rawAttrs.drawingContent),
    attrs: attrsWithPm,
    geometry,
    shapeKind: typeof rawAttrs.kind === 'string' ? rawAttrs.kind : undefined,
    customGeometry: rawAttrs.customGeometry != null ? (rawAttrs.customGeometry as CustomGeometryData) : undefined,
    fillColor: normalizeFillColor(rawAttrs.fillColor),
    strokeColor: normalizeStrokeColor(rawAttrs.strokeColor),
    strokeWidth: coerceNumber(rawAttrs.strokeWidth),
    effects: normalizeShapeEffects(rawAttrs.effects),
    textContent: normalizeTextContent(rawAttrs.textContent),
    textAlign: typeof rawAttrs.textAlign === 'string' ? rawAttrs.textAlign : undefined,
    textVerticalAlign: normalizeTextVerticalAlign(rawAttrs.textVerticalAlign),
    textInsets: normalizeTextInsets(rawAttrs.textInsets),
    sourceAnchor,
    ...extraProps,
  } as ShapeDrawingBlock;
};

// ============================================================================
// Shape Converter Functions
// ============================================================================

const mergeEffectExtents = (
  base: EffectExtent | undefined,
  supplement: EffectExtent | undefined,
): EffectExtent | undefined => {
  if (!base) return supplement;
  if (!supplement) return base;
  return {
    left: Math.max(base.left, supplement.left),
    top: Math.max(base.top, supplement.top),
    right: Math.max(base.right, supplement.right),
    bottom: Math.max(base.bottom, supplement.bottom),
  };
};

const hasEffectExtent = (extent: EffectExtent | undefined): extent is EffectExtent => {
  return !!extent && (extent.left > 0 || extent.top > 0 || extent.right > 0 || extent.bottom > 0);
};

const getCenteredStrokeHalfExtent = (attrs: Record<string, unknown>): number => {
  if (!('fillColor' in attrs)) return 0;
  if ('lineEnds' in attrs && attrs.lineEnds) return 0;
  if (attrs.strokeColor === null) return 0;

  const strokeWidth = pickNumber(attrs.strokeWidth) ?? 1;
  return strokeWidth > 0 ? strokeWidth / 2 : 0;
};

const getShapeGroupChildStrokeExtent = (child: ShapeGroupChild): number => {
  if (child.shapeType !== 'vectorShape' || !isPlainObject(child.attrs)) return 0;
  return getCenteredStrokeHalfExtent(child.attrs);
};

const getOuterShadowPaintExtent = (attrs: Record<string, unknown>): EffectExtent | undefined => {
  if ('lineEnds' in attrs && attrs.lineEnds) return undefined;

  const shadow = normalizeShapeEffects(attrs.effects)?.outerShadow;
  if (!shadow) return undefined;

  const extent = getSharedOuterShadowPaintExtent(shadow);

  return hasEffectExtent(extent) ? extent : undefined;
};

const getRequiredVectorShapeEffectExtent = (attrs: Record<string, unknown>): EffectExtent | undefined => {
  const strokeExtent = getCenteredStrokeHalfExtent(attrs);
  const strokeEffectExtent =
    strokeExtent > 0
      ? {
          left: strokeExtent,
          top: strokeExtent,
          right: strokeExtent,
          bottom: strokeExtent,
        }
      : undefined;

  return mergeEffectExtents(strokeEffectExtent, getOuterShadowPaintExtent(attrs));
};

const getRequiredGroupEffectExtentFromChildren = (
  children: ShapeGroupChild[],
  width: number,
  height: number,
): EffectExtent | undefined => {
  const required: EffectExtent = { left: 0, top: 0, right: 0, bottom: 0 };

  for (const child of children) {
    if (child.shapeType !== 'vectorShape' || !isPlainObject(child.attrs)) continue;

    const strokeExtent = getShapeGroupChildStrokeExtent(child);
    const strokeEffectExtent =
      strokeExtent > 0
        ? {
            left: strokeExtent,
            top: strokeExtent,
            right: strokeExtent,
            bottom: strokeExtent,
          }
        : undefined;
    const paintExtent = mergeEffectExtents(strokeEffectExtent, getOuterShadowPaintExtent(child.attrs));
    if (!paintExtent) continue;

    const childX = pickNumber(child.attrs.x) ?? 0;
    const childY = pickNumber(child.attrs.y) ?? 0;
    const childWidth = pickNumber(child.attrs.width) ?? 0;
    const childHeight = pickNumber(child.attrs.height) ?? 0;

    required.left = Math.max(required.left, Math.max(0, paintExtent.left - childX));
    required.top = Math.max(required.top, Math.max(0, paintExtent.top - childY));
    required.right = Math.max(required.right, Math.max(0, childX + childWidth + paintExtent.right - width));
    required.bottom = Math.max(required.bottom, Math.max(0, childY + childHeight + paintExtent.bottom - height));
  }

  return hasEffectExtent(required) ? required : undefined;
};

/**
 * Convert a ProseMirror vectorShape node to a DrawingBlock
 *
 * @param node - Vector shape node to convert
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @returns DrawingBlock or null if conversion fails
 */
export function vectorShapeNodeToDrawingBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
): DrawingBlock | null {
  const rawAttrs = getAttrs(node);
  if (isHiddenDrawing(rawAttrs)) {
    return null;
  }
  const effectExtent = mergeEffectExtents(
    normalizeEffectExtent(rawAttrs.effectExtent),
    getRequiredVectorShapeEffectExtent(rawAttrs),
  );
  const baseWidth = coercePositiveNumber(rawAttrs.width, 1);
  const baseHeight = coercePositiveNumber(rawAttrs.height, 1);
  const extraWidth = (effectExtent?.left ?? 0) + (effectExtent?.right ?? 0);
  const extraHeight = (effectExtent?.top ?? 0) + (effectExtent?.bottom ?? 0);
  const geometry: ShapeDrawingGeometry = {
    width: coercePositiveNumber(baseWidth + extraWidth, 1),
    height: coercePositiveNumber(baseHeight + extraHeight, 1),
    rotation: coerceNumber(rawAttrs.rotation) ?? 0,
    flipH: coerceBoolean(rawAttrs.flipH) ?? false,
    flipV: coerceBoolean(rawAttrs.flipV) ?? false,
  };

  const lineEnds = normalizeLineEnds(rawAttrs.lineEnds);
  return buildDrawingBlock(rawAttrs, nextBlockId, positions, node, geometry, 'vectorShape', {
    lineEnds,
    effectExtent,
  });
}

/**
 * Convert a ProseMirror shapeGroup node to a DrawingBlock
 *
 * @param node - Shape group node to convert
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @returns DrawingBlock or null if conversion fails
 */
export function shapeGroupNodeToDrawingBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
): DrawingBlock | null {
  const rawAttrs = getAttrs(node);
  if (isHiddenDrawing(rawAttrs)) {
    return null;
  }
  const groupTransform = isShapeGroupTransform(rawAttrs.groupTransform) ? { ...rawAttrs.groupTransform } : undefined;
  const size = normalizeShapeSize(rawAttrs.size);
  const width = size?.width ?? groupTransform?.width ?? 1;
  const height = size?.height ?? groupTransform?.height ?? 1;
  const childCoordinateWidth = groupTransform?.width ?? width;
  const childCoordinateHeight = groupTransform?.height ?? height;
  const shapes = normalizeShapeGroupChildren(rawAttrs.shapes);
  const effectExtent = mergeEffectExtents(
    normalizeEffectExtent(rawAttrs.effectExtent),
    getRequiredGroupEffectExtentFromChildren(shapes, childCoordinateWidth, childCoordinateHeight),
  );
  const extraWidth = (effectExtent?.left ?? 0) + (effectExtent?.right ?? 0);
  const extraHeight = (effectExtent?.top ?? 0) + (effectExtent?.bottom ?? 0);

  const geometry: ShapeDrawingGeometry = {
    width: coercePositiveNumber(width + extraWidth, 1),
    height: coercePositiveNumber(height + extraHeight, 1),
    rotation: coerceNumber(rawAttrs.rotation) ?? 0,
    flipH: coerceBoolean(rawAttrs.flipH) ?? false,
    flipV: coerceBoolean(rawAttrs.flipV) ?? false,
  };

  return buildDrawingBlock(rawAttrs, nextBlockId, positions, node, geometry, 'shapeGroup', {
    groupTransform,
    shapes,
    size,
    effectExtent,
  });
}

/**
 * Convert a ProseMirror shapeContainer node to a DrawingBlock
 *
 * @param node - Shape container node to convert
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @returns DrawingBlock or null if conversion fails
 */
export function shapeContainerNodeToDrawingBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
): DrawingBlock | null {
  const rawAttrs = getAttrs(node);
  if (isHiddenDrawing(rawAttrs)) {
    return null;
  }
  const geometry: ShapeDrawingGeometry = {
    width: coercePositiveNumber(rawAttrs.width, 1),
    height: coercePositiveNumber(rawAttrs.height, 1),
    rotation: coerceNumber(rawAttrs.rotation) ?? 0,
    flipH: coerceBoolean(rawAttrs.flipH) ?? false,
    flipV: coerceBoolean(rawAttrs.flipV) ?? false,
  };

  const shapeTextboxNode = resolveNestedShapeTextboxNode(node);
  const textboxAttrs = shapeTextboxNode ? getAttrs(shapeTextboxNode) : {};
  const textContent = shapeTextboxNode ? extractTextboxTextContent(shapeTextboxNode) : undefined;

  return buildDrawingBlock(
    {
      ...rawAttrs,
      ...(textContent ? { textContent } : {}),
      ...(rawAttrs.textAlign == null && textContent?.horizontalAlign ? { textAlign: textContent.horizontalAlign } : {}),
      ...(rawAttrs.textInsets == null ? { textInsets: resolveTextboxInsetsFromAttrs(textboxAttrs) } : {}),
      ...(rawAttrs.textVerticalAlign == null
        ? { textVerticalAlign: resolveTextboxVerticalAlignFromAttrs(textboxAttrs) }
        : {}),
    },
    nextBlockId,
    positions,
    node,
    geometry,
    'textboxShape',
    {
      contentBlocks: [],
    },
  );
}

/**
 * Convert a ProseMirror shapeTextbox node to a DrawingBlock
 *
 * @param node - Shape textbox node to convert
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @returns DrawingBlock or null if conversion fails
 */
export function shapeTextboxNodeToDrawingBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
): DrawingBlock | null {
  const rawAttrs = getAttrs(node);
  if (isHiddenDrawing(rawAttrs)) {
    return null;
  }
  const geometry: ShapeDrawingGeometry = {
    width: coercePositiveNumber(rawAttrs.width, 1),
    height: coercePositiveNumber(rawAttrs.height, 1),
    rotation: coerceNumber(rawAttrs.rotation) ?? 0,
    flipH: coerceBoolean(rawAttrs.flipH) ?? false,
    flipV: coerceBoolean(rawAttrs.flipV) ?? false,
  };

  const textContent = extractTextboxTextContent(node);

  return buildDrawingBlock(
    {
      ...rawAttrs,
      ...(textContent ? { textContent } : {}),
      ...(rawAttrs.textAlign == null && textContent?.horizontalAlign ? { textAlign: textContent.horizontalAlign } : {}),
      ...(rawAttrs.textInsets == null ? { textInsets: resolveTextboxInsetsFromAttrs(rawAttrs) } : {}),
      ...(rawAttrs.textVerticalAlign == null
        ? { textVerticalAlign: resolveTextboxVerticalAlignFromAttrs(rawAttrs) }
        : {}),
    },
    nextBlockId,
    positions,
    node,
    geometry,
    'textboxShape',
    {
      contentBlocks: [],
    },
  );
}

// ============================================================================
// Shape Handler Functions
// ============================================================================

/**
 * Handle vector shape nodes.
 * Converts vector shape node to drawing block.
 *
 * @param node - Vector shape node to process
 * @param context - Shared handler context
 */
export function handleVectorShapeNode(node: PMNode, context: NodeHandlerContext): void {
  const { blocks, recordBlockKind, nextBlockId, positions } = context;

  const drawingBlock = vectorShapeNodeToDrawingBlock(node, nextBlockId, positions);
  if (drawingBlock) {
    blocks.push(drawingBlock);
    recordBlockKind?.(drawingBlock.kind);
  }
}

/**
 * Handle shape group nodes.
 * Converts shape group node to drawing block.
 *
 * @param node - Shape group node to process
 * @param context - Shared handler context
 */
export function handleShapeGroupNode(node: PMNode, context: NodeHandlerContext): void {
  const { blocks, recordBlockKind, nextBlockId, positions } = context;

  const drawingBlock = shapeGroupNodeToDrawingBlock(node, nextBlockId, positions);
  if (drawingBlock) {
    blocks.push(drawingBlock);
    recordBlockKind?.(drawingBlock.kind);
  }
}

/**
 * Handle shape container nodes.
 * Converts shape container node to drawing block.
 *
 * @param node - Shape container node to process
 * @param context - Shared handler context
 */
export function handleShapeContainerNode(node: PMNode, context: NodeHandlerContext): void {
  const { blocks, recordBlockKind, nextBlockId, positions } = context;

  const drawingBlock = shapeContainerNodeToDrawingBlock(node, nextBlockId, positions);
  if (drawingBlock) {
    blocks.push(hydrateTextboxDrawingContent(node, drawingBlock, context));
    recordBlockKind?.(drawingBlock.kind);
  }
}

/**
 * Handle shape textbox nodes.
 * Converts shape textbox node to drawing block.
 *
 * @param node - Shape textbox node to process
 * @param context - Shared handler context
 */
export function handleShapeTextboxNode(node: PMNode, context: NodeHandlerContext): void {
  const { blocks, recordBlockKind, nextBlockId, positions } = context;

  const drawingBlock = shapeTextboxNodeToDrawingBlock(node, nextBlockId, positions);
  if (drawingBlock) {
    blocks.push(hydrateTextboxDrawingContent(node, drawingBlock, context));
    recordBlockKind?.(drawingBlock.kind);
  }
}
