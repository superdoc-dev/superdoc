/**
 * Paragraph Converter Module
 *
 * Functions for converting ProseMirror paragraph nodes to FlowBlock arrays:
 * - Paragraph to FlowBlocks conversion (main entry point)
 * - Run merging optimization
 * - Tracked changes processing
 */

import type { ParagraphProperties, RunProperties } from '@superdoc/style-engine/ooxml';
import type { FlowBlock, Run, TextRun, SdtMetadata } from '@superdoc/contracts';
import type { PMNode, PMMark, NodeHandlerContext, ParagraphToFlowBlocksParams } from '../types.js';
import type { ConverterContext } from '../converter-context.js';
import { computeParagraphAttrs, deepClone } from '../attributes/index.js';
import { shouldRequirePageBoundary, hasIntrinsicBoundarySignals, createSectionBreakBlock } from '../sections/index.js';
import { trackedChangesCompatible, applyMarksToRun } from '../marks/index.js';
import { applyTrackedChangesModeToRuns } from '../tracked-changes.js';
import { textNodeToRun } from './inline-converters/text-run.js';
import { contentBlockNodeToDrawingBlock } from './content-block.js';
import { DEFAULT_HYPERLINK_CONFIG, TOKEN_INLINE_TYPES } from '../constants.js';
import { computeRunAttrs } from '../attributes/paragraph.js';
import { resolveRunProperties } from '@superdoc/style-engine/ooxml';
import { footnoteReferenceToBlock } from './inline-converters/footnote-reference.js';
import { HiddenByVanishError, NotInlineNodeError } from './inline-converters/common.js';
import { runNodeChildrenToRuns } from './inline-converters/run.js';
import { structuredContentNodeToBlocks } from './inline-converters/structured-content.js';
import { pageReferenceNodeToBlock } from './inline-converters/page-reference.js';
import { fieldAnnotationNodeToRun } from './inline-converters/field-annotation.js';
import { bookmarkStartNodeToBlocks } from './inline-converters/bookmark-start.js';
import { tabNodeToRun } from './inline-converters/tab.js';
import { tokenNodeToRun } from './inline-converters/generic-token.js';
import { imageNodeToRun } from './inline-converters/image.js';
import { inlineContentBlockConverter } from './inline-converters/content-block.js';
import { handleImageNode } from './image.js';

// ============================================================================
// Helper functions for inline image detection and conversion
// ============================================================================

const isNodeHidden = (node: PMNode): boolean => {
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
  const { defaultFont, defaultSize } = extractDefaultFontProperties(converterContext, resolvedParagraphProperties);

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
      nextBlockId,
    };

    if (node.type === 'footnoteReference') {
      const run = footnoteReferenceToBlock(inlineConverterParams);

      currentRuns.push(run);
      return;
    }

    if (node.type === 'text' && node.text) {
      const run = textNodeToRun(inlineConverterParams);

      currentRuns.push(run);
      return;
    }

    if (node.type === 'run' && Array.isArray(node.content)) {
      try {
        runNodeChildrenToRuns(inlineConverterParams);
      } catch (error) {
        if (error instanceof HiddenByVanishError) {
          suppressedByVanish = true;
        } else {
          throw error;
        }
      }
      return;
    }

    // SDT inline structured content: treat as transparent container
    if (node.type === 'structuredContent' && Array.isArray(node.content)) {
      structuredContentNodeToBlocks(inlineConverterParams);
      return;
    }

    // SDT fieldAnnotation: create FieldAnnotationRun for pill-style rendering
    if (node.type === 'fieldAnnotation') {
      const run = fieldAnnotationNodeToRun(inlineConverterParams);
      currentRuns.push(run);
      return;
    }

    if (node.type === 'pageReference') {
      const run = pageReferenceNodeToBlock(inlineConverterParams);
      if (run) {
        currentRuns.push(run);
      }
      return;
    }

    if (node.type === 'bookmarkStart') {
      bookmarkStartNodeToBlocks(inlineConverterParams);
      return;
    }

    if (node.type === 'tab') {
      const tabRun = tabNodeToRun(inlineConverterParams);
      tabOrdinal += 1;
      if (tabRun) {
        currentRuns.push(tabRun);
      }
      return;
    }

    if (TOKEN_INLINE_TYPES.has(node.type)) {
      const tokenRun = tokenNodeToRun(inlineConverterParams);
      if (tokenRun) {
        currentRuns.push(tokenRun);
      }
      return;
    }

    if (node.type === 'image') {
      try {
        const imageRun = imageNodeToRun(inlineConverterParams);
        if (imageRun) {
          currentRuns.push(imageRun);
        }
      } catch (error) {
        if (error instanceof NotInlineNodeError) {
          const anchorParagraphId = nextId();
          flushParagraph();
          const imageBlock = handleImageNode(node, {
            blocks,
            nextBlockId,
            positions,
            trackedChangesConfig,
            defaultFont,
            defaultSize,
            converterContext,
            hyperlinkConfig,
            enableComments,
            bookmarks,
            converters,
          });
          if (imageBlock) {
            attachAnchorParagraphId(imageBlock, anchorParagraphId);
          }
        } else {
          throw error;
        }
      }

      return;
    }

    if (node.type === 'contentBlock') {
      const block = inlineContentBlockConverter(inlineConverterParams);
      if (block) {
        const anchorParagraphId = nextId();
        flushParagraph();
        blocks.push(attachAnchorParagraphId(block, anchorParagraphId));
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
    trackedChangesConfig,
    bookmarks,
    hyperlinkConfig,
    sectionState,
    converters,
    converterContext,
    themeColors,
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

  const paragraphBlocks = paragraphToFlowBlocks({
    para: node,
    nextBlockId,
    positions,
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
    recordBlockKind?.(block.kind);
  });

  sectionState!.currentParagraphIndex++;
}
