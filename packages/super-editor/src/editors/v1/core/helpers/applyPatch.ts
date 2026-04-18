import { Fragment, Node as PMNode, Mark, Schema, ResolvedPos } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';

/**
 * Maximum iterations when navigating through inline nodes to find text positions.
 * This prevents infinite loops in pathological document structures (e.g., deeply
 * nested marks or malformed inline nodes). 8 is sufficient for typical documents
 * where inline nodes rarely nest more than 2-3 levels deep.
 */
const MAX_INLINE_NAVIGATION_ITERATIONS = 8;

/** Result of computing the change range between two strings */
export interface ChangeRange {
  /** Number of characters matching at the start */
  prefix: number;
  /** Number of characters matching at the end */
  suffix: number;
  /** Whether there's any difference between the strings */
  hasChange: boolean;
}

/** Options for the applyPatch function */
export interface ApplyPatchOptions {
  /** ProseMirror editor state */
  state: EditorState;
  /** ProseMirror transaction to apply changes to */
  tr: Transaction;
  /** Start position of the range to patch */
  from: number;
  /** End position of the range to patch */
  to: number;
  /** The suggested replacement text */
  suggestedText: string;
}

/** Result of applying a patch */
export interface ApplyPatchResult {
  /** The transaction (modified if changed) */
  tr: Transaction;
  /** Whether any change was made */
  changed: boolean;
}

/**
 * Computes the minimal change range between two strings by finding common prefix and suffix.
 *
 * This is a classic diff optimization: instead of replacing the entire string, we identify
 * what actually changed. For example:
 *   - original:  "The quick brown fox"
 *   - suggested: "The fast brown fox"
 *   - Result: prefix=4 ("The "), suffix=10 (" brown fox"), only "quick" → "fast" changes
 */
const computeChangeRange = (original: string, suggested: string): ChangeRange => {
  const origLen = original.length;
  const suggLen = suggested.length;
  let prefix = 0;

  // Find common prefix (characters matching from the start)
  while (prefix < origLen && prefix < suggLen && original[prefix] === suggested[prefix]) {
    prefix++;
  }

  // If prefix covers both strings entirely, they're identical
  if (prefix === origLen && prefix === suggLen) {
    return { prefix, suffix: 0, hasChange: false };
  }

  // Find common suffix (characters matching from the end)
  // We stop when suffix would overlap with prefix to avoid double-counting
  let suffix = 0;
  while (
    suffix < origLen - prefix &&
    suffix < suggLen - prefix &&
    original[origLen - 1 - suffix] === suggested[suggLen - 1 - suffix]
  ) {
    suffix++;
  }

  return { prefix, suffix, hasChange: true };
};

/**
 * Resolves a document position to land on actual text content, navigating through
 * non-text inline nodes if necessary.
 *
 * In ProseMirror, positions can fall between nodes or inside non-text inline nodes
 * (like marks or decorations). This function steps through such nodes to find a
 * position adjacent to actual text content.
 */
const resolveInlineTextPosition = (doc: PMNode, position: number, direction: 'forward' | 'backward'): number => {
  const docSize = doc.content.size;
  if (position < 0 || position > docSize) {
    return position;
  }

  const step = direction === 'forward' ? 1 : -1;
  let current = position;
  let iterations = 0;

  while (iterations < MAX_INLINE_NAVIGATION_ITERATIONS) {
    iterations++;
    const resolved = doc.resolve(current);
    const boundaryNode = direction === 'forward' ? resolved.nodeAfter : resolved.nodeBefore;

    // Stop if we've found text or there's no node in this direction
    if (!boundaryNode || boundaryNode.isText) {
      break;
    }

    // Stop at non-inline nodes, atom nodes (like images), or empty inline nodes
    if (!boundaryNode.isInline || boundaryNode.isAtom || boundaryNode.content.size === 0) {
      break;
    }

    // Step into the inline node
    const next = current + step;
    if (next < 0 || next > docSize) {
      break;
    }

    current = next;

    // Check if we've reached text on the other side
    const adjacent = doc.resolve(current);
    const checkNode = direction === 'forward' ? adjacent.nodeAfter : adjacent.nodeBefore;
    if (checkNode && checkNode.isText) {
      break;
    }
  }

  return current;
};

/**
 * Maps a character offset to a ProseMirror document position using binary search.
 *
 * ProseMirror positions are not the same as character offsets because node boundaries
 * take up positions. For example, in "<p>hello</p>", position 0 is before <p>,
 * position 1 is before 'h', position 6 is after 'o', position 7 is after </p>.
 *
 * This function uses binary search to efficiently find the document position
 * corresponding to a given character offset within a range.
 */
const mapCharOffsetToPosition = (doc: PMNode, from: number, to: number, charOffset: number): number => {
  const docSize = doc.content.size;
  if (from < 0 || from >= docSize || from >= to) {
    return from;
  }

  const resolvedFrom = resolveInlineTextPosition(doc, from, 'forward');
  if (charOffset <= 0) {
    return resolvedFrom;
  }

  const totalTextLength = doc.textBetween(resolvedFrom, to, '', '').length;
  if (totalTextLength <= 0) {
    return resolvedFrom;
  }

  // Clamp target offset to available text length
  const targetOffset = Math.min(charOffset, totalTextLength);
  let low = resolvedFrom;
  let high = to;

  // Binary search for the position where text length equals target offset
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const textLength = doc.textBetween(resolvedFrom, mid, '', '').length;

    if (textLength < targetOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const mappedPosition = Math.min(low, to);

  // If we're at the end of the text, resolve backward to stay within text bounds
  const direction = targetOffset === totalTextLength ? 'backward' : 'forward';
  return resolveInlineTextPosition(doc, mappedPosition, direction);
};

/**
 * Gets the marks (formatting) from the first text node within a document range.
 *
 * This is used to determine what formatting to apply to replacement text.
 * The "inherit from start" approach means replacement text gets the same
 * formatting as the beginning of the selection, which is intuitive for users.
 */
const getFirstTextMarks = (doc: PMNode, from: number, to: number): readonly Mark[] | null => {
  const docSize = doc.content.size;
  if (from < 0 || to > docSize || from > to) {
    return null;
  }

  let firstMarks: readonly Mark[] | null = null;
  doc.nodesBetween(from, to, (node) => {
    if (node.isText) {
      firstMarks = node.marks;
      return false; // Stop iteration - we only need the first text node
    }
  });

  return firstMarks;
};

/**
 * Gets the active marks at a specific position in the document.
 *
 * Checks storedMarks first (marks that will be applied to the next input),
 * then falls back to resolving marks at the position.
 *
 * Returns a copy to avoid mutations affecting the document state.
 */
const getMarksAtPosition = (state: EditorState, position: number): Mark[] => {
  if (state.storedMarks?.length) {
    return [...state.storedMarks];
  }
  const resolved = state.doc.resolve(position);
  return [...resolved.marks()];
};

/**
 * Builds text nodes for replacement content, preserving formatting from the original range.
 *
 * Uses the "inherit from start" strategy: the replacement text inherits formatting
 * from the first text node in the range being replaced. This is predictable and
 * matches user expectations (formatting comes from where the selection starts).
 */
const buildTextNodes = (state: EditorState, from: number, to: number, suggestedText: string): PMNode[] => {
  if (!suggestedText) {
    return [];
  }

  const { schema } = state;

  // Use marks from the first text node in the range, or fall back to position marks.
  // This "inherit from start" approach is predictable and matches user expectations:
  // formatting is determined by where the selection begins.
  const firstMarks = getFirstTextMarks(state.doc, from, to);
  const marks = firstMarks ? [...firstMarks] : getMarksAtPosition(state, from);

  return [schema.text(suggestedText, marks)];
};

// Export internal functions for testing
export const _testInternals = {
  computeChangeRange,
  resolveInlineTextPosition,
  mapCharOffsetToPosition,
  getFirstTextMarks,
  getMarksAtPosition,
  buildTextNodes,
};

/**
 * Applies a text patch to a ProseMirror document, computing the minimal change needed.
 *
 * This function is designed for AI-generated text suggestions and programmatic edits.
 * It finds the minimal diff between original and suggested text, then applies only
 * the changed portion to the document while preserving formatting.
 *
 * Key features:
 * - Minimal diff: Only the changed portion is replaced, not the entire range
 * - Format preservation: Replacement text inherits formatting from selection start
 * - Safe: Returns unchanged if inputs are invalid or text is identical
 *
 * @example
 * // Replace "quick" with "fast" in "The quick brown fox"
 * const { tr, changed } = applyPatch({
 *   state: editorState,
 *   tr: editorState.tr,
 *   from: 0,
 *   to: 19,
 *   suggestedText: "The fast brown fox"
 * });
 * // Only "quick" → "fast" is replaced, not the entire string
 */
export const applyPatch = ({ state, tr, from, to, suggestedText }: ApplyPatchOptions): ApplyPatchResult => {
  if (!state?.doc) {
    return { tr, changed: false };
  }

  const docSize = state.doc.content.size;
  if (from < 0 || to > docSize || from > to) {
    return { tr, changed: false };
  }

  // Extract original text and compute minimal change range
  const originalText = state.doc.textBetween(from, to, '', '');
  const { prefix, suffix, hasChange } = computeChangeRange(originalText, suggestedText);
  if (!hasChange) {
    return { tr, changed: false };
  }

  // Map character offsets to document positions
  // prefix = unchanged chars at start, so change starts after prefix
  // suffix = unchanged chars at end, so change ends before suffix
  const changeFrom = mapCharOffsetToPosition(state.doc, from, to, prefix);
  const originalTextLength = originalText.length;
  const changeTo = mapCharOffsetToPosition(state.doc, from, to, originalTextLength - suffix);

  // Extract only the changed portion of the suggested text
  const replacementEnd = suggestedText.length - suffix;
  const replacementText = suggestedText.slice(prefix, replacementEnd);

  // Handle pure deletion (replacement text is empty after trimming)
  if (!replacementText) {
    tr.delete(changeFrom, changeTo);
    return { tr, changed: true };
  }

  // Build replacement nodes with preserved formatting and apply
  const nodes = buildTextNodes(state, changeFrom, changeTo, replacementText);
  tr.replaceWith(changeFrom, changeTo, Fragment.fromArray(nodes));

  return { tr, changed: true };
};
