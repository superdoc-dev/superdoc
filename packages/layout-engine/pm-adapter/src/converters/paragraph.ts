/**
 * Paragraph Converter Module
 *
 * Functions for converting ProseMirror paragraph nodes to FlowBlock arrays:
 * - Paragraph to FlowBlocks conversion (main entry point)
 * - Run merging optimization
 * - Tracked changes processing
 */

import type { ParagraphProperties, RunProperties } from '@superdoc/style-engine/ooxml';
import type {
  FlowBlock,
  Run,
  TextRun,
  ImageRun,
  SdtMetadata,
  FieldAnnotationRun,
  FieldAnnotationMetadata,
} from '@superdoc/contracts';
import type { PMNode, PMMark, PositionMap, NodeHandlerContext, ParagraphToFlowBlocksParams } from '../types.js';
import type { ConverterContext } from '../converter-context.js';
import { computeParagraphAttrs, deepClone } from '../attributes/index.js';
import { resolveNodeSdtMetadata, getNodeInstruction } from '../sdt/index.js';
import { shouldRequirePageBoundary, hasIntrinsicBoundarySignals, createSectionBreakBlock } from '../sections/index.js';
import { trackedChangesCompatible, collectTrackedChangeFromMarks, applyMarksToRun } from '../marks/index.js';
import {
  shouldHideTrackedNode,
  annotateBlockWithTrackedChange,
  applyTrackedChangesModeToRuns,
} from '../tracked-changes.js';
import { textNodeToRun, tabNodeToRun, tokenNodeToRun } from './text-run.js';
import { contentBlockNodeToDrawingBlock } from './content-block.js';
import { DEFAULT_HYPERLINK_CONFIG, TOKEN_INLINE_TYPES } from '../constants.js';
import { pickNumber, isPlainObject } from '../utilities.js';
import { computeRunAttrs } from '../attributes/paragraph.js';
import { resolveRunProperties } from '@superdoc/style-engine/ooxml';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default dimension (in pixels) for images when size information is missing or invalid.
 * This ensures images are always rendered with a fallback size for better UX.
 */
const DEFAULT_IMAGE_DIMENSION_PX = 100;

// ============================================================================
// Helper functions for inline image detection and conversion
// ============================================================================

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

const isNodeHidden = (node: PMNode): boolean => {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (attrs.hidden === true) return true;
  return typeof attrs.visibility === 'string' && attrs.visibility.toLowerCase() === 'hidden';
};

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
export function imageNodeToRun(node: PMNode, positions: PositionMap, activeSdt?: SdtMetadata): ImageRun | null {
  if (isNodeHidden(node)) {
    return null;
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
  if (activeSdt) {
    run.sdt = activeSdt;
  }

  return run;
}

/**
 * Converts a ProseMirror fieldAnnotation node into a FieldAnnotationRun for layout engine rendering.
 *
 * Field annotations are inline "pill" elements that display form fields or placeholders.
 * They render with distinctive styling (border, background, rounded corners) and can
 * contain different content types (text, image, signature, etc.).
 *
 * @param node - FieldAnnotation PM node with attrs containing field configuration
 * @param positions - Position map for ProseMirror node tracking (pmStart/pmEnd)
 * @param fieldMetadata - SDT metadata extracted from the fieldAnnotation node
 * @returns FieldAnnotationRun object with all extracted properties
 */
export function fieldAnnotationNodeToRun(
  node: PMNode,
  positions: PositionMap,
  fieldMetadata?: FieldAnnotationMetadata | null,
): FieldAnnotationRun {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;

  // Determine variant (defaults to 'text')
  const rawVariant = attrs.type ?? fieldMetadata?.variant ?? 'text';
  const validVariants = ['text', 'image', 'signature', 'checkbox', 'html', 'link'] as const;
  const variant: FieldAnnotationRun['variant'] = validVariants.includes(rawVariant as (typeof validVariants)[number])
    ? (rawVariant as FieldAnnotationRun['variant'])
    : 'text';

  // Determine display label with fallback chain
  const displayLabel =
    (typeof attrs.displayLabel === 'string' ? attrs.displayLabel : undefined) ||
    (typeof attrs.defaultDisplayLabel === 'string' ? attrs.defaultDisplayLabel : undefined) ||
    (typeof fieldMetadata?.displayLabel === 'string' ? fieldMetadata.displayLabel : undefined) ||
    (typeof fieldMetadata?.defaultDisplayLabel === 'string' ? fieldMetadata.defaultDisplayLabel : undefined) ||
    (typeof attrs.alias === 'string' ? attrs.alias : undefined) ||
    (typeof fieldMetadata?.alias === 'string' ? fieldMetadata.alias : undefined) ||
    '';

  const run: FieldAnnotationRun = {
    kind: 'fieldAnnotation',
    variant,
    displayLabel,
  };

  // Field identification
  const fieldId = typeof attrs.fieldId === 'string' ? attrs.fieldId : fieldMetadata?.fieldId;
  if (fieldId) run.fieldId = fieldId;

  const fieldType = typeof attrs.fieldType === 'string' ? attrs.fieldType : fieldMetadata?.fieldType;
  if (fieldType) run.fieldType = fieldType;

  // Styling
  const fieldColor = typeof attrs.fieldColor === 'string' ? attrs.fieldColor : fieldMetadata?.fieldColor;
  if (fieldColor) run.fieldColor = fieldColor;

  const borderColor = typeof attrs.borderColor === 'string' ? attrs.borderColor : fieldMetadata?.borderColor;
  if (borderColor) run.borderColor = borderColor;

  // Highlighted defaults to true if not explicitly false
  const highlighted = attrs.highlighted ?? fieldMetadata?.highlighted;
  if (highlighted === false) run.highlighted = false;

  // Hidden/visibility
  if (attrs.hidden === true || fieldMetadata?.hidden === true) run.hidden = true;
  const visibility = attrs.visibility ?? fieldMetadata?.visibility;
  if (visibility === 'hidden') run.visibility = 'hidden';

  // Type-specific content
  const imageSrc = typeof attrs.imageSrc === 'string' ? attrs.imageSrc : fieldMetadata?.imageSrc;
  if (imageSrc) run.imageSrc = imageSrc;

  const linkUrl = typeof attrs.linkUrl === 'string' ? attrs.linkUrl : fieldMetadata?.linkUrl;
  if (linkUrl) run.linkUrl = linkUrl;

  const rawHtml = attrs.rawHtml ?? fieldMetadata?.rawHtml;
  if (typeof rawHtml === 'string') run.rawHtml = rawHtml;

  // Sizing
  const size = (attrs.size ?? fieldMetadata?.size) as { width?: number; height?: number } | null | undefined;
  if (size && (typeof size.width === 'number' || typeof size.height === 'number')) {
    run.size = {
      width: typeof size.width === 'number' ? size.width : undefined,
      height: typeof size.height === 'number' ? size.height : undefined,
    };
  }

  // Typography
  const fontFamily = attrs.fontFamily ?? fieldMetadata?.fontFamily;
  if (typeof fontFamily === 'string') run.fontFamily = fontFamily;

  const fontSize = attrs.fontSize ?? fieldMetadata?.fontSize;
  if (typeof fontSize === 'string' || typeof fontSize === 'number') run.fontSize = fontSize;

  const textColor = attrs.textColor ?? fieldMetadata?.textColor;
  if (typeof textColor === 'string') run.textColor = textColor;

  const textHighlight = attrs.textHighlight ?? fieldMetadata?.textHighlight;
  if (typeof textHighlight === 'string') run.textHighlight = textHighlight;

  // Text formatting
  const formatting = fieldMetadata?.formatting;
  if (attrs.bold === true || formatting?.bold === true) run.bold = true;
  if (attrs.italic === true || formatting?.italic === true) run.italic = true;
  if (attrs.underline === true || formatting?.underline === true) run.underline = true;

  // Position tracking
  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  // Attach full SDT metadata if available
  if (fieldMetadata) {
    run.sdt = fieldMetadata;
  }

  return run;
}

/**
 * Helper to check if a run is a text run.
 */
const isTextRun = (run: Run): run is TextRun => {
  const kind = (run as { kind?: string }).kind;
  return (kind === undefined || kind === 'text') && 'text' in run;
};

/**
 * Checks if two text runs have compatible data attributes for merging.
 * Runs are compatible if they have identical data-* attributes or both have none.
 *
 * @param a - First text run
 * @param b - Second text run
 * @returns true if data attributes are compatible for merging, false otherwise
 */
export const dataAttrsCompatible = (a: TextRun, b: TextRun): boolean => {
  const aAttrs = a.dataAttrs;
  const bAttrs = b.dataAttrs;

  // Both have no data attributes - compatible
  if (!aAttrs && !bAttrs) return true;

  // One has data attributes, the other doesn't - incompatible
  if (!aAttrs || !bAttrs) return false;

  // Both have data attributes - check if they're identical
  const aKeys = Object.keys(aAttrs).sort();
  const bKeys = Object.keys(bAttrs).sort();

  // Different number of keys - incompatible
  if (aKeys.length !== bKeys.length) return false;

  // Check all keys and values match
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i];
    if (key !== bKeys[i] || aAttrs[key] !== bAttrs[key]) {
      return false;
    }
  }

  return true;
};

export const commentsCompatible = (a: TextRun, b: TextRun): boolean => {
  const aComments = a.comments ?? [];
  const bComments = b.comments ?? [];
  if (aComments.length === 0 && bComments.length === 0) return true;
  if (aComments.length !== bComments.length) return false;

  const normalize = (c: (typeof aComments)[number]) =>
    `${c.commentId ?? ''}::${c.importedId ?? ''}::${c.internal ? '1' : '0'}`;
  const aKeys = aComments.map(normalize).sort();
  const bKeys = bComments.map(normalize).sort();

  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  return true;
};

/**
 * Merges adjacent text runs with continuous PM positions and compatible styling.
 * Optimization to reduce run fragmentation after PM operations.
 *
 * @param runs - Array of runs to merge
 * @returns Merged array of runs
 */
export function mergeAdjacentRuns(runs: Run[]): Run[] {
  if (runs.length <= 1) return runs;

  const merged: Run[] = [];
  let current = runs[0];

  for (let i = 1; i < runs.length; i++) {
    const next = runs[i];

    // Check if runs can be merged:
    // 1. Both are text runs (no tokens/special types)
    // 2. Have continuous PM positions (current.pmEnd === next.pmStart)
    // 3. Have compatible styling (same font, size, color, bold, italic, etc.)
    // 4. Have compatible data attributes
    const canMerge =
      isTextRun(current) &&
      isTextRun(next) &&
      !current.token &&
      !next.token &&
      current.pmStart != null &&
      current.pmEnd != null &&
      next.pmStart != null &&
      next.pmEnd != null &&
      current.pmEnd === next.pmStart &&
      current.fontFamily === next.fontFamily &&
      current.fontSize === next.fontSize &&
      current.bold === next.bold &&
      current.italic === next.italic &&
      current.underline === next.underline &&
      current.strike === next.strike &&
      current.color === next.color &&
      current.highlight === next.highlight &&
      (current.letterSpacing ?? 0) === (next.letterSpacing ?? 0) &&
      trackedChangesCompatible(current, next) &&
      dataAttrsCompatible(current, next) &&
      commentsCompatible(current, next);

    if (canMerge) {
      // Merge next into current
      const currText = (current as TextRun).text ?? '';
      const nextText = (next as TextRun).text ?? '';
      current = {
        ...(current as TextRun),
        text: currText + nextText,
        pmEnd: (next as TextRun).pmEnd,
      } as TextRun;
    } else {
      // Can't merge, push current and move to next
      merged.push(current);
      current = next;
    }
  }

  // Push the last run
  merged.push(current);
  return merged;
}

const applyInlineRunProperties = (
  run: TextRun,
  runProperties: RunProperties | undefined,
  converterContext?: ConverterContext,
): TextRun => {
  if (!runProperties) {
    return run;
  }
  const runAttrs = computeRunAttrs(runProperties, converterContext);
  return { ...run, ...runAttrs };
};

/**
 * Converts a paragraph PM node to an array of FlowBlocks.
 *
 * This is the main entry point for paragraph conversion. It handles:
 * - Page breaks (pageBreakBefore)
 * - Inline content (text, runs, SDTs, tokens)
 * - Block-level content (images, drawings, tables, hard breaks)
 * - Tracked changes filtering
 * - Run merging optimization
 *
 * @param para - Paragraph PM node to convert
 * @param nextBlockId - Block ID generator
 * @param positions - Position map for PM node tracking
 * @param defaultFont - Default font family
 * @param defaultSize - Default font size
 * @param styleContext - Style resolution context
 * @param trackedChanges - Optional tracked changes configuration
 * @param bookmarks - Optional bookmark position map
 * @param hyperlinkConfig - Hyperlink configuration
 * @param themeColors - Optional theme color palette for color resolution
 * @param converters - Optional converter dependencies injected to avoid circular imports
 * @param converterContext - Optional converter context with document styles
 * @param enableComments - Whether to include comment marks in the output (defaults to true). Set to false for viewing modes where comments should be hidden.
 * @returns Array of FlowBlocks (paragraphs, images, drawings, page breaks, etc.)
 */
export function paragraphToFlowBlocks({
  para,
  nextBlockId,
  positions,
  defaultFont,
  defaultSize,
  styleContext,
  trackedChangesConfig,
  bookmarks,
  hyperlinkConfig = DEFAULT_HYPERLINK_CONFIG,
  themeColors,
  converters,
  converterContext,
  enableComments = true,
}: ParagraphToFlowBlocksParams): FlowBlock[] {
  const paragraphProps =
    typeof para.attrs?.paragraphProperties === 'object' && para.attrs.paragraphProperties !== null
      ? (para.attrs.paragraphProperties as ParagraphProperties)
      : {};
  const baseBlockId = nextBlockId('paragraph');
  const { paragraphAttrs, resolvedParagraphProperties } = computeParagraphAttrs(para, converterContext);

  const blocks: FlowBlock[] = [];
  const paraAttrs = (para.attrs ?? {}) as Record<string, unknown>;
  const rawParagraphProps =
    typeof paraAttrs.paragraphProperties === 'object' && paraAttrs.paragraphProperties !== null
      ? (paraAttrs.paragraphProperties as Record<string, unknown>)
      : undefined;
  const hasSectPr = Boolean(rawParagraphProps?.sectPr);
  const isSectPrMarker = hasSectPr || paraAttrs.pageBreakSource === 'sectPr';

  if (paragraphAttrs.pageBreakBefore) {
    blocks.push({
      kind: 'pageBreak',
      id: nextBlockId('pageBreak'),
      attrs: { source: 'pageBreakBefore' },
    });
  }

  if (!para.content || para.content.length === 0) {
    if (paragraphProps.runProperties?.vanish) {
      return blocks;
    }
    // Get the PM position of the empty paragraph for caret rendering
    const paraPos = positions.get(para);
    const emptyRun: TextRun = {
      text: '',
      fontFamily: defaultFont,
      fontSize: defaultSize,
    };
    // For empty paragraphs, the cursor position is inside the paragraph (start + 1)
    // The range spans from the opening to closing position of the paragraph
    if (paraPos) {
      emptyRun.pmStart = paraPos.start + 1;
      emptyRun.pmEnd = paraPos.start + 1;
    }
    let emptyParagraphAttrs = deepClone(paragraphAttrs);
    if (isSectPrMarker) {
      if (emptyParagraphAttrs) {
        emptyParagraphAttrs.sectPrMarker = true;
      } else {
        emptyParagraphAttrs = { sectPrMarker: true };
      }
    }
    blocks.push({
      kind: 'paragraph',
      id: baseBlockId,
      runs: [emptyRun],
      attrs: deepClone(paragraphAttrs),
    });
    return blocks;
  }

  let currentRuns: Run[] = [];
  let partIndex = 0;
  let tabOrdinal = 0;
  let suppressedByVanish = false;

  const toSuperscriptDigits = (value: unknown): string => {
    const map: Record<string, string> = {
      '0': '⁰',
      '1': '¹',
      '2': '²',
      '3': '³',
      '4': '⁴',
      '5': '⁵',
      '6': '⁶',
      '7': '⁷',
      '8': '⁸',
      '9': '⁹',
    };
    return String(value ?? '')
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('');
  };

  const resolveFootnoteDisplayNumber = (id: unknown): unknown => {
    const key = id == null ? null : String(id);
    if (!key) return null;
    const mapping = converterContext?.footnoteNumberById;
    const mapped = mapping && typeof mapping === 'object' ? (mapping as Record<string, number>)[key] : undefined;
    return typeof mapped === 'number' && Number.isFinite(mapped) && mapped > 0 ? mapped : null;
  };

  const nextId = () => (partIndex === 0 ? baseBlockId : `${baseBlockId}-${partIndex}`);
  const attachAnchorParagraphId = <T extends FlowBlock>(block: T, anchorParagraphId: string): T => {
    const applicableKinds = new Set(['drawing', 'image', 'table']);
    if (!applicableKinds.has(block.kind)) {
      return block;
    }
    const blockWithAttrs = block as T & { attrs?: Record<string, unknown> };
    return {
      ...blockWithAttrs,
      attrs: {
        ...(blockWithAttrs.attrs ?? {}),
        anchorParagraphId,
      },
    };
  };

  const flushParagraph = () => {
    if (currentRuns.length === 0) {
      return;
    }
    const runs = currentRuns;
    currentRuns = [];
    blocks.push({
      kind: 'paragraph',
      id: nextId(),
      runs,
      attrs: deepClone(paragraphAttrs),
    });
    partIndex += 1;
  };

  const visitNode = (
    node: PMNode,
    inheritedMarks: PMMark[] = [],
    activeSdt?: SdtMetadata,
    activeRunProperties?: RunProperties,
    activeHidden = false,
  ) => {
    if (node.type === 'footnoteReference') {
      const mergedMarks = [...(node.marks ?? []), ...(inheritedMarks ?? [])];
      const refPos = positions.get(node);
      const id = (node.attrs as Record<string, unknown> | undefined)?.id;
      const displayId = resolveFootnoteDisplayNumber(id) ?? id ?? '*';
      const displayText = toSuperscriptDigits(displayId);

      let run = textNodeToRun(
        { type: 'text', text: displayText } as PMNode,
        positions,
        defaultFont,
        defaultSize,
        [], // marks applied after linked styles/base defaults
        activeSdt,
        hyperlinkConfig,
        themeColors,
      );
      applyMarksToRun(run, mergedMarks, hyperlinkConfig, themeColors);
      run = applyInlineRunProperties(run, activeRunProperties, converterContext);

      // Copy PM positions from the parent footnoteReference node
      if (refPos) {
        run.pmStart = refPos.start;
        run.pmEnd = refPos.end;
      }

      currentRuns.push(run);
      return;
    }

    if (activeHidden && node.type !== 'run') {
      suppressedByVanish = true;
      return;
    }

    if (node.type === 'text' && node.text) {
      // Pass empty array to textNodeToRun to prevent double mark application.
      // Marks will be applied AFTER linked styles to ensure proper priority.
      let run = textNodeToRun(
        node,
        positions,
        defaultFont,
        defaultSize,
        [], // Empty marks - will be applied after linked styles
        activeSdt,
        hyperlinkConfig,
        themeColors,
      );
      // Apply marks ONCE here - this ensures they override linked styles
      applyMarksToRun(
        run,
        [...(node.marks ?? []), ...(inheritedMarks ?? [])],
        hyperlinkConfig,
        themeColors,
        converterContext?.backgroundColor,
        enableComments,
      );
      run = applyInlineRunProperties(run, activeRunProperties, converterContext);
      currentRuns.push(run);
      return;
    }

    if (node.type === 'run' && Array.isArray(node.content)) {
      const mergedMarks = [...(node.marks ?? []), ...(inheritedMarks ?? [])];
      const runProperties = (node.attrs?.runProperties ?? {}) as RunProperties;
      const runVanish = runProperties?.vanish;
      const nextHidden = runVanish === undefined ? activeHidden : runVanish;
      if (nextHidden) {
        suppressedByVanish = true;
        return;
      }
      const resolvedRunProperties = resolveRunProperties(
        converterContext!,
        runProperties,
        resolvedParagraphProperties,
        converterContext!.tableInfo,
        false,
        false,
      );
      node.content.forEach((child) => visitNode(child, mergedMarks, activeSdt, resolvedRunProperties, nextHidden));
      return;
    }

    // SDT inline structured content: treat as transparent container
    if (node.type === 'structuredContent' && Array.isArray(node.content)) {
      const inlineMetadata = resolveNodeSdtMetadata(node, 'structuredContent');
      const nextSdt = inlineMetadata ?? activeSdt;
      node.content.forEach((child) => visitNode(child, inheritedMarks, nextSdt, activeRunProperties, activeHidden));
      return;
    }

    // SDT fieldAnnotation: create FieldAnnotationRun for pill-style rendering
    if (node.type === 'fieldAnnotation') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      const fieldMetadata = resolveNodeSdtMetadata(node, 'fieldAnnotation') as FieldAnnotationMetadata | null;

      // If there's inner content, extract text to use as displayLabel override
      let contentText: string | undefined;
      if (Array.isArray(node.content) && node.content.length > 0) {
        const extractText = (n: PMNode): string => {
          if (n.type === 'text' && typeof n.text === 'string') return n.text;
          if (Array.isArray(n.content)) {
            return n.content.map(extractText).join('');
          }
          return '';
        };
        contentText = node.content.map(extractText).join('');
      }

      // Create the FieldAnnotationRun (handles displayLabel fallback chain internally)
      // If we have contentText, temporarily override displayLabel in attrs
      const nodeForRun =
        contentText && contentText.length > 0
          ? { ...node, attrs: { ...(node.attrs ?? {}), displayLabel: contentText } }
          : node;

      const run = fieldAnnotationNodeToRun(nodeForRun, positions, fieldMetadata);
      currentRuns.push(run);
      return;
    }

    if (node.type === 'pageReference') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      // Create pageReference token run for dynamic resolution
      const instruction = getNodeInstruction(node) || '';
      const nodeAttrs =
        typeof node.attrs === 'object' && node.attrs !== null ? (node.attrs as Record<string, unknown>) : {};
      const refMarks = Array.isArray(nodeAttrs.marksAsAttrs) ? (nodeAttrs.marksAsAttrs as PMMark[]) : [];
      const mergedMarks = [...refMarks, ...(inheritedMarks ?? [])];

      // Extract bookmark ID from instruction, handling optional quotes
      // Examples: "PAGEREF _Toc123 \h" or "PAGEREF "_Toc123" \h"
      const bookmarkMatch = instruction.match(/PAGEREF\s+"?([^"\s\\]+)"?/i);
      const bookmarkId = bookmarkMatch ? bookmarkMatch[1] : '';

      // If we have a bookmark ID, create a token run for dynamic resolution
      let runProperties = {};
      if (bookmarkId) {
        // Check if there's materialized content (pre-baked page number from Word)
        let fallbackText = '??'; // Default placeholder if resolution fails
        if (Array.isArray(node.content) && node.content.length > 0) {
          // Extract text from children as fallback
          const extractText = (n: PMNode): string => {
            if (n.type === 'run') {
              runProperties = n.attrs?.runProperties ?? {};
            }
            if (n.type === 'text' && n.text) return n.text;
            if (Array.isArray(n.content)) {
              return n.content.map(extractText).join('');
            }
            return '';
          };
          fallbackText = node.content.map(extractText).join('').trim() || '??';
        }

        // Create token run with pageReference metadata
        // Get PM positions from the parent pageReference node (not the synthetic text node)
        const pageRefPos = positions.get(node);
        // Pass empty marks to textNodeToRun to prevent double mark application.
        // Marks will be applied AFTER linked styles to ensure proper priority and honor enableComments.
        let tokenRun = textNodeToRun(
          { type: 'text', text: fallbackText } as PMNode,
          positions,
          defaultFont,
          defaultSize,
          [], // Empty marks - will be applied after linked styles
          activeSdt,
          hyperlinkConfig,
          themeColors,
        );
        const resolvedRunProperties = resolveRunProperties(
          converterContext!,
          runProperties,
          resolvedParagraphProperties,
          null,
          false,
          false,
        );
        // Apply marks ONCE here - this ensures they override linked styles and honor enableComments
        applyMarksToRun(
          tokenRun,
          mergedMarks,
          hyperlinkConfig,
          themeColors,
          converterContext?.backgroundColor,
          enableComments,
        );
        tokenRun = applyInlineRunProperties(tokenRun, resolvedRunProperties, converterContext);
        // Copy PM positions from parent pageReference node
        if (pageRefPos) {
          (tokenRun as TextRun).pmStart = pageRefPos.start;
          (tokenRun as TextRun).pmEnd = pageRefPos.end;
        }
        (tokenRun as TextRun).token = 'pageReference';
        (tokenRun as TextRun).pageRefMetadata = {
          bookmarkId,
          instruction,
        };
        if (activeSdt) {
          tokenRun.sdt = activeSdt;
        }
        currentRuns.push(tokenRun);
      } else if (Array.isArray(node.content)) {
        // No bookmark found, fall back to treating as transparent container
        node.content.forEach((child) => visitNode(child, mergedMarks, activeSdt, activeRunProperties));
      }
      return;
    }

    if (node.type === 'bookmarkStart') {
      // Track bookmark position for cross-reference resolution
      const nodeAttrs =
        typeof node.attrs === 'object' && node.attrs !== null ? (node.attrs as Record<string, unknown>) : {};
      const bookmarkName = typeof nodeAttrs.name === 'string' ? nodeAttrs.name : undefined;
      if (bookmarkName && bookmarks) {
        const nodePos = positions.get(node);
        if (nodePos) {
          bookmarks.set(bookmarkName, nodePos.start);
        }
      }
      // Process any content inside the bookmark (usually empty)
      if (Array.isArray(node.content)) {
        node.content.forEach((child) => visitNode(child, inheritedMarks, activeSdt, activeRunProperties));
      }
      return;
    }

    if (node.type === 'tab') {
      const tabRun = tabNodeToRun(node, positions, tabOrdinal, paragraphAttrs, inheritedMarks);
      tabOrdinal += 1;
      if (tabRun) {
        currentRuns.push(tabRun);
      }
      return;
    }

    if (TOKEN_INLINE_TYPES.has(node.type)) {
      const tokenKind = TOKEN_INLINE_TYPES.get(node.type);
      if (tokenKind) {
        const marksAsAttrs = Array.isArray(node.attrs?.marksAsAttrs) ? (node.attrs.marksAsAttrs as PMMark[]) : [];
        const nodeMarks = node.marks ?? [];
        const effectiveMarks = nodeMarks.length > 0 ? nodeMarks : marksAsAttrs;
        const mergedMarks = [...effectiveMarks, ...(inheritedMarks ?? [])];
        let tokenRun = tokenNodeToRun(
          node,
          positions,
          defaultFont,
          defaultSize,
          inheritedMarks,
          tokenKind,
          hyperlinkConfig,
          themeColors,
        );
        if (activeSdt) {
          (tokenRun as TextRun).sdt = activeSdt;
        }
        if (mergedMarks.length > 0) {
          applyMarksToRun(
            tokenRun as TextRun,
            mergedMarks,
            hyperlinkConfig,
            themeColors,
            converterContext?.backgroundColor,
            enableComments,
          );
        }
        console.debug('[token-debug] paragraph-token-run', {
          token: (tokenRun as TextRun).token,
          fontFamily: (tokenRun as TextRun).fontFamily,
          fontSize: (tokenRun as TextRun).fontSize,
          inlineStyleId: paragraphProps.styleId || null,
          mergedMarksCount: mergedMarks.length,
        });
        tokenRun = applyInlineRunProperties(tokenRun as TextRun, activeRunProperties, converterContext);
        currentRuns.push(tokenRun);
      }
      return;
    }

    if (node.type === 'image') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      if (isNodeHidden(node)) {
        return;
      }
      const isInline = isInlineImage(node);

      // Check if this image should be inline (ImageRun) or block (ImageBlock)
      if (isInline) {
        // Inline image: add to current runs WITHOUT flushing paragraph
        const imageRun = imageNodeToRun(node, positions, activeSdt);
        if (imageRun) {
          currentRuns.push(imageRun);
        }
        // Continue without returning - let marks/SDT state flow through
        return;
      }

      // Anchored/floating image: existing behavior (flush and create ImageBlock)
      const anchorParagraphId = nextId();
      flushParagraph();
      const mergedMarks = [...(node.marks ?? []), ...(inheritedMarks ?? [])];
      const trackedMeta = trackedChangesConfig?.enabled ? collectTrackedChangeFromMarks(mergedMarks) : undefined;
      if (shouldHideTrackedNode(trackedMeta, trackedChangesConfig)) {
        return;
      }
      if (converters?.imageNodeToBlock) {
        const imageBlock = converters.imageNodeToBlock(node, nextBlockId, positions, trackedMeta, trackedChangesConfig);
        if (imageBlock && imageBlock.kind === 'image') {
          annotateBlockWithTrackedChange(imageBlock, trackedMeta, trackedChangesConfig);
          blocks.push(attachAnchorParagraphId(imageBlock, anchorParagraphId));
        }
      }
      return;
    }

    if (node.type === 'contentBlock') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      const attrs = node.attrs ?? {};
      if (attrs.horizontalRule === true) {
        const anchorParagraphId = nextId();
        flushParagraph();
        const indent = paragraphAttrs?.indent;
        const hrIndentLeft = typeof indent?.left === 'number' ? indent.left : undefined;
        const hrIndentRight = typeof indent?.right === 'number' ? indent.right : undefined;
        const hasIndent =
          (typeof hrIndentLeft === 'number' && hrIndentLeft !== 0) ||
          (typeof hrIndentRight === 'number' && hrIndentRight !== 0);
        const hrNode = hasIndent ? { ...node, attrs: { ...attrs, hrIndentLeft, hrIndentRight } } : node;
        const convert = converters?.contentBlockNodeToDrawingBlock ?? contentBlockNodeToDrawingBlock;
        const drawingBlock = convert(hrNode, nextBlockId, positions);
        if (drawingBlock) {
          blocks.push(attachAnchorParagraphId(drawingBlock, anchorParagraphId));
        }
      }
      return;
    }

    if (node.type === 'vectorShape') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      if (isNodeHidden(node)) {
        return;
      }
      const anchorParagraphId = nextId();
      flushParagraph();
      if (converters?.vectorShapeNodeToDrawingBlock) {
        const drawingBlock = converters.vectorShapeNodeToDrawingBlock(node, nextBlockId, positions);
        if (drawingBlock) {
          blocks.push(attachAnchorParagraphId(drawingBlock, anchorParagraphId));
        }
      }
      return;
    }

    if (node.type === 'shapeGroup') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      if (isNodeHidden(node)) {
        return;
      }
      const anchorParagraphId = nextId();
      flushParagraph();
      if (converters?.shapeGroupNodeToDrawingBlock) {
        const drawingBlock = converters.shapeGroupNodeToDrawingBlock(node, nextBlockId, positions);
        if (drawingBlock) {
          blocks.push(attachAnchorParagraphId(drawingBlock, anchorParagraphId));
        }
      }
      return;
    }

    if (node.type === 'shapeContainer') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      if (isNodeHidden(node)) {
        return;
      }
      const anchorParagraphId = nextId();
      flushParagraph();
      if (converters?.shapeContainerNodeToDrawingBlock) {
        const drawingBlock = converters.shapeContainerNodeToDrawingBlock(node, nextBlockId, positions);
        if (drawingBlock) {
          blocks.push(attachAnchorParagraphId(drawingBlock, anchorParagraphId));
        }
      }
      return;
    }

    if (node.type === 'shapeTextbox') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      if (isNodeHidden(node)) {
        return;
      }
      const anchorParagraphId = nextId();
      flushParagraph();
      if (converters?.shapeTextboxNodeToDrawingBlock) {
        const drawingBlock = converters.shapeTextboxNodeToDrawingBlock(node, nextBlockId, positions);
        if (drawingBlock) {
          blocks.push(attachAnchorParagraphId(drawingBlock, anchorParagraphId));
        }
      }
      return;
    }

    // Tables may occasionally appear inline via wrappers; treat as block-level
    if (node.type === 'table') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      const anchorParagraphId = nextId();
      flushParagraph();
      if (converters?.tableNodeToBlock) {
        const tableBlock = converters.tableNodeToBlock({
          node,
          nextBlockId,
          positions,
          defaultFont,
          defaultSize,
          styleContext,
          trackedChangesConfig,
          bookmarks,
          hyperlinkConfig,
          themeColors,
          converterContext,
          converters,
          enableComments,
        });
        if (tableBlock) {
          blocks.push(attachAnchorParagraphId(tableBlock, anchorParagraphId));
        }
      }
      return;
    }

    // Hard / line breaks
    if (node.type === 'hardBreak' || node.type === 'lineBreak') {
      if (activeHidden) {
        suppressedByVanish = true;
        return;
      }
      const attrs = node.attrs ?? {};
      const breakType = attrs.pageBreakType ?? attrs.lineBreakType ?? 'line';

      if (breakType === 'page') {
        flushParagraph();
        blocks.push({
          kind: 'pageBreak',
          id: nextId(),
          attrs: node.attrs || {},
        });
        return;
      }

      if (breakType === 'column') {
        flushParagraph();
        blocks.push({
          kind: 'columnBreak',
          id: nextId(),
          attrs: node.attrs || {},
        });
        return;
      }
      // Inline line break: preserve as a run so measurer can create a new line
      const lineBreakRun: Run = { kind: 'lineBreak', attrs: {} };
      const lbAttrs: Record<string, string> = {};
      if (attrs.lineBreakType) lbAttrs.lineBreakType = String(attrs.lineBreakType);
      if (attrs.clear) lbAttrs.clear = String(attrs.clear);
      if (Object.keys(lbAttrs).length > 0) {
        (lineBreakRun as { attrs: Record<string, string> }).attrs = lbAttrs;
      } else {
        delete (lineBreakRun as { attrs?: Record<string, string> }).attrs;
      }
      const pos = positions.get(node);
      if (pos) {
        (lineBreakRun as { pmStart: number }).pmStart = pos.start;
        (lineBreakRun as { pmEnd: number }).pmEnd = pos.end;
      }
      if (activeSdt) {
        (lineBreakRun as { sdt?: SdtMetadata }).sdt = activeSdt;
      }
      currentRuns.push(lineBreakRun);
      return;
    }
  };

  para.content.forEach((child) => {
    visitNode(child, [], undefined, undefined);
  });
  flushParagraph();

  const hasParagraphBlock = blocks.some((block) => block.kind === 'paragraph');
  if (!hasParagraphBlock && !suppressedByVanish && !paragraphProps.runProperties?.vanish) {
    blocks.push({
      kind: 'paragraph',
      id: baseBlockId,
      runs: [
        {
          text: '',
          fontFamily: defaultFont,
          fontSize: defaultSize,
        },
      ],
      attrs: deepClone(paragraphAttrs),
    });
  }

  // Merge adjacent text runs with continuous PM positions
  // This handles cases where PM keeps text nodes separate after join operations
  blocks.forEach((block) => {
    if (block.kind === 'paragraph' && block.runs.length > 1) {
      block.runs = mergeAdjacentRuns(block.runs);
      // Silent optimization: no console noise in tests/production
    }
  });

  if (!trackedChangesConfig) {
    return blocks;
  }

  const processedBlocks: FlowBlock[] = [];
  blocks.forEach((block) => {
    if (block.kind !== 'paragraph') {
      processedBlocks.push(block);
      return;
    }
    const filteredRuns = applyTrackedChangesModeToRuns(
      block.runs,
      trackedChangesConfig,
      hyperlinkConfig,
      applyMarksToRun,
      themeColors,
      enableComments,
    );
    if (trackedChangesConfig.enabled && filteredRuns.length === 0) {
      return;
    }
    block.runs = filteredRuns;
    block.attrs = {
      ...(block.attrs ?? {}),
      trackedChangesMode: trackedChangesConfig.mode,
      trackedChangesEnabled: trackedChangesConfig.enabled,
    };
    processedBlocks.push(block);
  });

  return processedBlocks;
}

/**
 * Handle paragraph nodes.
 * Special handling: Emits section breaks BEFORE processing the paragraph
 * if this paragraph starts a new section.
 *
 * @param node - Paragraph node to process
 * @param context - Shared handler context
 */
export function handleParagraphNode(node: PMNode, context: NodeHandlerContext): void {
  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    sectionState,
    converters,
    converterContext,
    themeColors,
    enableComments,
  } = context;
  const { ranges: sectionRanges, currentSectionIndex, currentParagraphIndex } = sectionState;

  // Emit section break BEFORE the first paragraph of the next section
  if (sectionRanges.length > 0) {
    const nextSection = sectionRanges[currentSectionIndex + 1];
    if (nextSection && currentParagraphIndex === nextSection.startParagraphIndex) {
      const currentSection = sectionRanges[currentSectionIndex];
      const requiresPageBoundary =
        shouldRequirePageBoundary(currentSection, nextSection) || hasIntrinsicBoundarySignals(nextSection);
      const extraAttrs = requiresPageBoundary ? { requirePageBoundary: true } : undefined;
      const sectionBreak = createSectionBreakBlock(nextSection, nextBlockId, extraAttrs);
      blocks.push(sectionBreak);
      recordBlockKind(sectionBreak.kind);
      sectionState.currentSectionIndex++;
    }
  }

  const paragraphToFlowBlocks = converters.paragraphToFlowBlocks;

  const paragraphBlocks = paragraphToFlowBlocks({
    para: node,
    nextBlockId,
    positions,
    defaultFont,
    defaultSize,
    styleContext,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    themeColors,
    converterContext,
    converters,
    enableComments,
  });
  paragraphBlocks.forEach((block) => {
    blocks.push(block);
    recordBlockKind(block.kind);
  });

  sectionState.currentParagraphIndex++;
}
