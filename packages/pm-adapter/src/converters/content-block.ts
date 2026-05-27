/**
 * Content Block Converter
 *
 * Converts contentBlock nodes that represent horizontal rules into DrawingBlocks
 * so the layout engine can measure and render them.
 */

import type { DrawingBlock, DrawingGeometry } from '@superdoc/contracts';
import type { PMNode, BlockIdGenerator, PositionMap } from '../types.js';
import { isPlainObject, pickNumber } from '../utilities.js';
import { buildDrawingBlock } from './shapes.js';

type ContentBlockSize = {
  width?: unknown;
  height?: unknown;
};

const getAttrs = (node: PMNode): Record<string, unknown> => {
  return isPlainObject(node.attrs) ? { ...node.attrs } : {};
};

const parseFullWidth = (value: unknown): { width: number | null; isFullWidth: boolean } => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.endsWith('%')) {
      return { width: trimmed === '100%' ? 1 : null, isFullWidth: trimmed === '100%' };
    }
    return { width: pickNumber(trimmed) ?? null, isFullWidth: false };
  }
  return { width: pickNumber(value) ?? null, isFullWidth: false };
};

/**
 * Convert a contentBlock node into a DrawingBlock when it represents a horizontal rule.
 */
export function contentBlockNodeToDrawingBlock(
  node: PMNode,
  nextBlockId: BlockIdGenerator,
  positions: PositionMap,
): DrawingBlock | null {
  const rawAttrs = getAttrs(node);
  const indentLeft = pickNumber(rawAttrs.hrIndentLeft);
  const indentRight = pickNumber(rawAttrs.hrIndentRight);
  if (rawAttrs.horizontalRule !== true) {
    return null;
  }

  const size = isPlainObject(rawAttrs.size) ? (rawAttrs.size as ContentBlockSize) : undefined;
  const { width, isFullWidth } = parseFullWidth(size?.width);
  const height = pickNumber(size?.height);

  if (!height || height <= 0) {
    return null;
  }

  if (!isFullWidth && (!width || width <= 0)) {
    return null;
  }

  if (isFullWidth) {
    rawAttrs.isFullWidth = true;
  }

  if (indentLeft != null || indentRight != null) {
    rawAttrs.hrIndentLeft = indentLeft;
    rawAttrs.hrIndentRight = indentRight;
  }

  if (typeof rawAttrs.background === 'string' && rawAttrs.background.trim()) {
    rawAttrs.fillColor = rawAttrs.background;
  }

  const geometry: DrawingGeometry = {
    width: isFullWidth ? 1 : (width ?? 1),
    height,
    rotation: 0,
    flipH: false,
    flipV: false,
  };

  return buildDrawingBlock(rawAttrs, nextBlockId, positions, node, geometry, 'vectorShape', {
    strokeColor: null,
  });
}
