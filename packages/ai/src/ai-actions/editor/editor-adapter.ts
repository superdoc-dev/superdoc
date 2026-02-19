import type { Editor, FoundMatch, MarkType } from '../../shared';
import type { Node as ProseMirrorNode, Mark } from 'prosemirror-model';
import { generateId, stripListPrefix } from '../../shared';

/**
 * Default highlight color for text selections.
 * Light blue (#6CA0DC) chosen for accessibility and contrast.
 */
const DEFAULT_HIGHLIGHT_COLOR = '#6CA0DC';

/**
 * Adapter for SuperDoc editor operations
 * Encapsulates all editor-specific API calls
 */
export class EditorAdapter {
  constructor(private editor: Editor) {}

  /**
   * Finds document positions for all search match results.
   * Maps abstract search results to concrete editor positions using the search command.
   *
   * @param results - Array of found matches with originalText to search for
   * @param options - Additional options
   * @param options.highlight - Whether to apply visual highlights while searching
   * @returns Array of matches enriched with position data, filtered to only matches with positions
   */
  findResults(results: FoundMatch[], options: { highlight?: boolean } = {}): FoundMatch[] {
    if (!results?.length) {
      return [];
    }

    const highlight = options.highlight ?? false;

    // Get current selection if it exists - access through view to ensure latest state
    const state = this.editor?.view?.state;
    const selection = state?.selection;
    const hasSelection =
      selection && !selection.empty && typeof selection.from === 'number' && typeof selection.to === 'number';
    const selectionRange = hasSelection ? { from: selection.from, to: selection.to } : null;

    return results
      .map((match) => {
        const text = match.originalText;
        let rawMatches: Array<{ from?: number; to?: number }> = [];

        if (this.editor.commands?.search) {
          // First try with original text
          const searchResult = this.editor.commands.search(text, { highlight });
          rawMatches = Array.isArray(searchResult) ? searchResult : [];

          // If no matches and text has list prefix, try with stripped prefix
          if (rawMatches.length === 0 && text && /^\d+(\.\d+)?\.\s+/.test(text)) {
            const strippedText = stripListPrefix(text);
            if (strippedText) {
              const strippedResult = this.editor.commands.search(strippedText, { highlight });
              rawMatches = Array.isArray(strippedResult) ? strippedResult : [];
            }
          }

          // If still no matches, try with normalized whitespace (collapse multiple spaces to single space)
          // This handles cases where text is split across nodes and whitespace differs
          if (rawMatches.length === 0 && text) {
            const normalizedText = text.replace(/\s+/g, ' ').trim();
            if (normalizedText !== text && normalizedText.length > 0) {
              const normalizedResult = this.editor.commands.search(normalizedText, { highlight });
              rawMatches = Array.isArray(normalizedResult) ? normalizedResult : [];
            }
          }
        }

        let positions = rawMatches
          .map((match: { from?: number; to?: number }) => {
            const from = match.from;
            const to = match.to;
            if (typeof from !== 'number' || typeof to !== 'number') {
              return null;
            }
            return { from, to };
          })
          .filter((value: { from: number; to: number } | null) => value !== null);

        // Filter positions to only include matches within the selected range
        if (selectionRange) {
          positions = positions.filter((pos: { from: number; to: number }) => {
            return pos.from < selectionRange.to && pos.to > selectionRange.from;
          });
        }

        return {
          ...match,
          positions,
        };
      })
      .filter((entry) => entry.positions.length > 0);
  }

  /**
   * Performs a literal text search across the entire document without mutating editor state.
   * The search works across text nodes with different marks/formatting, as the underlying
   * search implementation extracts text content regardless of formatting.
   *
   * @param query - Exact text to find
   * @param caseSensitive - Whether the search should be case sensitive
   */
  findLiteralMatches(query: string, caseSensitive: boolean = false): Array<{ from: number; to: number; text: string }> {
    const doc = this.editor?.state?.doc;
    if (!doc || !query) {
      return [];
    }

    if (this.editor?.commands?.search && typeof this.editor.commands.search === 'function') {
      const listPrefixMatch = query.match(/^\d+(\.\d+)?\.\s+/);

      if (listPrefixMatch) {
        // First try with original query (escaped for regex)
        const escapedOriginal = this.escapeRegex(query);
        const regexOriginal = new RegExp(escapedOriginal, caseSensitive ? 'g' : 'gi');
        const originalSearchResult = this.editor.commands.search(regexOriginal, { highlight: false });
        const originalResults = Array.isArray(originalSearchResult)
          ? (originalSearchResult as Array<{ from: number; to: number; text?: string }>)
          : [];

        // Then try with stripped prefix (also escaped for regex)
        const strippedQuery = query.replace(/^\d+(\.\d+)?\.\s+/, '');
        const escapedStripped = this.escapeRegex(strippedQuery);
        const regexStripped = new RegExp(escapedStripped, caseSensitive ? 'g' : 'gi');
        const strippedSearchResult = this.editor.commands.search(regexStripped, { highlight: false });
        const strippedResults = Array.isArray(strippedSearchResult)
          ? (strippedSearchResult as Array<{ from: number; to: number; text?: string }>)
          : [];

        // Return stripped results if found, otherwise original
        const results = strippedResults.length > 0 ? strippedResults : originalResults;
        return results.map((match: { from: number; to: number; text?: string }) => ({
          from: match.from,
          to: match.to,
          text: match.text || doc.textBetween(match.from, match.to),
        }));
      }

      // No list prefix, just search normally
      const escapedQuery = this.escapeRegex(query);
      const regex = new RegExp(escapedQuery, caseSensitive ? 'g' : 'gi');
      const searchResult = this.editor.commands.search(regex, { highlight: false });
      const results = Array.isArray(searchResult)
        ? (searchResult as Array<{ from: number; to: number; text?: string }>)
        : [];

      return results.map((match: { from: number; to: number; text?: string }) => ({
        from: match.from,
        to: match.to,
        text: match.text || doc.textBetween(match.from, match.to),
      }));
    }
    return [];
  }

  /**
   * Escapes special regex characters in a string for use in a RegExp
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Creates a highlight mark at the specified document range.
   * Automatically scrolls to bring the highlighted range into view.
   *
   * @param from - Start position of the highlight
   * @param to - End position of the highlight
   * @param inlineColor - Hex color for the highlight (default: #6CA0DC)
   */
  createHighlight(from: number, to: number, inlineColor: string = DEFAULT_HIGHLIGHT_COLOR): void {
    const chain = this.editor.chain();
    if (chain && typeof chain.setTextSelection === 'function') {
      const chainWithSelection = chain.setTextSelection({ from, to });
      if (
        chainWithSelection &&
        typeof chainWithSelection === 'object' &&
        'setHighlight' in chainWithSelection &&
        typeof chainWithSelection.setHighlight === 'function'
      ) {
        const chainWithHighlight = chainWithSelection.setHighlight(inlineColor);
        if (chainWithHighlight && typeof chainWithHighlight === 'object' && 'run' in chainWithHighlight) {
          chainWithHighlight.run();
        }
      }
    }
    this.scrollToPosition(from);
  }

  /**
   * Scrolls the editor view to bring a specific position range into view.
   *
   * @param from - Start position to scroll to
   */
  scrollToPosition(from: number): void {
    const { state, view } = this.editor;
    if (!state || !view) {
      return;
    }
    const domPos = view.domAtPos(from);
    const node = domPos?.node;
    if (node && 'scrollIntoView' in node && typeof node.scrollIntoView === 'function') {
      (node as Element).scrollIntoView(true);
    }
  }

  /**
   * Gets the current selection range from the editor state.
   *
   * @returns Selection range with from/to positions, or null if no valid state
   * @private
   */
  private getSelectionRange(): { from: number; to: number } | null {
    const { state } = this.editor;
    if (!state) {
      return null;
    }
    const { from, to } = state.selection;
    if (typeof from !== 'number' || typeof to !== 'number') {
      return null;
    }
    return { from, to };
  }

  /**
   * Collects text segments with their marks from a document range.
   * Handles text nodes that partially overlap with the specified range by computing
   * the intersection and extracting only the overlapping portion with its marks.
   *
   * @param from - Start position (validated against doc boundaries)
   * @param to - End position (validated against doc boundaries)
   * @returns Array of segments with length and marks, or empty array if invalid positions
   * @private
   */
  private collectTextSegments(from: number, to: number): Array<{ length: number; marks: MarkType[] }> {
    const { state } = this.editor;
    const segments: Array<{ length: number; marks: MarkType[] }> = [];

    if (!state?.doc) {
      return segments;
    }

    // Validate position boundaries
    const docSize = state.doc.content.size;
    if (from < 0 || to > docSize || from > to) {
      return segments;
    }

    state.doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
      if (!node.isText) {
        return true;
      }
      const textValue = typeof node.text === 'string' ? node.text : '';
      const nodeStart = Math.max(from, pos);
      const nodeEnd = Math.min(to, pos + node.nodeSize);
      const startOffset = Math.max(0, Math.min(textValue.length, nodeStart - pos));
      const endOffset = Math.max(0, Math.min(textValue.length, nodeEnd - pos));
      const overlapLength = Math.max(0, endOffset - startOffset);

      if (overlapLength === 0) {
        return true;
      }

      segments.push({
        length: overlapLength,
        marks: node.marks.map((mark: Mark) => mark) as MarkType[],
      });

      return true;
    });

    return segments;
  }

  /**
   * Gets the marks that should be applied at a specific position.
   * Checks stored marks first, then resolves marks from the document position.
   *
   * @param position - Document position to get marks from
   * @returns Array of marks at the position, or empty array if invalid position
   * @private
   */
  private getMarksAtPosition(position: number): MarkType[] {
    const { state } = this.editor;
    if (!state?.doc) {
      return [];
    }

    // Validate position boundaries
    const docSize = state.doc.content.size;
    if (position < 0 || position > docSize) {
      return [];
    }

    if (state.storedMarks) {
      return [...state.storedMarks] as MarkType[];
    }

    const resolved = state.doc.resolve(position);
    return [...resolved.marks()] as MarkType[];
  }

  /**
   * Builds an array of ProseMirror text nodes with preserved marks.
   * Distributes the suggested text across segments, applying each segment's marks
   * to the corresponding portion of text. If text extends beyond segments, uses
   * the last segment's marks for the overflow.
   *
   * @param from - Original range start (used if segments not provided)
   * @param to - Original range end (used if segments not provided)
   * @param suggestedText - The text to split into marked nodes
   * @param segments - Optional pre-collected segments (will collect if not provided)
   * @returns Array of text nodes with marks applied
   * @private
   */
  private buildTextNodes(
    from: number,
    to: number,
    suggestedText: string,
    segments?: Array<{ length: number; marks: MarkType[] }>,
  ): ProseMirrorNode[] {
    if (!suggestedText) {
      return [];
    }

    const { state } = this.editor;
    if (!state) {
      return [];
    }

    const resolvedSegments = segments ?? this.collectTextSegments(from, to);
    const schema = state.schema;

    if (!resolvedSegments.length) {
      return [schema.text(suggestedText, this.getMarksAtPosition(from))];
    }

    // Helper to compare marks arrays for equality
    const marksEqual = (marks1: MarkType[], marks2: MarkType[]): boolean => {
      if (marks1.length !== marks2.length) {
        return false;
      }
      const sorted1 = [...marks1].sort((a, b) => a.type.name.localeCompare(b.type.name));
      const sorted2 = [...marks2].sort((a, b) => a.type.name.localeCompare(b.type.name));
      return sorted1.every((mark, idx) => mark.eq(sorted2[idx]));
    };

    // Group consecutive segments with identical marks together
    // This prevents breaking paragraphs into multiple nodes unnecessarily
    interface MarkGroup {
      marks: MarkType[];
      totalLength: number;
      segmentIndices: number[];
    }

    const groups: MarkGroup[] = [];
    let currentGroup: MarkGroup | null = null;

    for (let i = 0; i < resolvedSegments.length; i++) {
      const segment = resolvedSegments[i];

      if (currentGroup === null) {
        // Start first group
        currentGroup = {
          marks: segment.marks,
          totalLength: segment.length,
          segmentIndices: [i],
        };
      } else if (marksEqual(currentGroup.marks, segment.marks)) {
        // Merge into current group
        currentGroup.totalLength += segment.length;
        currentGroup.segmentIndices.push(i);
      } else {
        // Finalize current group and start new one
        groups.push(currentGroup);
        currentGroup = {
          marks: segment.marks,
          totalLength: segment.length,
          segmentIndices: [i],
        };
      }
    }

    // Don't forget the last group
    if (currentGroup !== null) {
      groups.push(currentGroup);
    }

    // If there's only one group, create a single node
    if (groups.length === 1) {
      return [schema.text(suggestedText, groups[0].marks)];
    }

    // Calculate total original length for proportional text distribution
    const totalOriginalLength = resolvedSegments.reduce((sum, seg) => sum + seg.length, 0);

    // Build nodes by distributing text proportionally to each group
    const nodes: ProseMirrorNode[] = [];
    let textCursor = 0;

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const isLastGroup = groupIndex === groups.length - 1;

      // Calculate how much text this group should get
      let textLength: number;
      if (isLastGroup) {
        // Last group gets all remaining text to avoid rounding errors
        textLength = suggestedText.length - textCursor;
      } else {
        // Proportional allocation based on original segment lengths
        const proportion = group.totalLength / totalOriginalLength;
        textLength = Math.floor(suggestedText.length * proportion);
      }

      // Ensure we don't exceed available text
      textLength = Math.min(textLength, suggestedText.length - textCursor);

      if (textLength > 0) {
        const groupText = suggestedText.slice(textCursor, textCursor + textLength);
        nodes.push(schema.text(groupText, group.marks));
        textCursor += textLength;
      }
    }

    return nodes;
  }

  /**
   * Resolves positions that land on transparent inline node boundaries by
   * walking into the node content until a text node is reached.
   *
   * This is needed because search results frequently point to inline wrapper
   * nodes (e.g. tracked change spans) rather than directly to their text.
   * Attempting to apply ProseMirror transactions at those boundaries causes
   * the delete/insert operations to no-op.
   *
   * @param position - The document position to resolve
   * @param direction - Direction to walk the boundary ('forward' for starts, 'backward' for ends)
   * @returns Position that points inside actual text content when possible
   * @private
   */
  private resolveInlineTextPosition(position: number, direction: 'forward' | 'backward'): number {
    const { state } = this.editor;
    const doc = state?.doc;
    if (!doc) {
      return position;
    }

    const docSize = doc.content.size;
    if (position < 0 || position > docSize) {
      return position;
    }

    const step = direction === 'forward' ? 1 : -1;
    let current = position;
    let iterations = 0;

    while (iterations < 8) {
      iterations++;
      const resolved = doc.resolve(current);
      const boundaryNode = direction === 'forward' ? resolved.nodeAfter : resolved.nodeBefore;

      if (!boundaryNode) {
        break;
      }

      if (boundaryNode.isText) {
        break;
      }

      if (!boundaryNode.isInline || boundaryNode.isAtom || boundaryNode.content.size === 0) {
        break;
      }

      const next = current + step;
      if (next < 0 || next > docSize) {
        break;
      }

      current = next;

      const adjacent = doc.resolve(current);
      const checkNode = direction === 'forward' ? adjacent.nodeAfter : adjacent.nodeBefore;
      if (checkNode && checkNode.isText) {
        break;
      }
    }

    return current;
  }

  /**
   * Maps a character offset within extracted text to the corresponding document position.
   * Also handles edge cases where positions point to node boundaries instead of text content.
   *
   * This unified method:
   * - Resolves positions at transparent inline node boundaries (when charOffset is 0)
   * - Maps character offsets to document positions using binary search (when charOffset > 0)
   * - Handles node boundaries where character count doesn't equal position offset
   *
   * @param from - Starting document position
   * @param to - Ending document position (exclusive)
   * @param charOffset - Number of characters to advance from the start (0 = resolve position only)
   * @returns Document position corresponding to the character offset, resolved to point to text content
   * @private
   */
  private mapCharOffsetToPosition(from: number, to: number, charOffset: number): number {
    const { state } = this.editor;
    if (!state?.doc) {
      return from;
    }

    const docSize = state.doc.content.size;
    if (from < 0 || from >= docSize || from >= to) {
      return from;
    }

    // Resolve position to ensure it points to actual text content, not a node boundary.
    // This handles edge cases where search returns positions at transparent inline node boundaries.
    const resolvedFrom = this.resolveInlineTextPosition(from, 'forward');

    // If charOffset is 0 or negative, just return the resolved position
    if (charOffset <= 0) {
      return resolvedFrom;
    }

    // Map character offset to document position using binary search
    const totalTextLength = state.doc.textBetween(resolvedFrom, to, '', '').length;
    if (totalTextLength <= 0) {
      return resolvedFrom;
    }

    const targetOffset = Math.min(charOffset, totalTextLength);

    // Binary search to find the position corresponding to the character offset
    let low = resolvedFrom;
    let high = to;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const textLength = state.doc.textBetween(resolvedFrom, mid, '', '').length;

      if (textLength < targetOffset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const mappedPosition = Math.min(low, to);
    const direction = targetOffset === totalTextLength ? 'backward' : 'forward';
    return this.resolveInlineTextPosition(mappedPosition, direction);
  }

  /**
   * Computes the range of actual changes between original and suggested text.
   * Uses a diff algorithm to find common prefix and suffix, minimizing the
   * region that needs to be replaced in the document.
   *
   * @param original - Original text string
   * @param suggested - Suggested replacement text string
   * @returns Object with prefix length, suffix length, and whether any change exists
   * @private
   */
  private computeChangeRange(
    original: string,
    suggested: string,
  ): { prefix: number; suffix: number; hasChange: boolean } {
    const origLen = original.length;
    const suggLen = suggested.length;
    let prefix = 0;

    while (prefix < origLen && prefix < suggLen && original[prefix] === suggested[prefix]) {
      prefix++;
    }

    if (prefix === origLen && prefix === suggLen) {
      return { prefix, suffix: 0, hasChange: false };
    }

    let suffix = 0;
    while (
      suffix < origLen - prefix &&
      suffix < suggLen - prefix &&
      original[origLen - 1 - suffix] === suggested[suggLen - 1 - suffix]
    ) {
      suffix++;
    }

    return { prefix, suffix, hasChange: true };
  }

  /**
   * Applies a text replacement patch to the document.
   * Uses intelligent diffing to replace only the changed portion while preserving marks.
   * Validates position boundaries before making changes.
   *
   * @param from - Start position of the replacement range
   * @param to - End position of the replacement range
   * @param suggestedText - The text to insert
   * @private
   */
  private applyPatch(from: number, to: number, suggestedText: string): void {
    const { state } = this.editor;
    if (!state) {
      return;
    }

    // Validate position boundaries
    const docSize = state.doc.content.size;
    if (from < 0 || to > docSize || from > to) {
      return;
    }

    const originalText = state.doc.textBetween(from, to, '', '');
    const { prefix, suffix, hasChange } = this.computeChangeRange(originalText, suggestedText);
    if (!hasChange) {
      return;
    }

    // If replacing the entire range (no prefix or suffix), use original positions directly
    // Otherwise, map character offsets to document positions (handles node boundaries correctly)
    const changeFrom = this.mapCharOffsetToPosition(from, to, prefix);
    const originalTextLength = originalText.length;
    const changeTo = this.mapCharOffsetToPosition(from, to, originalTextLength - suffix);

    const replacementEnd = suggestedText.length - suffix;
    const replacementText = suggestedText.slice(prefix, replacementEnd);

    const segments = this.collectTextSegments(changeFrom, changeTo);
    const nodes = this.buildTextNodes(changeFrom, changeTo, replacementText, segments);
    const tr = state.tr.delete(changeFrom, changeTo);
    let insertPos = changeFrom;
    for (const node of nodes) {
      tr.insert(insertPos, node);
      insertPos += node.nodeSize;
    }

    this.editor.dispatch(tr);
  }

  /**
   * Replaces text in the document while intelligently preserving ProseMirror marks.
   * Uses a diffing algorithm to minimize document changes by only replacing changed portions.
   * Validates position boundaries and silently ignores invalid positions.
   *
   * @param from - Start position (must be >= 0 and < doc size)
   * @param to - End position (must be <= doc size and >= from)
   * @param suggestedText - The replacement text to insert
   */
  replaceText(from: number, to: number, suggestedText: string): void {
    this.applyPatch(from, to, suggestedText);
  }

  /**
   * Creates a tracked change for the specified replacement.
   * Temporarily enables track changes mode, applies the replacement, then disables tracking.
   *
   * @param from - Start position of the change
   * @param to - End position of the change
   * @param suggestedText - The suggested replacement text
   * @returns Generated ID for the tracked change
   */
  createTrackedChange(from: number, to: number, suggestedText: string): string {
    const changeId = generateId('tracked-change');
    if (typeof this.editor.commands?.enableTrackChanges === 'function') {
      this.editor.commands.enableTrackChanges();
    }
    try {
      this.applyPatch(from, to, suggestedText);
    } finally {
      if (typeof this.editor.commands?.disableTrackChanges === 'function') {
        this.editor.commands.disableTrackChanges();
      }
    }

    return changeId;
  }

  /**
   * Creates a comment at the specified document range.
   * Enables track changes during comment insertion to maintain editing context.
   *
   * @param from - Start position of the comment anchor
   * @param to - End position of the comment anchor
   * @param text - The comment text content
   * @returns Promise resolving to the generated ID for the comment
   */
  async createComment(from: number, to: number, text: string): Promise<string> {
    const commentId = generateId('comment');
    if (typeof this.editor.commands?.enableTrackChanges === 'function') {
      this.editor.commands.enableTrackChanges();
    }
    try {
      const chain = this.editor.chain();
      if (chain && typeof chain.setTextSelection === 'function') {
        const chainWithSelection = chain.setTextSelection({ from, to });
        if (
          chainWithSelection &&
          typeof chainWithSelection === 'object' &&
          'insertComment' in chainWithSelection &&
          typeof chainWithSelection.insertComment === 'function'
        ) {
          const chainWithComment = chainWithSelection.insertComment({ commentText: text });
          if (chainWithComment && typeof chainWithComment === 'object' && 'run' in chainWithComment) {
            chainWithComment.run();
          }
        }
      }
    } finally {
      if (typeof this.editor.commands?.disableTrackChanges === 'function') {
        this.editor.commands.disableTrackChanges();
      }
    }

    return commentId;
  }

  /**
   * Inserts text at the current editor selection.
   * Preserves marks from the surrounding context at the insertion point.
   *
   * @param suggestedText - The text to insert
   * @param options
   */
  insertText(suggestedText: string, options?: { position?: 'before' | 'after' | 'replace' }): void {
    const position = this.getSelectionRange();
    if (!position) {
      return;
    }

    const mode = options?.position ?? 'replace';
    let from = position.from;
    let to = position.to;

    if (mode === 'before') {
      to = from;
    } else if (mode === 'after') {
      from = to;
    }

    this.applyPatch(from, to, suggestedText);
  }
}
