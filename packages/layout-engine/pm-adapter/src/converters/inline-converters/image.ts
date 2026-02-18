import type { ImageRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { pickNumber, isPlainObject } from '../../utilities.js';
import { type InlineConverterParams, NotInlineNodeError } from './common.js';

/**
 * Default dimension (in pixels) for images when size information is missing or invalid.
 * This ensures images are always rendered with a fallback size for better UX.
 */
const DEFAULT_IMAGE_DIMENSION_PX = 100;

/**
 * Converts an image PM node to an ImageRun for inline rendering.
 *
 * Extracts all necessary properties from the node including:
 * - Image source and dimensions (from attrs.size, NOT attrs.width/height)
 * - Spacing attributes (distT/distB/distL/distR from wrap.attrs)
 * - Position tracking (pmStart/pmEnd)
 * - SDT metadata if present
 *
 * IMPORTANT: Dimensions are read from attrs.size, NOT from attrs.width/height.
 * This is because Word documents store image dimensions in a nested size object.
 *
 * ERROR CONDITIONS:
 * - Returns null if node.attrs.src is missing or empty
 * - Falls back to DEFAULT_IMAGE_DIMENSION_PX for invalid/missing dimensions
 *
 * @param node - Image PM node containing image metadata in attrs
 * @param positions - Position map for ProseMirror node tracking (pmStart/pmEnd)
 * @param activeSdt - Optional active SDT metadata to attach to the ImageRun
 * @returns ImageRun object with all extracted properties, or null if src is missing
 *
 * @example
 * ```typescript
 * // Successful conversion with all properties
 * imageNodeToRun(
 *   {
 *     type: 'image',
 *     attrs: {
 *       src: 'data:image/png;base64,iVBORw...',
 *       size: { width: 200, height: 150 },
 *       alt: 'Company logo',
 *       wrap: { attrs: { distTop: 10, distBottom: 10 } }
 *     }
 *   },
 *   positionMap
 * )
 * // Returns: { kind: 'image', src: 'data:...', width: 200, height: 150, alt: 'Company logo', distTop: 10, distBottom: 10, verticalAlign: 'bottom' }
 *
 * // Missing src - returns null
 * imageNodeToRun({ type: 'image', attrs: {} }, positionMap)
 * // Returns: null
 *
 * // Invalid dimensions - uses defaults
 * imageNodeToRun(
 *   { type: 'image', attrs: { src: 'image.png', size: { width: NaN, height: -10 } } },
 *   positionMap
 * )
 * // Returns: { kind: 'image', src: 'image.png', width: 100, height: 100, verticalAlign: 'bottom' }
 * ```
 */
export function imageNodeToRun({ node, positions, sdtMetadata }: InlineConverterParams): ImageRun | null {
  if (isNodeHidden(node)) {
    return null;
  }

  const isInline = isInlineImage(node);
  if (!isInline) {
    throw new NotInlineNodeError();
  }
  const attrs = node.attrs ?? {};

  // Extract src (required)
  const src = typeof attrs.src === 'string' ? attrs.src : '';
  if (!src) {
    return null;
  }

  // Extract dimensions from attrs.size (NOT attrs.width/height!)
  const size = (attrs.size ?? {}) as { width?: number; height?: number };
  const width =
    typeof size.width === 'number' && Number.isFinite(size.width) && size.width > 0
      ? size.width
      : DEFAULT_IMAGE_DIMENSION_PX;
  const height =
    typeof size.height === 'number' && Number.isFinite(size.height) && size.height > 0
      ? size.height
      : DEFAULT_IMAGE_DIMENSION_PX;

  // Extract spacing from RAW wrap.attrs (before normalization discards it)
  const wrap = isPlainObject(attrs.wrap) ? attrs.wrap : {};
  const wrapAttrs = isPlainObject(wrap.attrs) ? wrap.attrs : {};

  const run: ImageRun = {
    kind: 'image',
    src,
    width,
    height,
  };

  // Optional properties
  if (typeof attrs.alt === 'string') run.alt = attrs.alt;
  if (typeof attrs.title === 'string') run.title = attrs.title;

  // Spacing attributes (from wrap.attrs.distT/distB/distL/distR)
  const distTop = pickNumber(wrapAttrs.distTop ?? wrapAttrs.distT);
  if (distTop != null) run.distTop = distTop;

  const distBottom = pickNumber(wrapAttrs.distBottom ?? wrapAttrs.distB);
  if (distBottom != null) run.distBottom = distBottom;

  const distLeft = pickNumber(wrapAttrs.distLeft ?? wrapAttrs.distL);
  if (distLeft != null) run.distLeft = distLeft;

  const distRight = pickNumber(wrapAttrs.distRight ?? wrapAttrs.distR);
  if (distRight != null) run.distRight = distRight;

  // Default vertical alignment to bottom (text baseline alignment)
  run.verticalAlign = 'bottom';

  // Position tracking
  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  // SDT metadata
  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  return run;
}

const isNodeHidden = (node: PMNode): boolean => {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (attrs.hidden === true) return true;
  return typeof attrs.visibility === 'string' && attrs.visibility.toLowerCase() === 'hidden';
};

/**
 * Detects if an image node should be rendered inline (as ImageRun) vs. as a separate block (ImageBlock).
 *
 * CRITICAL: Must check RAW attributes BEFORE normalization, because normalizeWrap() would discard
 * the wrap.type === 'Inline' information.
 *
 * Priority order (highest to lowest):
 * 1. wrap.type === 'Inline' - Authoritative signal for inline rendering
 * 2. wrap.type !== 'Inline' - Any other wrap type (Tight, Square, etc.) means block-level
 * 3. attrs.inline === true - Legacy fallback for inline detection
 * 4. attrs.display === 'inline' - Additional fallback for inline detection
 * 5. Default: false (treat as block-level image)
 *
 * @param node - Image node to check for inline rendering indicators
 * @returns true if image should be rendered inline (as ImageRun), false for block-level (as ImageBlock)
 *
 * @example
 * ```typescript
 * // Inline image (explicit wrap type)
 * isInlineImage({ type: 'image', attrs: { wrap: { type: 'Inline' } } })
 * // Returns: true
 *
 * // Block image (anchored wrap type)
 * isInlineImage({ type: 'image', attrs: { wrap: { type: 'Tight' } } })
 * // Returns: false
 *
 * // Inline image (legacy attribute)
 * isInlineImage({ type: 'image', attrs: { inline: true } })
 * // Returns: true
 *
 * // Block image (default behavior)
 * isInlineImage({ type: 'image', attrs: {} })
 * // Returns: false
 * ```
 */
export function isInlineImage(node: PMNode): boolean {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;

  // Check raw wrap type BEFORE normalization (highest priority)
  // This is the authoritative source for how the image should be rendered
  const wrap = attrs.wrap as Record<string, unknown> | undefined;
  const rawWrapType = wrap?.type;

  // If wrap type is explicitly 'Inline', treat as inline
  if (rawWrapType === 'Inline') {
    return true;
  }

  // If wrap type is any OTHER value (Tight, Square, None, etc.), treat as block
  // This takes precedence over the legacy `inline` attribute
  if (rawWrapType && rawWrapType !== 'Inline') {
    return false;
  }

  // Fallback checks for other inline indicators (only when wrap type is not specified)
  if (attrs.inline === true) {
    return true;
  }

  if (attrs.display === 'inline') {
    return true;
  }

  return false;
}
