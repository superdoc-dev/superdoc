import { Decoration } from 'prosemirror-view';
import { calculateTabWidth } from '@superdoc/contracts';
import { twipsToPixels } from '@superdoc/word-layout';
import {
  defaultLineLength,
  defaultTabDistance,
  findParagraphContext,
  flattenParagraph,
  measureRangeWidth,
  calcTabHeight,
  getBlockNodeWidth,
  getIndentWidth,
  extractParagraphContext,
} from './tabDecorations.js';
import { getParagraphContext } from './paragraphContextCache.js';

const leaderStyles = {
  dot: 'border-bottom: 1px dotted black;',
  heavy: 'border-bottom: 2px solid black;',
  hyphen: 'border-bottom: 1px solid black;',
  middleDot: 'border-bottom: 1px dotted black; margin-bottom: 2px;',
  underscore: 'border-bottom: 1px solid black;',
};

// Create a stable paragraph ID from its start position.
const paragraphIdFromPos = (startPos) => `para-${startPos}`;
const tabIdForIndex = (paragraphId, index) => `${paragraphId}-tab-${index}`;

/**
 * Build a layout request for a given paragraph.
 * @param {import('prosemirror-model').Node} doc
 * @param {number} paragraphPos
 * @param {import('prosemirror-view').EditorView} view
 * @param {any} helpers
 * @param {number} revision
 * @param {number} [paragraphWidthOverride]
 * @returns {import('../types.js').LayoutRequest|null}
 */
export function createLayoutRequest(doc, paragraphPos, view, helpers, revision, paragraphWidthOverride) {
  const $pos = doc.resolve(paragraphPos);
  const paragraphCache = new Map();
  const paragraphContext = findParagraphContext($pos, paragraphCache, helpers);
  if (!paragraphContext) return null;

  const paragraphId = paragraphIdFromPos(paragraphContext.startPos);

  const paragraphNode = paragraphContext.paragraph;
  const cachedContext = getParagraphContext(paragraphNode, paragraphContext.startPos, helpers, revision, () =>
    extractParagraphContext(paragraphNode, paragraphContext.startPos, helpers, paragraphContext.paragraphDepth),
  );
  const effectiveContext = cachedContext || paragraphContext;
  const { entries } = flattenParagraph(paragraphNode, paragraphContext.startPos);

  const spans = [];
  let tabIndex = 0;
  entries.forEach((entry, idx) => {
    const node = entry.node;
    const spanId = `${paragraphId}-span-${idx}`;
    const from = entry.pos;
    const to = entry.pos + node.nodeSize;

    if (node.type.name === 'tab') {
      spans.push({
        type: 'tab',
        spanId,
        tabId: tabIdForIndex(paragraphId, tabIndex++),
        pos: entry.pos,
        nodeSize: node.nodeSize,
      });
    } else if (node.type.name === 'lineBreak' || node.type.name === 'hardBreak') {
      // Track line breaks to reset tab position calculation on new lines.
      // Without this, tabs after line breaks would be measured from the
      // previous line's position instead of the start of the new line.
      spans.push({
        type: node.type.name,
        spanId,
        pos: entry.pos,
        nodeSize: node.nodeSize,
      });
    } else if (node.type.name === 'text') {
      spans.push({
        type: 'text',
        spanId,
        text: node.text || '',
        style: node.marks?.find((mark) => mark.type.name === 'textStyle')?.attrs || {},
        from,
        to,
      });
    }
  });

  // Convert tab stops (twips → px) and add implicit hanging indent stop if needed
  const tabStops = Array.isArray(effectiveContext.tabStops) ? [...effectiveContext.tabStops] : [];

  const hangingPx = twipsToPixels(Number(effectiveContext.indent?.hanging) || 0);
  if (hangingPx > 0 && effectiveContext.indentWidth != null) {
    tabStops.unshift({ val: 'start', pos: effectiveContext.indentWidth + hangingPx, leader: 'none' });
  }

  const paragraphWidth =
    paragraphWidthOverride ?? getBlockNodeWidth(view, effectiveContext.startPos) ?? defaultLineLength;

  const indentWidth =
    effectiveContext.indentWidth ?? getIndentWidth(view, effectiveContext.startPos, effectiveContext.indent);

  return {
    paragraphId,
    revision,
    paragraphWidth,
    defaultTabDistance,
    defaultLineLength,
    indents: {
      left: twipsToPixels(Number(effectiveContext.indent?.left) || 0),
      right: twipsToPixels(Number(effectiveContext.indent?.right) || 0),
      firstLine: twipsToPixels(Number(effectiveContext.indent?.firstLine) || 0),
      hanging: hangingPx,
    },
    tabStops,
    spans,
    indentWidth,
    paragraphNode,
  };
}

/**
 * Compute tab layouts for a layout request using either provided measurement callbacks or ProseMirror view.
 * @param {import('../types.js').LayoutRequest} request
 * @param {{ measureText?: (spanId:string, text:string)=>number }} [measurement]
 * @param {import('prosemirror-view').EditorView} [view]
 * @returns {import('../types.js').LayoutResult}
 */
export function calculateTabLayout(request, measurement, view) {
  const {
    spans,
    tabStops,
    paragraphWidth,
    defaultTabDistance,
    defaultLineLength,
    paragraphId,
    revision,
    indentWidth = 0,
    paragraphNode,
  } = request;

  const tabs = {};

  // Calculate the effective text-indent (CSS text-indent only applies to first line).
  // We need this to determine where wrapped lines start (margin-left without text-indent).
  // This mirrors the CSS encoding logic in styles.js:
  // - If firstLine and no hanging: text-indent = firstLine
  // - If firstLine and hanging: text-indent = firstLine - hanging
  // - If no firstLine but hanging: text-indent = -hanging
  let effectiveTextIndent = 0;
  const { firstLine, hanging, left: leftIndent } = request.indents || {};
  if (firstLine != null && !hanging) {
    effectiveTextIndent = firstLine;
  } else if (firstLine != null && hanging != null) {
    effectiveTextIndent = firstLine - hanging;
  } else if (firstLine == null && hanging != null) {
    effectiveTextIndent = -hanging;
  }

  // wrappedLineStartX is where text starts on wrapped lines (no text-indent).
  // Since indentWidth = margin-left + text-indent (first line position),
  // wrapped lines start at indentWidth - effectiveTextIndent.
  const wrappedLineStartX = indentWidth - effectiveTextIndent;
  let currentX = indentWidth;

  const measureText = (span) => {
    if (measurement?.measureText) return measurement.measureText(span.spanId, span.text || '');
    if (view && typeof span.from === 'number' && typeof span.to === 'number') {
      return measureRangeWidth(view, span.from, span.to);
    }
    return 0;
  };

  // Precompute tab heights once
  const tabHeight = paragraphNode ? calcTabHeight(paragraphNode) : undefined;

  // Threshold for detecting when content has reached the end of a line.
  // When currentX is within this many pixels of paragraphWidth, we consider
  // the line "full" and subsequent content will wrap to the next line.
  const softWrapThreshold = 5;

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span.type === 'text') {
      // Check if text would cause a soft wrap (content exceeds paragraph width).
      // In Word, when text cannot fit on the current line, it wraps to the next line
      // starting at the wrapped line position (margin-left without text-indent).
      // This handles the By:/Name:/Title: signature pattern.
      const textWidth = measureText(span);
      const wouldWrap = currentX + textWidth > paragraphWidth + softWrapThreshold;

      if (wouldWrap) {
        // Text wraps to new line - reset to wrapped line start position
        currentX = wrappedLineStartX;
      }
      currentX += textWidth;
    } else if (span.type === 'lineBreak' || span.type === 'hardBreak') {
      // Reset horizontal position to wrapped line start for the new line
      currentX = wrappedLineStartX;
    } else if (span.type === 'tab') {
      const followingText = collectFollowingText(spans, i + 1);

      // Create measureText callback that can measure the following text
      // For center/right/decimal alignment, we need to measure the text width
      let measureTextCallback;
      if (measurement?.measureText) {
        measureTextCallback = (text) => measurement.measureText(span.spanId, text);
      } else if (view) {
        // Measure using view by finding the range of the following text spans
        const followingRange = getFollowingTextRange(spans, i + 1);
        if (followingRange) {
          // Cache the full following text width
          const fullWidth = measureRangeWidth(view, followingRange.from, followingRange.to);
          const fullText = followingText;
          measureTextCallback = (text) => {
            // If measuring the full text, return the measured width
            if (text === fullText) return fullWidth;
            // For partial text (decimal alignment), estimate proportionally
            if (fullText.length > 0) {
              return (text.length / fullText.length) * fullWidth;
            }
            return 0;
          };
        }
      }

      const result = calculateTabWidth({
        currentX,
        tabStops,
        paragraphWidth,
        defaultTabDistance,
        defaultLineLength,
        followingText,
        measureText: measureTextCallback,
      });

      tabs[span.tabId] = {
        width: result.width,
        height: tabHeight,
        leader: result.leader,
        alignment: result.alignment,
        tabStopPosUsed: result.tabStopPosUsed,
      };
      currentX += result.width;

      // Handle soft line wrap after tab: if the tab extends to or near the paragraph width,
      // any content following this tab will wrap to a new line starting at wrapped line position.
      // This matches Word's behavior for signature blocks where tabs fill to the right margin.
      const tabWouldWrap = currentX >= paragraphWidth - softWrapThreshold;
      if (tabWouldWrap) {
        currentX = wrappedLineStartX;
      }
    }
  }

  return {
    paragraphId,
    revision,
    tabs,
  };
}

/**
 * Maximum recursion depth for walk function to prevent stack overflow.
 * A depth of 50 should be sufficient for any reasonable document structure.
 */
const MAX_WALK_DEPTH = 50;

/**
 * Convert layout results to ProseMirror decorations (editor-surface consumer).
 * @param {import('../types.js').LayoutResult} result
 * @param {import('prosemirror-model').Node} paragraph
 * @param {number} paragraphPos // position before paragraph
 * @returns {Decoration[]}
 */
export function applyLayoutResult(result, paragraph, paragraphPos) {
  const decorations = [];

  let tabIndex = 0;

  /**
   * Walk the paragraph tree (including run children) and apply decorations to any tab nodes.
   *
   * This function recursively traverses the ProseMirror document tree to find tab nodes
   * and apply layout-based styling decorations. It handles both flat paragraph structures
   * and nested run structures (OOXML documents).
   *
   * @param {import('prosemirror-model').Node} node - The current node being processed
   * @param {number} pos - Position immediately before the current node in the document
   * @param {number} depth - Current recursion depth (default 0), used to prevent stack overflow
   *
   * @remarks
   * - Guards against excessive recursion (MAX_WALK_DEPTH = 50)
   * - Validates node.type.name and node.nodeSize before processing
   * - Skips tabs without layout data in result.tabs
   * - Catches and logs errors during recursion to prevent breaking the entire decoration process
   */
  const walk = (node, pos, depth = 0) => {
    // Guard against excessive recursion depth
    if (depth > MAX_WALK_DEPTH) {
      console.error(`applyLayoutResult: Maximum recursion depth (${MAX_WALK_DEPTH}) exceeded`);
      return;
    }

    // Guard against missing node.type or node.type.name
    if (!node?.type?.name) {
      console.error('applyLayoutResult: Node missing type.name', { node, pos, depth });
      return;
    }

    // Guard against invalid nodeSize
    if (typeof node.nodeSize !== 'number' || node.nodeSize < 0 || !Number.isFinite(node.nodeSize)) {
      console.error('applyLayoutResult: Invalid nodeSize', { nodeSize: node.nodeSize, nodeName: node.type.name, pos });
      return;
    }

    if (node.type.name === 'tab') {
      const tabId = tabIdForIndex(result.paragraphId, tabIndex++);
      const layout = result.tabs[tabId];
      if (layout) {
        let style = `width: ${layout.width}px;`;
        if (layout.height) style += ` height: ${layout.height};`;
        if (layout.leader && leaderStyles[layout.leader]) {
          style += ` ${leaderStyles[layout.leader]}`;
        }
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { style }));
      }
      return;
    }

    // Recurse into children to reach tabs inside run nodes (OOXML structure)
    // Wrap in try-catch to prevent errors from breaking the entire decoration process
    try {
      let offset = 0;
      node.forEach((child) => {
        const childPos = pos + 1 + offset;
        walk(child, childPos, depth + 1);
        offset += child.nodeSize;
      });
    } catch (error) {
      console.error('applyLayoutResult: Error during recursion', {
        error,
        nodeName: node.type.name,
        pos,
        depth,
      });
    }
  };

  walk(paragraph, paragraphPos);
  return decorations;
}

/**
 * Collect text content following a tab until the next tab, line break, or end of paragraph.
 *
 * Used for center/right/decimal tab alignment calculations, where the width of
 * following text determines the tab's rendered width. Stops at line breaks because
 * text after a line break belongs to a new line and should not affect the current tab.
 *
 * @param {Array} spans - Array of span objects (text, tab, lineBreak, hardBreak) from flattenParagraph
 * @param {number} startIndex - Index in spans array to start collecting from (exclusive)
 * @returns {string} Concatenated text from all text spans until next tab, line break, or end
 */
function collectFollowingText(spans, startIndex) {
  let text = '';
  for (let i = startIndex; i < spans.length; i++) {
    const span = spans[i];
    if (span.type === 'tab' || span.type === 'lineBreak' || span.type === 'hardBreak') break;
    if (span.type === 'text') text += span.text || '';
  }
  return text;
}

/**
 * Get the document range (from/to positions) of text spans following a tab.
 *
 * Used to measure text width for center/right/decimal alignment using ProseMirror's
 * DOM measurement utilities. Returns the document positions of the first and last
 * text spans following a tab. Stops at line breaks because text after a line break
 * belongs to a new line and should not affect the current tab's alignment.
 *
 * @param {Array} spans - Array of span objects (text, tab, lineBreak, hardBreak) from flattenParagraph
 * @param {number} startIndex - Index in spans array to start searching from (exclusive)
 * @returns {{from: number, to: number}|null} Document range of following text, or null if no text found
 */
function getFollowingTextRange(spans, startIndex) {
  let from = null;
  let to = null;
  for (let i = startIndex; i < spans.length; i++) {
    const span = spans[i];
    if (span.type === 'tab' || span.type === 'lineBreak' || span.type === 'hardBreak') break;
    if (span.type === 'text' && typeof span.from === 'number' && typeof span.to === 'number') {
      if (from === null) from = span.from;
      to = span.to;
    }
  }
  if (from !== null && to !== null) {
    return { from, to };
  }
  return null;
}
