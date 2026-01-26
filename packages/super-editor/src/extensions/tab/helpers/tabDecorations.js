import { Decoration } from 'prosemirror-view';
import { twipsToPixels } from '@superdoc/word-layout';
import { getResolvedParagraphProperties } from '@extensions/paragraph/resolvedPropertiesCache.js';

export const defaultTabDistance = 48;
export const defaultLineLength = 816;

export const getTabDecorations = (doc, view, helpers, from = 0, to = null) => {
  const decorations = [];
  const paragraphCache = new Map();
  const coordCache = new Map();
  const domPosCache = new Map();

  const end = to ?? doc.content.size;

  doc.nodesBetween(from, end, (node, pos) => {
    if (node.type.name !== 'tab') return;

    const $pos = doc.resolve(pos);
    const paragraphContext = findParagraphContext($pos, paragraphCache, helpers);
    if (!paragraphContext) return;

    const blockParent = $pos.node(paragraphContext.paragraphDepth);
    const style = calculateTabStyle(node.nodeSize, view, pos, blockParent, paragraphContext, coordCache, domPosCache);

    if (style) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          style,
        }),
      );
    }
  });

  return decorations;
};

export function calculateTabStyle(
  nodeSize,
  view,
  pos,
  blockParent,
  paragraphContext,
  coordCache = null,
  domPosCache = null,
) {
  let extraStyles = '';
  try {
    const { tabStops, flattened, positionMap, startPos } = paragraphContext;
    // Cache paragraph-level computed values (computed once per paragraph, not per tab)
    if (paragraphContext.indentWidth === undefined) {
      paragraphContext.indentWidth = getIndentWidth(view, startPos, paragraphContext.indent, coordCache, domPosCache);
    }
    if (paragraphContext.tabHeight === undefined) {
      paragraphContext.tabHeight = calcTabHeight(blockParent);
    }
    if (paragraphContext.paragraphWidth === undefined) {
      paragraphContext.paragraphWidth = getBlockNodeWidth(view, startPos);
    }

    const indentWidth = paragraphContext.indentWidth;
    const hanging = twipsToPixels(Number(paragraphContext.indent.hanging) || 0);
    if (hanging > 0) {
      // Word places an implicit tab stop at the hanging indent position
      tabStops.unshift({ val: 'start', pos: indentWidth + hanging });
    }
    const accumulatedTabWidth = paragraphContext.accumulatedTabWidth || 0;
    const currentWidth =
      indentWidth + measureRangeWidth(view, startPos + 1, pos, coordCache, domPosCache) + accumulatedTabWidth;

    let tabWidth;
    if (tabStops.length) {
      const tabStop = tabStops.find((stop) => stop.pos > currentWidth && stop.val !== 'clear');
      if (tabStop) {
        tabWidth = Math.min(tabStop.pos, paragraphContext.paragraphWidth) - currentWidth;
        let val = tabStop.val;
        const aliases = { left: 'start', right: 'end' };
        if (aliases[val]) val = aliases[val];

        if (val === 'center' || val === 'end' || val === 'right') {
          // Use O(1) map lookup instead of O(n) findIndex
          const entryIndex = positionMap.get(pos);
          if (entryIndex === undefined) return;

          const nextTabIndex = findNextTabIndex(flattened, entryIndex + 1);
          const segmentStartPos = pos + nodeSize;
          const segmentEndPos =
            nextTabIndex === -1 ? startPos + paragraphContext.paragraph.nodeSize - 1 : flattened[nextTabIndex].pos;
          const segmentWidth = measureRangeWidth(view, segmentStartPos, segmentEndPos, coordCache, domPosCache);
          tabWidth -= val === 'center' ? segmentWidth / 2 : segmentWidth;
        } else if (val === 'decimal' || val === 'num') {
          // Use O(1) map lookup instead of O(n) findIndex
          const entryIndex = positionMap.get(pos);
          if (entryIndex === undefined) return;

          const breakChar = tabStop.decimalChar || '.';
          const decimalPos = findDecimalBreakPos(flattened, entryIndex + 1, breakChar);
          const integralWidth = decimalPos
            ? measureRangeWidth(view, pos + nodeSize, decimalPos, coordCache, domPosCache)
            : measureRangeWidth(
                view,
                pos + nodeSize,
                startPos + paragraphContext.paragraph.nodeSize - 1,
                coordCache,
                domPosCache,
              );
          tabWidth -= integralWidth;
        }

        if (tabStop.leader) {
          const leaderStyles = {
            dot: 'border-bottom: 1px dotted black;',
            heavy: 'border-bottom: 2px solid black;',
            hyphen: 'border-bottom: 1px solid black;',
            middleDot: 'border-bottom: 1px dotted black; margin-bottom: 2px;',
            underscore: 'border-bottom: 1px solid black;',
          };
          extraStyles += leaderStyles[tabStop.leader] || '';
        }
      }
    }

    if (!tabWidth || tabWidth < 1) {
      tabWidth = defaultTabDistance - ((currentWidth % defaultLineLength) % defaultTabDistance);
      if (tabWidth === 0) tabWidth = defaultTabDistance;
    }

    // Use cached tabHeight (computed once per paragraph)
    const tabHeight = paragraphContext.tabHeight;

    paragraphContext.accumulatedTabWidth = accumulatedTabWidth + tabWidth;
    return `width: ${tabWidth}px; height: ${tabHeight}; ${extraStyles}`;
  } catch {
    return null;
  }
}

export function findParagraphContext($pos, cache, helpers) {
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node?.type?.name === 'paragraph') {
      const startPos = $pos.start(depth);
      if (!cache.has(startPos)) {
        const paragraphContext = extractParagraphContext(node, startPos, helpers, depth);
        cache.set(startPos, paragraphContext);
      }
      return cache.get(startPos);
    }
  }
  return null;
}

/**
 * Extract paragraph context for tab layout calculations.
 *
 * @param {import('prosemirror-model').Node} node - The paragraph node
 * @param {number} startPos - Document position where the paragraph starts
 * @param {any} helpers - Helper functions for document operations
 * @param {number} [depth=0] - Nesting depth of the paragraph
 * @returns {Object} Paragraph context with tabStops, indent, and flattened content
 */
export function extractParagraphContext(node, startPos, helpers, depth = 0) {
  // Prefer resolved props from style resolution; fall back to raw attrs so
  // indent/tabStops are available before full resolution completes
  const paragraphProperties = getResolvedParagraphProperties(node) ?? node.attrs?.paragraphProperties ?? {};
  // Map OOXML alignment values to internal values (for RTL support)
  const alignmentAliases = { left: 'start', right: 'end' };
  let tabStops = [];

  if (Array.isArray(paragraphProperties.tabStops)) {
    tabStops = paragraphProperties.tabStops
      .map((stop) => {
        const ref = stop?.tab;
        // Handle pre-processed stops (from createLayoutRequest) that already have pos in twips
        if (!ref && stop?.pos != null) {
          return {
            ...stop,
            pos: twipsToPixels(Number(stop.pos) || 0),
          };
        }
        if (!ref) return stop || null;
        const rawType = ref.tabType || 'start';
        const mappedVal = alignmentAliases[rawType] || rawType;
        return {
          val: mappedVal,
          pos: twipsToPixels(Number(ref.pos) || 0),
          leader: ref.leader,
        };
      })
      .filter(Boolean);
  }

  const { entries, positionMap } = flattenParagraph(node, startPos);
  return {
    paragraph: node,
    paragraphDepth: depth,
    startPos,
    indent: paragraphProperties.indent || {},
    tabStops: tabStops,
    flattened: entries,
    positionMap: positionMap, // Store position map for O(1) lookups
    accumulatedTabWidth: 0,
  };
}

export function flattenParagraph(paragraph, paragraphStartPos) {
  const entries = [];
  const positionMap = new Map(); // Map from position to index for O(1) lookup

  const walk = (node, basePos) => {
    if (!node) return;
    if (node.type?.name === 'run') {
      node.forEach((child, offset) => {
        const childPos = basePos + offset + 1;
        walk(child, childPos);
      });
      return;
    }
    const pos = basePos - 1;
    const index = entries.length;
    entries.push({ node, pos });
    positionMap.set(pos, index); // Store position -> index mapping
  };

  paragraph.forEach((child, offset) => {
    const childPos = paragraphStartPos + offset + 1;
    walk(child, childPos);
  });

  return { entries, positionMap };
}

export function findNextTabIndex(flattened, fromIndex) {
  for (let i = fromIndex; i < flattened.length; i++) {
    if (flattened[i]?.node?.type?.name === 'tab') {
      return i;
    }
  }
  return -1;
}

export function findDecimalBreakPos(flattened, startIndex, breakChar) {
  if (!breakChar) return null;
  for (let i = startIndex; i < flattened.length; i++) {
    const entry = flattened[i];
    if (!entry) break;
    if (entry.node.type?.name === 'tab') break;
    if (entry.node.type?.name === 'text') {
      const index = entry.node.text?.indexOf(breakChar);
      if (index !== undefined && index !== -1) {
        return entry.pos + index + 1;
      }
    }
  }
  return null;
}

export function measureRangeWidth(view, from, to, coordCache = null, domPosCache = null) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  try {
    const range = document.createRange();
    const fromRef = getCachedDomAtPos(view, from, domPosCache);
    const toRef = getCachedDomAtPos(view, to, domPosCache);
    range.setStart(fromRef.node, fromRef.offset);
    range.setEnd(toRef.node, toRef.offset);
    const rect = range.getBoundingClientRect();
    range.detach?.();
    // If getBoundingClientRect returns 0 (e.g., HappyDOM), fall back to coordsAtPos
    if (rect.width > 0) {
      return rect.width;
    }
  } catch {
    // Fall through to coordsAtPos fallback
  }
  // Fallback: use view.coordsAtPos difference (works in test mocks and when Range fails)
  const startLeft = getLeftCoord(view, from, coordCache, domPosCache);
  const endLeft = getLeftCoord(view, to, coordCache, domPosCache);
  if (startLeft == null || endLeft == null) return 0;
  return Math.max(0, endLeft - startLeft);
}

export function getIndentWidth(view, paragraphStartPos, indentAttrs = {}, coordCache = null, domPosCache = null) {
  const marginLeft = getLeftCoord(view, paragraphStartPos, coordCache, domPosCache);
  const lineLeft = getLeftCoord(view, paragraphStartPos + 1, coordCache, domPosCache);
  if (marginLeft != null && lineLeft != null) {
    const diff = lineLeft - marginLeft;
    if (!Number.isNaN(diff) && Math.abs(diff) > 0.5) {
      return diff;
    }
  }
  return calculateIndentFallback(indentAttrs);
}

export function getBlockNodeWidth(view, blockStartPos) {
  const blockDom = view.nodeDOM(blockStartPos - 1);
  // Calculate full width including margins, paddings, borders
  if (blockDom instanceof HTMLElement) {
    const styles = window.getComputedStyle(blockDom);
    const width =
      blockDom.clientWidth +
      parseFloat(styles.marginLeft || '0') +
      parseFloat(styles.marginRight || '0') +
      parseFloat(styles.borderLeftWidth || '0') +
      parseFloat(styles.borderRightWidth || '0') +
      parseFloat(styles.paddingLeft || '0') +
      parseFloat(styles.paddingRight || '0');
    return width;
  }
  return defaultLineLength;
}

export function calculateIndentFallback(indentAttrs = {}) {
  if (!indentAttrs) return 0;

  const left = twipsToPixels(Number(indentAttrs.left) || 0);
  const firstLine = twipsToPixels(Number(indentAttrs.firstLine) || 0);
  const hanging = twipsToPixels(Number(indentAttrs.hanging) || 0);

  let textIndent = 0;
  if (firstLine && hanging) {
    textIndent = firstLine - hanging;
  } else if (firstLine) {
    textIndent = firstLine;
  } else if (hanging) {
    textIndent = -hanging;
  }

  if (textIndent) return left + textIndent;
  if (left) return left;
  return 0;
}

export function getLeftCoord(view, pos, coordCache = null, domPosCache = null) {
  if (!Number.isFinite(pos)) return null;

  // Check cache first
  if (coordCache && coordCache.has(pos)) {
    return coordCache.get(pos);
  }

  let result = null;
  try {
    result = view.coordsAtPos(pos).left;
  } catch {
    try {
      const ref = getCachedDomAtPos(view, pos, domPosCache);
      const range = document.createRange();
      range.setStart(ref.node, ref.offset);
      range.setEnd(ref.node, ref.offset);
      const rect = range.getBoundingClientRect();
      range.detach?.();
      result = rect.left;
    } catch {
      result = null;
    }
  }

  // Store in cache if available
  if (coordCache) {
    coordCache.set(pos, result);
  }

  return result;
}

export function getCachedDomAtPos(view, pos, domPosCache = null) {
  if (domPosCache && domPosCache.has(pos)) {
    return domPosCache.get(pos);
  }

  const result = view.domAtPos(pos);

  if (domPosCache) {
    domPosCache.set(pos, result);
  }

  return result;
}

export function calcTabHeight(blockParent) {
  const ptToPxRatio = 1.333;
  const defaultFontSize = 16;
  const defaultLineHeight = 1.1;

  const parentTextStyleMark = blockParent.firstChild?.marks?.find((mark) => mark.type.name === 'textStyle');

  const fontSize = parseInt(parentTextStyleMark?.attrs.fontSize) * ptToPxRatio || defaultFontSize;

  return `${fontSize * defaultLineHeight}px`;
}
