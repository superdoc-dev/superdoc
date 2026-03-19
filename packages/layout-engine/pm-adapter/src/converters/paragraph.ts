/**
 * Paragraph Converter Module
 *
 * Functions for converting ProseMirror paragraph nodes to FlowBlock arrays:
 * - Paragraph to FlowBlocks conversion (main entry point)
 * - Run merging optimization
 * - Tracked changes processing
 */

import type { ParagraphProperties, RunProperties } from '@superdoc/style-engine/ooxml';
import type { FlowBlock, Run, TextRun, SdtMetadata, DrawingBlock, TrackedChangeMeta } from '@superdoc/contracts';
import type {
  PMNode,
  PMMark,
  NodeHandlerContext,
  ParagraphToFlowBlocksParams,
  BlockIdGenerator,
  PositionMap,
} from '../types.js';
import { getStableParagraphId, shiftCachedBlocks } from '../cache.js';
import type { ConverterContext } from '../converter-context.js';
import { computeParagraphAttrs, deepClone } from '../attributes/index.js';
import { shouldRequirePageBoundary, hasIntrinsicBoundarySignals, createSectionBreakBlock } from '../sections/index.js';
import { trackedChangesCompatible, applyMarksToRun, collectTrackedChangeFromMarks } from '../marks/index.js';
import { applyTrackedChangesModeToRuns } from '../tracked-changes.js';
import { textNodeToRun } from './inline-converters/text-run.js';
import { DEFAULT_HYPERLINK_CONFIG, TOKEN_INLINE_TYPES } from '../constants.js';
import { computeRunAttrs } from '../attributes/paragraph.js';
import { resolveRunProperties } from '@superdoc/style-engine/ooxml';
import { footnoteReferenceToBlock } from './inline-converters/footnote-reference.js';
import { endnoteReferenceToBlock } from './inline-converters/endnote-reference.js';
import {
  HiddenByVanishError,
  NotInlineNodeError,
  InlineConverterParams,
  BlockConverterOptions,
} from './inline-converters/common.js';
import { runNodeChildrenToRuns } from './inline-converters/run.js';
import { structuredContentNodeToBlocks } from './inline-converters/structured-content.js';
import { pageReferenceNodeToBlock } from './inline-converters/page-reference.js';
import { fieldAnnotationNodeToRun } from './inline-converters/field-annotation.js';
import { bookmarkStartNodeToBlocks } from './inline-converters/bookmark-start.js';
import { tabNodeToRun } from './inline-converters/tab.js';
import { tokenNodeToRun } from './inline-converters/generic-token.js';
import { imageNodeToRun } from './inline-converters/image.js';
import { crossReferenceNodeToRun } from './inline-converters/cross-reference.js';
import { sequenceFieldNodeToRun } from './inline-converters/sequence-field.js';
import { citationNodeToRun } from './inline-converters/citation.js';
import { authorityEntryNodeToRun } from './inline-converters/authority-entry.js';
import { lineBreakNodeToRun } from './inline-converters/line-break.js';
import { lineBreakNodeToBreakBlock } from './break.js';
import { inlineContentBlockConverter } from './inline-converters/content-block.js';
import { handleImageNode } from './image.js';
import { generateOrderedListIndex } from '../list-helpers.js';
import { getListOrdinalFromPath, getListRendering } from '@superdoc/common/list-rendering';
import {
  shapeContainerNodeToDrawingBlock,
  shapeGroupNodeToDrawingBlock,
  shapeTextboxNodeToDrawingBlock,
  vectorShapeNodeToDrawingBlock,
} from './shapes.js';
import { chartNodeToDrawingBlock } from './chart.js';
import { tableNodeToBlock } from './table.js';

// ============================================================================
// Helper functions for inline image detection and conversion
// ============================================================================

const isHiddenShape = (node: PMNode): boolean => {
  if (!node.type.toLowerCase().includes('shape')) {
    return false;
  }
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (attrs.hidden === true) return true;
  return typeof attrs.visibility === 'string' && attrs.visibility.toLowerCase() === 'hidden';
};

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

/**
 * Extracts the default font family and size from paragraph properties.
 * Used for creating default runs in empty paragraphs.
 * @param converterContext - Converter context with document styles
 * @param paragraphProperties - Resolved paragraph properties
 * @returns Object with defaultFont and defaultSize
 */
function extractDefaultFontProperties(
  converterContext: ConverterContext,
  paragraphProperties: ParagraphProperties,
): { defaultFont: string; defaultSize: number } {
  const defaultRunAttrs = computeRunAttrs(
    resolveRunProperties(
      converterContext,
      paragraphProperties.runProperties,
      paragraphProperties,
      converterContext.tableInfo,
      false,
      false,
    ),
    converterContext,
  );
  return {
    defaultFont: defaultRunAttrs.fontFamily!,
    defaultSize: defaultRunAttrs.fontSize!,
  };
}

const toTrackChangeAttrs = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as Record<string, unknown>;
};

// Paragraph-mark revisions are stored in paragraphProperties.runProperties (pPr/rPr), not inline text marks.
// Convert them into mark-like metadata so tracked-change filtering can reuse the same projection pipeline.
const getParagraphMarkTrackedChange = (paragraphProperties: ParagraphProperties): TrackedChangeMeta | undefined => {
  const runProperties =
    paragraphProperties?.runProperties && typeof paragraphProperties.runProperties === 'object'
      ? (paragraphProperties.runProperties as Record<string, unknown>)
      : undefined;
  if (!runProperties) {
    return undefined;
  }

  const trackInsertAttrs = toTrackChangeAttrs(runProperties.trackInsert);
  const trackDeleteAttrs = toTrackChangeAttrs(runProperties.trackDelete);
  if (!trackInsertAttrs && !trackDeleteAttrs) {
    return undefined;
  }

  const marks: PMMark[] = [];
  if (trackInsertAttrs) {
    marks.push({ type: 'trackInsert', attrs: trackInsertAttrs });
  }
  if (trackDeleteAttrs) {
    marks.push({ type: 'trackDelete', attrs: trackDeleteAttrs });
  }
  return collectTrackedChangeFromMarks(marks);
};

const isEmptyTextRun = (run: Run): boolean => {
  if (!isTextRun(run)) {
    return false;
  }
  return run.text.length === 0;
};

/**
 * Extracts the marker record from a paragraph FlowBlock's wordLayout attrs.
 * Shared by ghost-list marker adjustment helpers to avoid duplicated extraction logic.
 */
const getBlockMarker = (block: FlowBlock): Record<string, unknown> | undefined => {
  if (!('attrs' in block) || !block.attrs || typeof block.attrs !== 'object') return undefined;
  const wordLayout = (block.attrs as Record<string, unknown>).wordLayout;
  if (!wordLayout || typeof wordLayout !== 'object') return undefined;
  const marker = (wordLayout as Record<string, unknown>).marker;
  if (!marker || typeof marker !== 'object') return undefined;
  return marker as Record<string, unknown>;
};

/**
 * Returns the original (pre-adjustment) marker text from a marker record.
 * Prefers the saved pmAdapterOriginalMarkerText over the current markerText.
 */
const getOriginalMarkerText = (marker: Record<string, unknown>): string | undefined => {
  if (typeof marker.pmAdapterOriginalMarkerText === 'string') return marker.pmAdapterOriginalMarkerText;
  return typeof marker.markerText === 'string' ? marker.markerText : undefined;
};

/**
 * Ghost list artifact suppression only applies in modes that display tracked changes
 * visually (review/markup). In final/original, applyTrackedChangesModeToRuns already
 * handles visibility correctly — surviving empty list items are real content.
 */
const isGhostSuppressionMode = (mode: string): boolean => mode !== 'off' && mode !== 'final' && mode !== 'original';

const getListKey = (numId: unknown, ilvl: unknown): string | undefined => {
  if ((typeof numId !== 'number' && typeof numId !== 'string') || typeof ilvl !== 'number') {
    return undefined;
  }
  const normalizedNumId = String(numId).trim();
  if (!normalizedNumId) {
    return undefined;
  }
  return `${normalizedNumId}:${ilvl}`;
};

const getParagraphListKeyFromAttrs = (attrs: unknown): string | undefined => {
  if (!attrs || typeof attrs !== 'object') {
    return undefined;
  }
  const numberingProperties = (attrs as { numberingProperties?: { numId?: unknown; ilvl?: unknown } })
    .numberingProperties;
  if (!numberingProperties) {
    return undefined;
  }
  return getListKey(numberingProperties.numId, numberingProperties.ilvl);
};

const TRAILING_MARKER_TOKEN_RE = /^(.*?)([\p{L}\p{N}]+)([^\p{L}\p{N}]*)$/u;

const getNodeListOrdinal = (node: PMNode): number | undefined => {
  const listRendering = getListRendering(node.attrs?.listRendering);
  if (!listRendering || listRendering.numberingType === 'bullet') {
    return undefined;
  }
  return getListOrdinalFromPath(listRendering.path);
};

const formatListOrdinalToken = (numberingType: string, ordinal: number, customFormat?: string): string | undefined => {
  if (!Number.isFinite(ordinal) || ordinal < 1 || numberingType === 'bullet') {
    return undefined;
  }
  const formatted = generateOrderedListIndex({
    listLevel: [Math.trunc(ordinal)],
    lvlText: '%1',
    listNumberingType: numberingType,
    customFormat,
  });
  return formatted ?? undefined;
};

const replaceTrailingMarkerToken = (markerText: string, replacementToken: string): string | undefined => {
  const match = TRAILING_MARKER_TOKEN_RE.exec(markerText);
  if (!match) {
    return undefined;
  }
  return `${match[1] ?? ''}${replacementToken}${match[3] ?? ''}`;
};

const updateGhostListMarkerOffsets = (
  node: PMNode,
  paragraphBlocks: FlowBlock[],
  context: NodeHandlerContext,
): void => {
  if (!context.trackedChangesConfig.enabled) {
    return;
  }
  if (paragraphBlocks.some((block) => block.kind === 'paragraph')) {
    return;
  }
  if (Array.isArray(node.content) && node.content.length > 0) {
    return;
  }
  const paragraphProperties =
    typeof node.attrs?.paragraphProperties === 'object' && node.attrs.paragraphProperties !== null
      ? (node.attrs.paragraphProperties as ParagraphProperties)
      : {};
  if (!getParagraphMarkTrackedChange(paragraphProperties)) {
    return;
  }

  const { paragraphAttrs } = computeParagraphAttrs(node, context.converterContext);
  const key = getParagraphListKeyFromAttrs(paragraphAttrs);
  if (!key) {
    return;
  }
  const offsets = context.trackedListMarkerOffsets;
  if (!offsets) {
    return;
  }
  // Each suppressed empty tracked list paragraph consumes one source ordinal that Word does not render.
  offsets.set(key, (offsets.get(key) ?? 0) + 1);
};

const getNodeListKey = (node: PMNode, context: NodeHandlerContext): string | undefined => {
  const { paragraphAttrs } = computeParagraphAttrs(node, context.converterContext);
  return getParagraphListKeyFromAttrs(paragraphAttrs);
};

const applyGhostListMarkerOffsets = (node: PMNode, paragraphBlocks: FlowBlock[], context: NodeHandlerContext): void => {
  const offsets = context.trackedListMarkerOffsets;
  const lastOrdinals = context.trackedListLastOrdinals;
  if (!offsets || offsets.size === 0 || !context.trackedChangesConfig.enabled) {
    return;
  }
  const listRendering = getListRendering(node.attrs?.listRendering);
  const numberingType = listRendering?.numberingType;
  if (!numberingType || numberingType === 'bullet') {
    return;
  }
  const sourceOrdinal = getNodeListOrdinal(node);
  if (!sourceOrdinal) {
    return;
  }
  const nodeListKey = getNodeListKey(node, context);
  if (!nodeListKey) {
    return;
  }
  const previousOrdinal = lastOrdinals?.get(nodeListKey);
  // Restart detection must be per source paragraph node (not per emitted block),
  // because one source list paragraph can split into multiple rendered blocks.
  if (previousOrdinal != null && sourceOrdinal <= previousOrdinal) {
    // Marker sequence moved backwards/repeated -> list restart boundary.
    offsets.delete(nodeListKey);
  }
  lastOrdinals?.set(nodeListKey, sourceOrdinal);

  const offset = offsets.get(nodeListKey) ?? 0;
  if (offset <= 0) {
    return;
  }
  const adjustedOrdinal = sourceOrdinal - offset;
  if (adjustedOrdinal < 1) {
    // Stale offset would underflow this marker; treat as a restart boundary.
    offsets.delete(nodeListKey);
    paragraphBlocks.forEach((block) => {
      if (block.kind !== 'paragraph' || getParagraphListKeyFromAttrs(block.attrs) !== nodeListKey) return;
      const marker = getBlockMarker(block);
      if (!marker) return;
      const sourceMarkerText = getOriginalMarkerText(marker);
      if (sourceMarkerText) {
        marker.markerText = sourceMarkerText;
      }
    });
    return;
  }

  const replacementToken = formatListOrdinalToken(numberingType, adjustedOrdinal, listRendering.customFormat);
  if (!replacementToken) {
    return;
  }

  paragraphBlocks.forEach((block) => {
    if (block.kind !== 'paragraph' || getParagraphListKeyFromAttrs(block.attrs) !== nodeListKey) return;
    const marker = getBlockMarker(block);
    if (!marker) return;
    const sourceMarkerText = getOriginalMarkerText(marker);
    if (!sourceMarkerText) return;
    const adjustedText = replaceTrailingMarkerToken(sourceMarkerText, replacementToken);
    if (!adjustedText || adjustedText === sourceMarkerText) return;
    // Preserve the source marker so repeated conversions/cache reuse remain idempotent.
    marker.pmAdapterOriginalMarkerText = sourceMarkerText;
    marker.markerText = adjustedText;
  });
};

const applyTrackedGhostListAdjustments = (
  node: PMNode,
  paragraphBlocks: FlowBlock[],
  context: NodeHandlerContext,
): void => {
  if (!context.trackedChangesConfig.enabled) {
    return;
  }
  updateGhostListMarkerOffsets(node, paragraphBlocks, context);
  applyGhostListMarkerOffsets(node, paragraphBlocks, context);
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
  trackedChangesConfig,
  bookmarks,
  hyperlinkConfig = DEFAULT_HYPERLINK_CONFIG,
  themeColors,
  converters,
  converterContext,
  enableComments = true,
  stableBlockId,
}: ParagraphToFlowBlocksParams): FlowBlock[] {
  // Use stable ID if provided, otherwise fall back to generator
  const baseBlockId = stableBlockId ?? nextBlockId('paragraph');

  // When stableBlockId is provided, create a deterministic ID generator for inline blocks
  // (images, shapes, tables, etc.) to ensure consistent IDs across cached/uncached renders.
  // This prevents ID drift that would cause unnecessary dirty regions.
  let inlineBlockCounter = 0;
  const stableNextBlockId: BlockIdGenerator = stableBlockId
    ? (prefix: string) => `${stableBlockId}-${prefix}-${inlineBlockCounter++}`
    : nextBlockId;
  const paragraphProps =
    typeof para.attrs?.paragraphProperties === 'object' && para.attrs.paragraphProperties !== null
      ? (para.attrs.paragraphProperties as ParagraphProperties)
      : {};
  const { paragraphAttrs, resolvedParagraphProperties } = computeParagraphAttrs(para, converterContext);

  const blocks: FlowBlock[] = [];
  const paraAttrs = (para.attrs ?? {}) as Record<string, unknown>;
  const rawParagraphProps =
    typeof paraAttrs.paragraphProperties === 'object' && paraAttrs.paragraphProperties !== null
      ? (paraAttrs.paragraphProperties as Record<string, unknown>)
      : undefined;
  const hasSectPr = Boolean(rawParagraphProps?.sectPr);
  const isSectPrMarker = hasSectPr || paraAttrs.pageBreakSource === 'sectPr';
  const { defaultFont, defaultSize } = extractDefaultFontProperties(converterContext, resolvedParagraphProperties);

  if (paragraphAttrs.pageBreakBefore) {
    blocks.push({
      kind: 'pageBreak',
      // Use deterministic suffix when stable ID is provided, otherwise use generator
      id: stableBlockId ? `${stableBlockId}-pageBreak` : nextBlockId('pageBreak'),
      attrs: { source: 'pageBreakBefore' },
    });
  }

  if (!para.content || para.content.length === 0) {
    if (paragraphProps.runProperties?.vanish) {
      return blocks;
    }
    const paragraphMarkTrackedChange = getParagraphMarkTrackedChange(paragraphProps);
    // Get the PM position of the empty paragraph for caret rendering
    const paraPos = positions.get(para);
    const emptyRun: TextRun = {
      text: '',
      fontFamily: defaultFont,
      fontSize: defaultSize,
    };
    if (paragraphMarkTrackedChange) {
      emptyRun.trackedChange = paragraphMarkTrackedChange;
    }
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
      attrs: emptyParagraphAttrs,
    });
    if (!trackedChangesConfig) {
      return blocks;
    }

    const paragraphBlock = blocks[blocks.length - 1];
    if (paragraphBlock?.kind !== 'paragraph') {
      return blocks;
    }

    const filteredRuns = applyTrackedChangesModeToRuns(
      paragraphBlock.runs,
      trackedChangesConfig,
      hyperlinkConfig,
      applyMarksToRun,
      themeColors,
      enableComments,
    );

    // Ghost list artifact suppression only applies in markup/review modes.
    // In final/original, applyTrackedChangesModeToRuns already handles visibility:
    // insertions survive in final and deletions survive in original — these are real content,
    // not phantom list items that need hiding.
    const isGhostTrackedListArtifact =
      trackedChangesConfig.enabled &&
      isGhostSuppressionMode(trackedChangesConfig.mode) &&
      Boolean(paragraphAttrs.numberingProperties) &&
      Boolean(paragraphMarkTrackedChange) &&
      filteredRuns.length > 0 &&
      filteredRuns.every(isEmptyTextRun);

    if (trackedChangesConfig.enabled && (filteredRuns.length === 0 || isGhostTrackedListArtifact)) {
      blocks.pop();
      return blocks;
    }

    paragraphBlock.runs = filteredRuns;
    paragraphBlock.attrs = {
      ...(paragraphBlock.attrs ?? {}),
      trackedChangesMode: trackedChangesConfig.mode,
      trackedChangesEnabled: trackedChangesConfig.enabled,
    };
    return blocks;
  }

  let currentRuns: Run[] = [];
  let partIndex = 0;
  let tabOrdinal = 0;
  let suppressedByVanish = false;

  const nextId = () => (partIndex === 0 ? baseBlockId : `${baseBlockId}-${partIndex}`);
  const attachAnchorParagraphId = <T extends FlowBlock>(block: T, anchorParagraphId: string): T => {
    const applicableKinds = new Set(['drawing', 'image', 'table']);
    if (!applicableKinds.has(block.kind)) {
      return block;
    }
    const blockWithAttrs = block as T & { attrs?: Record<string, unknown> };
    if (!blockWithAttrs.attrs) {
      blockWithAttrs.attrs = {};
    }
    blockWithAttrs.attrs.anchorParagraphId = anchorParagraphId;
    return blockWithAttrs;
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
    if (activeHidden && node.type !== 'run') {
      suppressedByVanish = true;
      return;
    }
    if (isHiddenShape(node)) {
      return;
    }

    const inlineConverterParams = {
      node: node,
      positions,
      defaultFont,
      defaultSize,
      inheritedMarks: inheritedMarks ?? [],
      sdtMetadata: activeSdt,
      hyperlinkConfig,
      themeColors,
      enableComments,
      runProperties: activeRunProperties,
      paragraphProperties: resolvedParagraphProperties,
      converterContext,
      visitNode,
      bookmarks,
      tabOrdinal,
      paragraphAttrs,
      nextBlockId: stableNextBlockId,
    };

    const blockOptions: BlockConverterOptions = {
      blocks,
      nextBlockId: stableNextBlockId,
      nextId,
      positions,
      trackedChangesConfig,
      defaultFont,
      defaultSize,
      converterContext,
      hyperlinkConfig,
      enableComments,
      bookmarks: bookmarks!,
      converters,
      paragraphAttrs,
    };

    if (INLINE_CONVERTERS_REGISTRY[node.type]) {
      const { inlineConverter, extraCheck, blockConverter } = INLINE_CONVERTERS_REGISTRY[node.type];
      if (!extraCheck || extraCheck(node)) {
        try {
          if (!inlineConverter) {
            throw new NotInlineNodeError();
          } else {
            const run = inlineConverter(inlineConverterParams);
            if (run) {
              currentRuns.push(run);
              if (node.type === 'tab') {
                tabOrdinal += 1;
              }
            }
          }
        } catch (error) {
          if (error instanceof HiddenByVanishError) {
            suppressedByVanish = true;
          } else if (error instanceof NotInlineNodeError && blockConverter) {
            const anchorParagraphId = nextId();
            flushParagraph();
            const newBlocks: FlowBlock[] = [];
            const block = blockConverter(node, { ...blockOptions, blocks: newBlocks });
            if (block) {
              attachAnchorParagraphId(block, anchorParagraphId);
              blocks.push(block);
            } else if (newBlocks.length > 0) {
              // Some block converters may push multiple blocks to the provided array
              newBlocks.forEach((b) => {
                attachAnchorParagraphId(b, anchorParagraphId);
                blocks.push(b);
              });
            }
          } else {
            throw error;
          }
        }
      }
      return;
    }

    if (SHAPE_CONVERTERS_REGISTRY[node.type]) {
      const anchorParagraphId = nextId();
      flushParagraph();
      const converter = SHAPE_CONVERTERS_REGISTRY[node.type];
      const drawingBlock = converter(node, stableNextBlockId, positions);
      if (drawingBlock) {
        blocks.push(attachAnchorParagraphId(drawingBlock, anchorParagraphId));
      }
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

type InlineConverterSpec = {
  inlineConverter?: (params: InlineConverterParams) => Run | void | null;
  extraCheck?: (node: PMNode) => boolean;
  blockConverter?: (node: PMNode, options: BlockConverterOptions) => FlowBlock | DrawingBlock | void | null;
};

const INLINE_CONVERTERS_REGISTRY: Record<string, InlineConverterSpec> = {
  footnoteReference: {
    inlineConverter: footnoteReferenceToBlock,
  },
  endnoteReference: {
    inlineConverter: endnoteReferenceToBlock,
  },
  text: {
    inlineConverter: textNodeToRun,
    extraCheck: (node: PMNode) => Boolean(node.text),
  },
  run: {
    inlineConverter: runNodeChildrenToRuns,
    extraCheck: (node: PMNode) => Array.isArray(node.content),
  },
  structuredContent: {
    inlineConverter: structuredContentNodeToBlocks,
    extraCheck: (node: PMNode) => Array.isArray(node.content),
  },
  fieldAnnotation: {
    inlineConverter: fieldAnnotationNodeToRun,
  },
  pageReference: {
    inlineConverter: pageReferenceNodeToBlock,
  },
  crossReference: {
    inlineConverter: crossReferenceNodeToRun,
  },
  sequenceField: {
    inlineConverter: sequenceFieldNodeToRun,
  },
  citation: {
    inlineConverter: citationNodeToRun,
  },
  authorityEntry: {
    inlineConverter: authorityEntryNodeToRun,
  },
  bookmarkStart: {
    inlineConverter: bookmarkStartNodeToBlocks,
  },
  tab: {
    inlineConverter: tabNodeToRun,
  },
  image: {
    inlineConverter: imageNodeToRun,
    blockConverter: handleImageNode,
  },
  contentBlock: {
    blockConverter: inlineContentBlockConverter,
  },
  hardBreak: {
    inlineConverter: lineBreakNodeToRun,
    blockConverter: lineBreakNodeToBreakBlock,
  },
  lineBreak: {
    inlineConverter: lineBreakNodeToRun,
    blockConverter: lineBreakNodeToBreakBlock,
  },
  table: {
    blockConverter: tableNodeToBlock,
  },
};

for (const type of TOKEN_INLINE_TYPES.keys()) {
  INLINE_CONVERTERS_REGISTRY[type] = {
    inlineConverter: tokenNodeToRun,
  };
}

const SHAPE_CONVERTERS_REGISTRY: Record<
  string,
  (node: PMNode, nextBlockId: BlockIdGenerator, positions: PositionMap) => DrawingBlock | null
> = {
  vectorShape: vectorShapeNodeToDrawingBlock,
  shapeGroup: shapeGroupNodeToDrawingBlock,
  shapeContainer: shapeContainerNodeToDrawingBlock,
  shapeTextbox: shapeTextboxNodeToDrawingBlock,
  chart: chartNodeToDrawingBlock,
};

/**
 * Handle paragraph nodes.
 * Special handling: Emits section breaks BEFORE processing the paragraph
 * if this paragraph starts a new section.
 *
 * Supports incremental conversion via FlowBlockCache:
 * - If cache is available and paragraph has stable ID (sdBlockId/paraId)
 * - Check cache for matching node content
 * - On cache hit: reuse blocks with position adjustment
 * - On cache miss: convert normally and store in cache
 *
 * @param node - Paragraph node to process
 * @param context - Shared handler context
 */
export function handleParagraphNode(node: PMNode, context: NodeHandlerContext): void {
  const {
    blocks,
    recordBlockKind,
    nextBlockId,
    blockIdPrefix = '',
    positions,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    sectionState,
    converters,
    converterContext,
    themeColors,
    flowBlockCache,
    enableComments,
  } = context;
  const { ranges: sectionRanges, currentSectionIndex, currentParagraphIndex } = sectionState!;

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
      recordBlockKind?.(sectionBreak.kind);
      sectionState!.currentSectionIndex++;
    }
  }

  const paragraphToFlowBlocks = converters.paragraphToFlowBlocks;
  const stableId = getStableParagraphId(node);
  const prefixedStableId = stableId ? `${blockIdPrefix}${stableId}` : null;
  const nodePos = positions.get(node);
  const pmStart = nodePos?.start ?? 0;

  if (prefixedStableId && flowBlockCache) {
    // get() returns both the entry (if hit) and pre-computed nodeJson to avoid double serialization
    const { entry: cached, nodeJson, nodeRev } = flowBlockCache.get(prefixedStableId, node);
    if (cached) {
      // Cache hit: reuse blocks with position adjustment
      const delta = pmStart - cached.pmStart;
      const reusedBlocks = shiftCachedBlocks(cached.blocks, delta);
      applyTrackedGhostListAdjustments(node, reusedBlocks, context);

      reusedBlocks.forEach((block) => {
        blocks.push(block);
        recordBlockKind?.(block.kind);
      });

      // Store in next cache generation with current position (reuse nodeJson)
      flowBlockCache.set(prefixedStableId, nodeJson, nodeRev, reusedBlocks, pmStart);
      sectionState!.currentParagraphIndex++;
      return;
    }

    // Cache miss: convert normally, then store using pre-computed nodeJson
    const paragraphBlocks = paragraphToFlowBlocks({
      para: node,
      nextBlockId,
      positions,
      trackedChangesConfig,
      bookmarks,
      hyperlinkConfig,
      themeColors,
      converters,
      converterContext,
      enableComments,
      stableBlockId: prefixedStableId,
    });
    applyTrackedGhostListAdjustments(node, paragraphBlocks, context);

    paragraphBlocks.forEach((block) => {
      blocks.push(block);
      recordBlockKind?.(block.kind);
    });

    // Store in cache using pre-computed nodeJson (avoids double serialization)
    flowBlockCache.set(prefixedStableId, nodeJson, nodeRev, paragraphBlocks, pmStart);
    sectionState!.currentParagraphIndex++;
    return;
  }

  const paragraphBlocks = paragraphToFlowBlocks({
    para: node,
    nextBlockId,
    positions,
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    themeColors,
    converters,
    converterContext,
    enableComments,
    stableBlockId: prefixedStableId ?? undefined,
  });
  applyTrackedGhostListAdjustments(node, paragraphBlocks, context);

  paragraphBlocks.forEach((block) => {
    blocks.push(block);
    recordBlockKind?.(block.kind);
  });

  sectionState!.currentParagraphIndex++;
}
