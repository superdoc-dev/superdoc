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
const DELETION_BARRIER = '\u0000';
const DEFAULT_SEARCH_MODEL = 'raw';

const hasTrackDeleteMark = (node) => node?.marks?.some((mark) => mark?.type?.name === 'trackDelete') ?? false;
const readLeafText = (node) => {
  const leafText = node?.type?.spec?.leafText;
  if (typeof leafText === 'function') return leafText(node);
  if (typeof leafText === 'string') return leafText;
  return ATOM_PLACEHOLDER;
};

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

  /** @type {'raw'|'visible'} */
  searchModel = DEFAULT_SEARCH_MODEL;

  /**
   * Build the search index from a ProseMirror document.
   * Uses doc.textBetween for the flattened string and walks
   * the document to build the segment offset map.
   *
   * @param {import('prosemirror-model').Node} doc - The ProseMirror document
   */
  build(doc, options = {}) {
    const searchModel = options?.searchModel === 'visible' ? 'visible' : DEFAULT_SEARCH_MODEL;

    if (searchModel === 'visible') {
      this.#buildVisible(doc);
    } else {
      // Get the flattened text using ProseMirror's optimized textBetween
      this.text = doc.textBetween(0, doc.content.size, BLOCK_SEPARATOR, readLeafText);
    }

    this.segments = [];
    this.docSize = doc.content.size;
    this.doc = doc;
    this.searchModel = searchModel;

    // Walk the document to build the segment map
    // Note: doc node's content starts at position 0 (doc has no opening tag)
    let offset = 0;
    const visibleContext = searchModel === 'visible' ? { deletionBarrierActive: false } : null;
    this.#walkNodeContent(
      doc,
      0,
      offset,
      (segment) => {
        this.segments.push(segment);
        offset = segment.offsetEnd;
      },
      searchModel,
      visibleContext,
    );

    this.valid = true;
  }

  /**
   * Build flattened text for the `visible` model, where tracked deletions
   * are removed from searchable text and replaced with a non-searchable
   * barrier to prevent false collapsed matches.
   *
   * @param {import('prosemirror-model').Node} doc
   */
  #buildVisible(doc) {
    const parts = [];
    let emittedDeletionBarrier = false;

    const appendDeletionBarrier = () => {
      if (emittedDeletionBarrier) return;
      parts.push(DELETION_BARRIER);
      emittedDeletionBarrier = true;
    };

    const walkNodeContent = (node) => {
      let isFirstChild = true;
      node.forEach((child) => {
        if (child.isBlock && !isFirstChild) {
          parts.push(BLOCK_SEPARATOR);
          emittedDeletionBarrier = false;
        }
        walkNode(child);
        isFirstChild = false;
      });
    };

    const walkNode = (node) => {
      if (node.isText) {
        const text = node.text || '';
        if (!text.length) return;

        if (hasTrackDeleteMark(node)) {
          appendDeletionBarrier();
          return;
        }

        parts.push(text);
        emittedDeletionBarrier = false;
        return;
      }

      if (node.isLeaf) {
        if (hasTrackDeleteMark(node)) {
          appendDeletionBarrier();
          return;
        }

        parts.push(readLeafText(node));
        emittedDeletionBarrier = false;
        return;
      }

      walkNodeContent(node);
    };

    walkNodeContent(doc);
    this.text = parts.join('');
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
  #walkNodeContent(node, contentStart, offset, addSegment, searchModel = DEFAULT_SEARCH_MODEL, context = null) {
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
        if (context && searchModel === 'visible') {
          context.deletionBarrierActive = false;
        }
      }

      currentOffset = this.#walkNode(child, childDocPos, currentOffset, addSegment, searchModel, context);
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
  #walkNode(node, docPos, offset, addSegment, searchModel = DEFAULT_SEARCH_MODEL, context = null) {
    if (node.isText) {
      if (searchModel === 'visible' && hasTrackDeleteMark(node)) {
        if (context?.deletionBarrierActive) {
          return offset;
        }
        addSegment({
          offsetStart: offset,
          offsetEnd: offset + 1,
          docFrom: docPos,
          docTo: docPos,
          kind: 'atom',
        });
        if (context) {
          context.deletionBarrierActive = true;
        }
        return offset + 1;
      }

      // Text node: add a text segment
      const text = node.text || '';
      if (text.length > 0) {
        if (context && searchModel === 'visible') {
          context.deletionBarrierActive = false;
        }
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
      if (searchModel === 'visible' && hasTrackDeleteMark(node)) {
        if (context?.deletionBarrierActive) {
          return offset;
        }
        addSegment({
          offsetStart: offset,
          offsetEnd: offset + 1,
          docFrom: docPos,
          docTo: docPos + node.nodeSize,
          kind: 'atom',
        });
        if (context) {
          context.deletionBarrierActive = true;
        }
        return offset + 1;
      }

      if (context && searchModel === 'visible') {
        context.deletionBarrierActive = false;
      }
      const leafText = readLeafText(node);
      if (leafText.length === 0) return offset;
      // Leaf node (atom): check if it's a hard_break or other atom
      if (node.type.name === 'hard_break') {
        addSegment({
          offsetStart: offset,
          offsetEnd: offset + leafText.length,
          docFrom: docPos,
          docTo: docPos + node.nodeSize,
          kind: 'hardBreak',
        });
        return offset + leafText.length;
      }
      // Other atoms use their declared leaf text or the replacement character.
      addSegment({
        offsetStart: offset,
        offsetEnd: offset + leafText.length,
        docFrom: docPos,
        docTo: docPos + node.nodeSize,
        kind: 'atom',
      });
      return offset + leafText.length;
    }

    // For non-leaf nodes, recurse into content
    // Content starts at docPos + 1 (after opening tag)
    return this.#walkNodeContent(node, docPos + 1, offset, addSegment, searchModel, context);
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
  isStale(doc, options = {}) {
    const searchModel = options?.searchModel === 'visible' ? 'visible' : DEFAULT_SEARCH_MODEL;
    return !this.valid || this.doc !== doc || this.searchModel !== searchModel;
  }

  /**
   * Ensure the index is valid for the given document.
   * Rebuilds if stale.
   *
   * @param {import('prosemirror-model').Node} doc - The document
   */
  ensureValid(doc, options = {}) {
    if (this.isStale(doc, options)) {
      this.build(doc, options);
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
    // A single search hit is gapless in offset space, so consecutive segments
    // (text and inline-leaf atoms like lineBreak) belong to one contiguous
    // match. Coalesce them into one doc range — otherwise a hit spanning
    // `text + lineBreak + text` yields discontiguous text ranges that the
    // downstream D5 contiguity guard rejects (SD-3278). A block separator is a
    // real split between blocks and ends the current range. The D5 guard still
    // catches genuinely separate edits, which are not offset-contiguous.
    let current = null;

    for (const segment of this.segments) {
      // Skip segments entirely before our range
      if (segment.offsetEnd <= start) continue;
      // Stop if we're past our range
      if (segment.offsetStart >= end) break;

      // Block separators split blocks; never coalesce across them.
      if (segment.kind === 'blockSep') {
        if (current) {
          ranges.push({ from: current.from, to: current.to });
          current = null;
        }
        continue;
      }

      const overlapStart = Math.max(start, segment.offsetStart);
      const overlapEnd = Math.min(end, segment.offsetEnd);
      if (overlapStart >= overlapEnd) continue;

      let from;
      let to;
      if (segment.kind === 'text') {
        from = segment.docFrom + (overlapStart - segment.offsetStart);
        to = segment.docFrom + (overlapEnd - segment.offsetStart);
      } else {
        // Inline leaf atom (lineBreak, hardBreak, image, ...): occupies its
        // whole node span and is part of the contiguous match, not a gap.
        from = segment.docFrom;
        to = segment.docTo;
      }

      // Coalesce only when the next segment is BOTH offset-contiguous (same
      // search hit) AND PM-contiguous (`from === current.to`, i.e. immediately
      // adjacent in the document). This merges `text + lineBreak + text` within
      // one run into a single range, but never bridges a document gap — a
      // skipped/tracked-deleted leaf, a run boundary, or any content the match
      // does not actually cover. A non-coalesced segment becomes its own range;
      // since it stays offset-contiguous, the downstream block coalescing still
      // sees no gap, while the D5 guard keeps rejecting genuinely separate edits.
      if (current && segment.offsetStart === current.offsetEnd && from === current.to) {
        current.to = to;
        current.offsetEnd = overlapEnd;
      } else {
        if (current) ranges.push({ from: current.from, to: current.to });
        current = { from, to, offsetEnd: overlapEnd };
      }
    }

    if (current) ranges.push({ from: current.from, to: current.to });
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

  /**
   * Pattern matching combining diacritical marks, Hebrew vowel points/cantillation,
   * and other common combining marks that should be ignored during search.
   */
  static DIACRITICS_PATTERN = /[\u0300-\u036f\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g;

  /**
   * Strip diacritics / combining marks from a string.
   * Decomposes to NFD then removes combining marks (Latin, Hebrew, etc.).
   *
   * @param {string} str - Input string
   * @returns {string} String with diacritics removed
   */
  static stripDiacritics(str) {
    return str.normalize('NFD').replace(SearchIndex.DIACRITICS_PATTERN, '');
  }

  /**
   * Build an offset map from folded (diacritic-stripped) positions back to
   * original text positions. NFD decomposition can expand characters
   * (e.g., 'ä' → 'a' + '\u0308'), so after stripping combining marks the
   * folded string may be shorter than the original.
   *
   * @param {string} original - The original text
   * @returns {{ folded: string, toOriginal: number[] }}
   *   folded: the diacritic-stripped text
   *   toOriginal: array where toOriginal[foldedIdx] = originalIdx
   */
  static buildDiacriticOffsetMap(original) {
    const nfd = original.normalize('NFD');
    const toOriginal = [];
    let foldedChars = [];

    // Map from NFD position to original position
    const nfdToOriginal = [];
    let origIdx = 0;

    for (let nfdIdx = 0; nfdIdx < nfd.length; ) {
      const origChar = original[origIdx];
      const origNfd = origChar.normalize('NFD');

      // All NFD code points from this original character map back to origIdx
      for (let k = 0; k < origNfd.length; k++) {
        nfdToOriginal[nfdIdx + k] = origIdx;
      }

      nfdIdx += origNfd.length;
      origIdx++;
    }

    // Now strip combining marks and build the folded → original map
    // Reuse the same DIACRITICS_PATTERN char-classes for consistency
    for (let nfdIdx = 0; nfdIdx < nfd.length; nfdIdx++) {
      const cp = nfd.charCodeAt(nfdIdx);
      // Skip combining diacritical marks + Hebrew vowels/cantillation
      if (
        (cp >= 0x0300 && cp <= 0x036f) ||
        (cp >= 0x0591 && cp <= 0x05bd) ||
        cp === 0x05bf ||
        cp === 0x05c1 ||
        cp === 0x05c2 ||
        cp === 0x05c4 ||
        cp === 0x05c5 ||
        cp === 0x05c7
      )
        continue;

      foldedChars.push(nfd[nfdIdx]);
      toOriginal.push(nfdToOriginal[nfdIdx]);
    }

    // Add end sentinel so we can map the end of the last match
    toOriginal.push(original.length);

    return { folded: foldedChars.join(''), toOriginal };
  }

  /**
   * Search the index ignoring diacritics. Folds both the document text and
   * the query, searches in folded space, then maps match offsets back to
   * original document offsets.
   *
   * @param {string} pattern - Plain text search pattern
   * @param {Object} options - Search options
   * @param {boolean} [options.caseSensitive=false] - Case sensitive search
   * @param {number} [options.maxMatches=1000] - Maximum number of matches
   * @returns {Array<{start: number, end: number, text: string}>} Matches with original offsets
   */
  searchIgnoringDiacritics(pattern, options = {}) {
    const { caseSensitive = false, maxMatches = 1000 } = options;
    if (!pattern || typeof pattern !== 'string' || pattern.length === 0) return [];

    // Fold the document text
    const { folded: foldedText, toOriginal } = SearchIndex.buildDiacriticOffsetMap(this.text);

    // Fold and build regex from the query
    const foldedQuery = SearchIndex.stripDiacritics(pattern);
    const flexiblePattern = SearchIndex.toFlexiblePattern(foldedQuery);
    if (flexiblePattern.length === 0) return [];

    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(flexiblePattern, flags);

    const matches = [];
    let match;
    while ((match = regex.exec(foldedText)) !== null && matches.length < maxMatches) {
      // Map folded offsets back to original text offsets
      const originalStart = toOriginal[match.index];
      const originalEnd = toOriginal[match.index + match[0].length];

      matches.push({
        start: originalStart,
        end: originalEnd,
        text: this.text.slice(originalStart, originalEnd),
      });

      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    return matches;
  }
}
