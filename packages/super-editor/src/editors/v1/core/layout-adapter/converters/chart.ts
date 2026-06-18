/**
 * Chart Node Converter
 *
 * Converts ProseMirror chart nodes to DrawingBlocks with drawingKind: 'chart'.
 */

import type { ChartDrawing, DrawingGeometry, BoxSpacing, SourceAnchor } from '@superdoc/contracts';
import type { PMNode, NodeHandlerContext, BlockIdGenerator, PositionMap } from '../types.js';
import {
  pickNumber,
  isPlainObject,
  coercePositiveNumber,
  toBoolean,
  toBoxSpacing,
  toDrawingContentSnapshot,
} from '../utilities.js';
import { normalizeGraphicPlacement } from '../graphic-placement.js';

// ============================================================================
// Constants
// ============================================================================

const WRAP_TYPES = new Set(['None', 'Square', 'Tight', 'Through', 'TopAndBottom', 'Inline']);
const WRAP_TEXT_VALUES = new Set(['bothSides', 'left', 'right', 'largest']);
// ============================================================================
// Helpers
// ============================================================================

const getAttrs = (node: PMNode): Record<string, unknown> => {
  return isPlainObject(node.attrs) ? (node.attrs as Record<string, unknown>) : {};
};

const normalizeWrap = (value: unknown): ChartDrawing['wrap'] | undefined => {
  if (!isPlainObject(value)) return undefined;
  const type = typeof value.type === 'string' && WRAP_TYPES.has(value.type) ? value.type : undefined;
  if (!type || type === 'Inline') return undefined;

  const wrap: NonNullable<ChartDrawing['wrap']> = { type: type as NonNullable<ChartDrawing['wrap']>['type'] };
  const attrs = isPlainObject(value.attrs) ? value.attrs : {};

  const wrapText =
    typeof attrs.wrapText === 'string' && WRAP_TEXT_VALUES.has(attrs.wrapText) ? attrs.wrapText : undefined;
  if (wrapText) wrap.wrapText = wrapText as NonNullable<ChartDrawing['wrap']>['wrapText'];

  const distTop = pickNumber(attrs.distTop ?? attrs.distT);
  if (distTop != null) wrap.distTop = distTop;
  const distBottom = pickNumber(attrs.distBottom ?? attrs.distB);
  if (distBottom != null) wrap.distBottom = distBottom;
  const distLeft = pickNumber(attrs.distLeft ?? attrs.distL);
  if (distLeft != null) wrap.distLeft = distLeft;
  const distRight = pickNumber(attrs.distRight ?? attrs.distR);
  if (distRight != null) wrap.distRight = distRight;

  const behindDoc = toBoolean(attrs.behindDoc);
  if (behindDoc != null) wrap.behindDoc = behindDoc;

  return wrap;
};

// ============================================================================
// Chart Converter
// ============================================================================

/**
 * Sentinel ChartModel emitted when chart XML is unparseable.
 * Ensures the chart node always produces a DrawingBlock (never silently dropped),
 * so the renderer shows a placeholder instead of a missing box.
 */
const EMPTY_CHART_DATA: ChartDrawing['chartData'] = {
  chartType: 'unknown',
  series: [],
};

/**
 * Convert a ProseMirror chart node to a ChartDrawing DrawingBlock.
 *
 * Always produces a block — even when chartData is null (unparseable chart XML).
 * The renderer handles the empty-data case by showing a placeholder.
 */
export function chartNodeToDrawingBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
): ChartDrawing {
  const rawAttrs = getAttrs(node);
  const chartData =
    rawAttrs.chartData && typeof rawAttrs.chartData === 'object'
      ? (rawAttrs.chartData as ChartDrawing['chartData'])
      : EMPTY_CHART_DATA;

  const width = coercePositiveNumber(rawAttrs.width, 400);
  const height = coercePositiveNumber(rawAttrs.height, 300);

  const geometry: DrawingGeometry = {
    width,
    height,
    rotation: 0,
    flipH: false,
    flipV: false,
  };

  const normalizedWrap = normalizeWrap(rawAttrs.wrap);
  const sourceAnchor = isPlainObject(rawAttrs.sourceAnchor) ? (rawAttrs.sourceAnchor as SourceAnchor) : undefined;
  const placement = normalizeGraphicPlacement({
    anchorData: rawAttrs.anchorData,
    attrs: rawAttrs,
    wrapBehindDoc: normalizedWrap?.behindDoc,
    fallbackZIndex: 1,
  });
  const anchor = placement.anchor;

  const pos = positions.get(node);
  const attrsWithPm: Record<string, unknown> = { ...rawAttrs };
  if (pos) {
    attrsWithPm.pmStart = pos.start;
    attrsWithPm.pmEnd = pos.end;
  }

  return {
    kind: 'drawing',
    id: nextBlockId('drawing'),
    drawingKind: 'chart',
    geometry,
    chartData,
    chartRelId: typeof rawAttrs.chartRelId === 'string' ? rawAttrs.chartRelId : undefined,
    chartPartPath: typeof rawAttrs.chartPartPath === 'string' ? rawAttrs.chartPartPath : undefined,
    padding: toBoxSpacing(rawAttrs.padding as Record<string, unknown> | undefined),
    margin: toBoxSpacing(rawAttrs.marginOffset as Record<string, unknown> | undefined),
    anchor,
    wrap: normalizedWrap,
    zIndex: placement.zIndex,
    drawingContentId: typeof rawAttrs.drawingContentId === 'string' ? rawAttrs.drawingContentId : undefined,
    drawingContent: toDrawingContentSnapshot(rawAttrs.drawingContent),
    attrs: attrsWithPm,
    sourceAnchor,
  };
}

/**
 * Handle chart nodes in the PM adapter conversion.
 */
export function handleChartNode(node: PMNode, context: NodeHandlerContext): void {
  const { blocks, recordBlockKind, nextBlockId, positions } = context;

  const drawingBlock = chartNodeToDrawingBlock(node, nextBlockId, positions);
  blocks.push(drawingBlock);
  recordBlockKind?.(drawingBlock.kind);
}
