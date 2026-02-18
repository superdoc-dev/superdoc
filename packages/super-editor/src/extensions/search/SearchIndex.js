// @ts-nocheck

/**
 * Segment kinds in the flattened document
 * @typedef {'text' | 'blockSep' | 'hardBreak' | 'atom'} SegmentKind
 */

/**
 * A segment mapping offset range to document positions
 * @typedef {Object} Segment
 * @property {number} offsetStart - Start offset in flattened string
 * @property {number} offsetEnd - End offset in flattened string
 * @property {number} docFrom - Start position in document
 * @property {number} docTo - End position in document
 * @property {SegmentKind} kind - Type of segment
 */

/**
 * A document range
 * @typedef {Object} DocRange
 * @property {number} from - Start position in document
 * @property {number} to - End position in document
 */

const BLOCK_SEPARATOR = '\n';
const ATOM_PLACEHOLDER = '\ufffc';

/**
 * SearchIndex provides a lazily-built, cached index for searching across
 * the entire document including cross-paragraph matches.
 *
 * Uses ProseMirror's textBetween for flattening and maintains a segment
 * map for mapping string offsets back to document positions.
 */
export class SearchIndex {
  /** @type {string} */
  text = '';

  /** @type {Segment[]} */
  segments = [];

  /** @type {boolean} */
  valid = false;

  /** @type {number} */
  docSize = 0;

  /** @type {import('prosemirror-model').Node | null} */
  doc = null;

  /**
   * Build the search index from a ProseMirror document.
   * Uses doc.textBetween for the flattened string and walks
   * the document to build the segment offset map.
   *
   * @param {import('prosemirror-model').Node} doc - The ProseMirror document
   */
  build(doc) {
    // Get the flattened text using ProseMirror's optimized textBetween
    this.text = doc.textBetween(0, doc.content.size, BLOCK_SEPARATOR, ATOM_PLACEHOLDER);
    this.segments = [];
    this.docSize = doc.content.size;
    this.doc = doc;

    // Walk the document to build the segment map
    // Note: doc node's content starts at position 0 (doc has no opening tag)
    let offset = 0;
    this.#walkNodeContent(doc, 0, offset, (segment) => {
      this.segments.push(segment);
      offset = segment.offsetEnd;
    });

    this.valid = true;
  }

  /**
   * Walk the content of a node to build segments.
   * This method processes the children of a node, given the position
   * where the node's content starts.
   *
   * @param {import('prosemirror-model').Node} node - Current node
   * @param {number} contentStart - Document position where this node's content starts
   * @param {number} offset - Current offset in flattened string
   * @param {(segment: Segment) => void} addSegment - Callback to add a segment
   * @returns {number} The new offset after processing this node's content
   */
  #walkNodeContent(node, contentStart, offset, addSegment) {
    let currentOffset = offset;
    let isFirstChild = true;

    node.forEach((child, childContentOffset) => {
      const childDocPos = contentStart + childContentOffset;

      // Add block separator before block children (except first)
      if (child.isBlock && !isFirstChild) {
        addSegment({
          offsetStart: currentOffset,
          offsetEnd: currentOffset + 1,
          docFrom: childDocPos,
          docTo: childDocPos,
          kind: 'blockSep',
        });
        currentOffset += 1;
      }

      currentOffset = this.#walkNode(child, childDocPos, currentOffset, addSegment);
      isFirstChild = false;
    });

    return currentOffset;
  }

  /**
   * Recursively walk a node and its descendants to build segments.
   *
   * @param {import('prosemirror-model').Node} node - Current node
   * @param {number} docPos - Document position at start of this node
   * @param {number} offset - Current offset in flattened string
   * @param {(segment: Segment) => void} addSegment - Callback to add a segment
   * @returns {number} The new offset after processing this node
   */
  #walkNode(node, docPos, offset, addSegment) {
    if (node.isText) {
      // Text node: add a text segment
      const text = node.text || '';
      if (text.length > 0) {
        addSegment({
          offsetStart: offset,
          offsetEnd: offset + text.length,
          docFrom: docPos,
          docTo: docPos + text.length,
          kind: 'text',
        });
        return offset + text.length;
      }
      return offset;
    }

    if (node.isLeaf) {
      // Leaf node (atom): check if it's a hard_break or other atom
      if (node.type.name === 'hard_break') {
        addSegment({
          offsetStart: offset,
          offsetEnd: offset + 1,
          docFrom: docPos,
          docTo: docPos + node.nodeSize,
          kind: 'hardBreak',
        });
        return offset + 1;
      }
      // Other atoms get the replacement character
      addSegment({
        offsetStart: offset,
        offsetEnd: offset + 1,
        docFrom: docPos,
        docTo: docPos + node.nodeSize,
        kind: 'atom',
      });
      return offset + 1;
    }

    // For non-leaf nodes, recurse into content
    // Content starts at docPos + 1 (after opening tag)
    return this.#walkNodeContent(node, docPos + 1, offset, addSegment);
  }

  /**
   * Mark the index as stale. It will be rebuilt on next search.
   */
  invalidate() {
    this.valid = false;
  }

  /**
   * Check if the index needs rebuilding for the given document.
   *
   * @param {import('prosemirror-model').Node} doc - The document to check against
   * @returns {boolean} True if index is stale and needs rebuilding
   */
  isStale(doc) {
    return !this.valid || this.doc !== doc;
  }

  /**
   * Ensure the index is valid for the given document.
   * Rebuilds if stale.
   *
   * @param {import('prosemirror-model').Node} doc - The document
   */
  ensureValid(doc) {
    if (this.isStale(doc)) {
      this.build(doc);
    }
  }

  /**
   * Convert an offset range in the flattened string to document ranges.
   * Skips separator/atom segments and returns only text ranges.
   *
   * @param {number} start - Start offset in flattened string
   * @param {number} end - End offset in flattened string
   * @returns {DocRange[]} Array of document ranges (text segments only)
   */
  offsetRangeToDocRanges(start, end) {
    const ranges = [];

    for (const segment of this.segments) {
      // Skip segments entirely before our range
      if (segment.offsetEnd <= start) continue;
      // Stop if we're past our range
      if (segment.offsetStart >= end) break;

      // Only include text segments in the result
      if (segment.kind !== 'text') continue;

      // Calculate the overlap
      const overlapStart = Math.max(start, segment.offsetStart);
      const overlapEnd = Math.min(end, segment.offsetEnd);

      if (overlapStart < overlapEnd) {
        // Map the overlap back to document positions
        const startInSegment = overlapStart - segment.offsetStart;
        const endInSegment = overlapEnd - segment.offsetStart;

        ranges.push({
          from: segment.docFrom + startInSegment,
          to: segment.docFrom + endInSegment,
        });
      }
    }

    return ranges;
  }

  /**
   * Find the document position for a given offset in the flattened string.
   *
   * @param {number} offset - Offset in flattened string
   * @returns {number|null} Document position, or null if not found
   */
  offsetToDocPos(offset) {
    for (const segment of this.segments) {
      if (offset >= segment.offsetStart && offset < segment.offsetEnd) {
        if (segment.kind === 'text') {
          return segment.docFrom + (offset - segment.offsetStart);
        }
        // For non-text segments, return the start of the segment
        return segment.docFrom;
      }
    }
    // If offset is at the very end, return the end of the last segment
    if (this.segments.length > 0 && offset === this.segments[this.segments.length - 1].offsetEnd) {
      const lastSeg = this.segments[this.segments.length - 1];
      return lastSeg.docTo;
    }
    return null;
  }

  /**
   * Escape special regex characters in a string.
   *
   * @param {string} str - String to escape
   * @returns {string} Escaped string safe for use in RegExp
   */
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Convert a plain search string to a whitespace-flexible regex pattern.
   * This allows matching across paragraph boundaries.
   *
   * @param {string} searchString - The search string
   * @returns {string} Regex pattern string
   */
  static toFlexiblePattern(searchString) {
    const hasLeadingWhitespace = /^[\s\u00a0]+/.test(searchString);
    const hasTrailingWhitespace = /[\s\u00a0]+$/.test(searchString);
    const trimmed = searchString.replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, '');
    // Split by whitespace (including non-breaking spaces), escape each part, rejoin with flexible whitespace pattern
    const parts = trimmed.split(/[\s\u00a0]+/).filter((part) => part.length > 0);
    if (parts.length === 0) {
      return hasLeadingWhitespace || hasTrailingWhitespace ? '[\\s\\u00a0]+' : '';
    }
    const blockSeparatorPattern = '(?:\\n)*';
    const escapedParts = parts.map((part) => {
      const chars = Array.from(part);
      return chars.map((ch) => SearchIndex.escapeRegex(ch)).join(blockSeparatorPattern);
    });
    let pattern = escapedParts.join('[\\s\\u00a0]+');
    if (hasLeadingWhitespace) {
      pattern = '[\\s\\u00a0]+' + pattern;
    }
    if (hasTrailingWhitespace) {
      pattern = pattern + '[\\s\\u00a0]+';
    }
    return pattern;
  }

  /**
   * Search the index for matches.
   *
   * @param {string | RegExp} pattern - Search pattern (string or regex)
   * @param {Object} options - Search options
   * @param {boolean} [options.caseSensitive=false] - Case sensitive search
   * @param {number} [options.maxMatches=1000] - Maximum number of matches to return
   * @returns {Array<{start: number, end: number, text: string}>} Array of matches with offsets
   */
  search(pattern, options = {}) {
    const { caseSensitive = false, maxMatches = 1000 } = options;
    const matches = [];

    let regex;
    if (pattern instanceof RegExp) {
      // Use the regex directly, but ensure it has the global flag
      const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
      regex = new RegExp(pattern.source, flags);
    } else if (typeof pattern === 'string') {
      if (pattern.length === 0) return matches;
      // Convert to flexible whitespace pattern for cross-paragraph matching
      const flexiblePattern = SearchIndex.toFlexiblePattern(pattern);
      if (flexiblePattern.length === 0) return matches;
      const flags = caseSensitive ? 'g' : 'gi';
      regex = new RegExp(flexiblePattern, flags);
    } else {
      return matches;
    }

    let match;
    while ((match = regex.exec(this.text)) !== null && matches.length < maxMatches) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    return matches;
  }
}
