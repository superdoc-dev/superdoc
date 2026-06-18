/**
 * Image Node Converter
 *
 * Handles conversion of ProseMirror image nodes to ImageBlocks
 */

import type { ImageBlock, BoxSpacing, SourceAnchor } from '@superdoc/contracts';
import type { PMNode, BlockIdGenerator, PositionMap, NodeHandlerContext, TrackedChangesConfig } from '../types.js';
import { collectTrackedChangeFromMarks } from '../marks/index.js';
import { shouldHideTrackedNode, annotateBlockWithTrackedChange } from '../tracked-changes.js';
import {
  isFiniteNumber,
  pickNumber,
  readImageHyperlink,
  mergeWrapDistancesFromPadding,
  toBoolean,
} from '../utilities.js';
import { normalizeGraphicPlacement } from '../graphic-placement.js';

// ============================================================================
// Constants
// ============================================================================

const WRAP_TYPES = new Set(['None', 'Square', 'Tight', 'Through', 'TopAndBottom', 'Inline']);
const WRAP_TEXT_VALUES = new Set(['bothSides', 'left', 'right', 'largest']);
// ============================================================================
// Helper Functions - Type Checking
// ============================================================================

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sourceAnchorFromAttrs = (attrs: Record<string, unknown>): SourceAnchor | undefined => {
  const sourceAnchor = attrs.sourceAnchor;
  return isPlainObject(sourceAnchor) ? (sourceAnchor as SourceAnchor) : undefined;
};

const isAllowedObjectFit = (value?: string): value is 'contain' | 'cover' | 'fill' | 'scale-down' => {
  return value === 'contain' || value === 'cover' || value === 'fill' || value === 'scale-down';
};

const isHiddenDrawing = (attrs: Record<string, unknown>): boolean => {
  if (toBoolean(attrs.hidden) === true) return true;
  return typeof attrs.visibility === 'string' && attrs.visibility.toLowerCase() === 'hidden';
};

// ============================================================================
// Helper Functions - Box & Spacing
// ============================================================================

function toBoxSpacing(spacing?: Record<string, unknown>): BoxSpacing | undefined {
  if (!spacing) {
    return undefined;
  }

  const result: BoxSpacing = {};
  (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
    const value = spacing[side];
    if (isFiniteNumber(value)) {
      result[side] = Number(value);
    }
  });

  return Object.keys(result).length > 0 ? result : undefined;
}

// ============================================================================
// Helper Functions - Wrap & Anchor Normalization
// ============================================================================

const normalizeWrapType = (value: unknown): NonNullable<ImageBlock['wrap']>['type'] | undefined => {
  if (typeof value !== 'string') return undefined;
  return WRAP_TYPES.has(value) ? (value as NonNullable<ImageBlock['wrap']>['type']) : undefined;
};

const normalizeWrapText = (value: unknown): NonNullable<ImageBlock['wrap']>['wrapText'] | undefined => {
  if (typeof value !== 'string') return undefined;
  return WRAP_TEXT_VALUES.has(value) ? (value as NonNullable<ImageBlock['wrap']>['wrapText']) : undefined;
};

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

const normalizeWrap = (value: unknown): ImageBlock['wrap'] | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const type = normalizeWrapType(value.type);
  if (!type) {
    return undefined;
  }

  // FIXED: For inline images, still return wrap data but mark it as Inline type
  // This preserves spacing attributes (distT/distB/distL/distR) for inline images
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

// ============================================================================
// Image Converter Function
// ============================================================================

/**
 * Convert a ProseMirror image node to an ImageBlock
 *
 * @param node - Image node to convert
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @param _trackedMeta - Optional tracked change metadata (unused)
 * @param _trackedChanges - Optional tracked changes config (unused)
 * @returns ImageBlock or null if conversion fails
 */
export function imageNodeToBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
  _trackedMeta?: unknown,
  _trackedChanges?: TrackedChangesConfig,
): ImageBlock | null {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (isHiddenDrawing(attrs)) {
    return null;
  }
  if (!attrs.src || typeof attrs.src !== 'string') {
    return null;
  }

  const pos = positions.get(node);
  const attrsWithPm: Record<string, unknown> = { ...attrs };
  if (pos) {
    attrsWithPm.pmStart = pos.start;
    attrsWithPm.pmEnd = pos.end;
  }

  const size = (attrs.size ?? {}) as { width?: number; height?: number };
  const width = typeof size.width === 'number' && Number.isFinite(size.width) ? size.width : undefined;
  const height = typeof size.height === 'number' && Number.isFinite(size.height) ? size.height : undefined;

  const explicitDisplay = typeof attrs.display === 'string' ? (attrs.display as string) : undefined;
  const normalizedWrap = normalizeWrap(attrs.wrap);
  if (normalizedWrap) {
    mergeWrapDistancesFromPadding(normalizedWrap, toBoxSpacing(attrs.padding as Record<string, unknown> | undefined));
  }
  const placement = normalizeGraphicPlacement({
    anchorData: attrs.anchorData,
    attrs,
    wrapBehindDoc: normalizedWrap?.behindDoc,
    forceAnchor: Boolean(normalizedWrap),
  });
  const anchor = placement.anchor;
  const isInline = normalizedWrap?.type === 'Inline' || (typeof attrs.inline === 'boolean' && attrs.inline);
  const display: 'inline' | 'block' =
    explicitDisplay === 'inline' || explicitDisplay === 'block' ? explicitDisplay : isInline ? 'inline' : 'block';

  const explicitObjectFit = typeof attrs.objectFit === 'string' ? (attrs.objectFit as string) : undefined;
  const shouldCover = attrs.shouldCover === true;
  const isAnchor = anchor?.isAnchored ?? (typeof attrs.isAnchor === 'boolean' ? attrs.isAnchor : false);
  const lum = isPlainObject(attrs.lum) ? attrs.lum : undefined;
  const lumBright = pickNumber(lum?.bright);
  const lumContrast = pickNumber(lum?.contrast);
  const alphaModFix = isPlainObject(attrs.alphaModFix) ? attrs.alphaModFix : undefined;
  const alphaModFixAmt = pickNumber(alphaModFix?.amt);

  const objectFit: 'contain' | 'cover' | 'fill' | 'scale-down' | undefined = isAllowedObjectFit(explicitObjectFit)
    ? explicitObjectFit
    : shouldCover
      ? 'cover'
      : display === 'inline'
        ? 'scale-down'
        : isAnchor
          ? 'contain'
          : 'contain';

  const zIndex = placement.zIndex;

  // Extract rotation/flip transforms from transformData
  const transformData = isPlainObject(attrs.transformData) ? attrs.transformData : undefined;
  const rotation = typeof transformData?.rotation === 'number' ? transformData.rotation : undefined;
  const flipH = typeof transformData?.horizontalFlip === 'boolean' ? transformData.horizontalFlip : undefined;
  const flipV = typeof transformData?.verticalFlip === 'boolean' ? transformData.verticalFlip : undefined;
  const hyperlink = readImageHyperlink(attrs.hyperlink);
  return {
    kind: 'image',
    id: nextBlockId('image'),
    src: attrs.src,
    width,
    height,
    alt: typeof attrs.alt === 'string' ? attrs.alt : undefined,
    title: typeof attrs.title === 'string' ? attrs.title : undefined,
    objectFit,
    display,
    padding: toBoxSpacing(attrs.padding as Record<string, unknown> | undefined),
    margin: toBoxSpacing(attrs.marginOffset as Record<string, unknown> | undefined),
    anchor,
    wrap: normalizedWrap,
    ...(zIndex !== undefined && { zIndex }),
    attrs: attrsWithPm,
    // VML image adjustments for watermark effects
    gain: typeof attrs.gain === 'string' || typeof attrs.gain === 'number' ? attrs.gain : undefined,
    blacklevel:
      typeof attrs.blacklevel === 'string' || typeof attrs.blacklevel === 'number' ? attrs.blacklevel : undefined,
    // OOXML image effects (grayscale, etc.)
    grayscale: typeof attrs.grayscale === 'boolean' ? attrs.grayscale : undefined,
    lum:
      lumBright != null || lumContrast != null
        ? {
            ...(lumBright != null ? { bright: lumBright } : {}),
            ...(lumContrast != null ? { contrast: lumContrast } : {}),
          }
        : undefined,
    alphaModFix: alphaModFixAmt != null ? { amt: alphaModFixAmt } : undefined,
    // Image transformations from OOXML a:xfrm
    ...(rotation !== undefined && { rotation }),
    ...(flipH !== undefined && { flipH }),
    ...(flipV !== undefined && { flipV }),
    ...(hyperlink ? { hyperlink } : {}),
    sourceAnchor: sourceAnchorFromAttrs(attrs),
  };
}

// ============================================================================
// Image Handler Function
// ============================================================================

/**
 * Handle image nodes.
 * Converts image node to image block with tracked change support.
 *
 * @param node - Image node to process
 * @param context - Shared handler context
 */
export function handleImageNode(node: PMNode, context: NodeHandlerContext): ImageBlock | void {
  const { blocks, recordBlockKind, nextBlockId, positions, trackedChangesConfig } = context;

  const trackedMeta = trackedChangesConfig.enabled
    ? collectTrackedChangeFromMarks(node.marks ?? [], context.storyKey)
    : undefined;
  if (shouldHideTrackedNode(trackedMeta, trackedChangesConfig)) {
    return;
  }
  const imageBlock = imageNodeToBlock(node, nextBlockId, positions, trackedMeta, trackedChangesConfig);
  if (imageBlock && imageBlock.kind === 'image') {
    annotateBlockWithTrackedChange(imageBlock, trackedMeta, trackedChangesConfig);
    blocks.push(imageBlock);
    recordBlockKind?.(imageBlock.kind);
    return imageBlock;
  }
}
