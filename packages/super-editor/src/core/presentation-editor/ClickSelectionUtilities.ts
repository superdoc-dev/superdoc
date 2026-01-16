import type { Node as ProseMirrorNode, ResolvedPos } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { isWordCharacter } from './SelectionHelpers.js';

/**
 * State tracking for rapid multi-click detection (double-click, triple-click, etc.).
 * @property clickCount - The current sequential click count
 * @property lastClickTime - Timestamp of the last registered click (in milliseconds)
 * @property lastClickPosition - Pixel coordinates of the last registered click
 */
export type MultiClickState = {
  clickCount: number;
  lastClickTime: number;
  lastClickPosition: { x: number; y: number };
};

/**
 * Registers a pointer click event and determines the current click count based on
 * time and distance thresholds.
 *
 * This function implements multi-click detection by tracking whether successive clicks
 * occur within a specified time window and distance threshold. This enables features
 * like double-click to select word and triple-click to select paragraph.
 *
 * @param event - The pointer event containing timestamp and position
 * @param previous - The previous multi-click state
 * @param options - Configuration for click detection
 * @param options.timeThresholdMs - Maximum time between clicks to count as rapid (typically 500ms)
 * @param options.distanceThresholdPx - Maximum pixel distance between clicks (typically 5px)
 * @param options.maxClickCount - Maximum click count to track (e.g., 3 for triple-click)
 * @returns Updated multi-click state with incremented count if thresholds are met, or reset to 1
 *
 * @remarks
 * Click count increments only if both time and distance thresholds are satisfied.
 * If either threshold is exceeded, the count resets to 1 (single click).
 * The count is capped at maxClickCount to prevent unbounded increment.
 */
export function registerPointerClick(
  event: Pick<MouseEvent, 'timeStamp' | 'clientX' | 'clientY'>,
  previous: MultiClickState,
  options: { timeThresholdMs: number; distanceThresholdPx: number; maxClickCount: number },
): MultiClickState {
  const time = event.timeStamp ?? performance.now();
  const timeDelta = time - previous.lastClickTime;
  const withinTime = timeDelta <= options.timeThresholdMs;
  const distanceX = Math.abs(event.clientX - previous.lastClickPosition.x);
  const distanceY = Math.abs(event.clientY - previous.lastClickPosition.y);
  const withinDistance = distanceX <= options.distanceThresholdPx && distanceY <= options.distanceThresholdPx;

  const clickCount = withinTime && withinDistance ? Math.min(previous.clickCount + 1, options.maxClickCount) : 1;

  return {
    clickCount,
    lastClickTime: time,
    lastClickPosition: { x: event.clientX, y: event.clientY },
  };
}

/**
 * Finds the first valid text position in a ProseMirror document.
 *
 * @param doc - The ProseMirror document node to search
 * @returns The position of the first textblock, or 1 as a fallback
 */
export function getFirstTextPosition(doc: ProseMirrorNode | null): number {
  if (!doc || !doc.content) {
    return 1;
  }

  let validPos = 1;

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isTextblock) {
      validPos = pos + 1;
      return false;
    }
    return true;
  });

  return validPos;
}

/**
 * Computes the selection range for a word at a given position.
 *
 * This function expands the selection to include the entire word at the cursor position,
 * respecting word boundaries defined by the Unicode word character regex. It's used
 * to implement double-click word selection.
 *
 * @param state - The current ProseMirror editor state
 * @param pos - The position to expand from
 * @returns Selection range from word start to word end, or null if no word found or position invalid
 *
 * @remarks
 * - Word boundaries are determined by the isWordCharacter function, which handles Unicode properly
 * - The function stops at paragraph boundaries to prevent cross-paragraph selection
 * - Returns null if the position is on whitespace or punctuation between words
 */
export function computeWordSelectionRangeAt(state: EditorState, pos: number): { from: number; to: number } | null {
  if (!state?.doc) {
    return null;
  }

  if (pos < 0 || pos > state.doc.content.size) {
    return null;
  }

  const textblockPos = findNearestTextblockResolvedPos(state.doc, pos);
  if (!textblockPos) {
    return null;
  }

  const parentStart = textblockPos.start();
  const parentEnd = textblockPos.end();

  const sampleEnd = Math.min(pos + 1, parentEnd);
  const charAtPos = state.doc.textBetween(pos, sampleEnd, '\u0000', '\u0000');
  if (!isWordCharacter(charAtPos)) {
    return null;
  }

  let startPos = pos;
  while (startPos > parentStart) {
    const prevChar = state.doc.textBetween(startPos - 1, startPos, '\u0000', '\u0000');
    if (!isWordCharacter(prevChar)) {
      break;
    }
    startPos -= 1;
  }

  let endPos = pos;
  while (endPos < parentEnd) {
    const nextChar = state.doc.textBetween(endPos, endPos + 1, '\u0000', '\u0000');
    if (!isWordCharacter(nextChar)) {
      break;
    }
    endPos += 1;
  }

  if (startPos === endPos) {
    return null;
  }

  return { from: startPos, to: endPos };
}

/**
 * Computes the selection range for an entire paragraph at a given position.
 *
 * This function expands the selection to include the entire textblock (paragraph)
 * containing the cursor position. It's used to implement triple-click paragraph selection.
 *
 * @param state - The current ProseMirror editor state
 * @param pos - The position within the paragraph to select
 * @returns Selection range from paragraph start to end, or null if position invalid
 *
 * @remarks
 * Paragraph boundaries are determined by the ProseMirror document structure,
 * specifically the nearest textblock node containing the position.
 */
export function computeParagraphSelectionRangeAt(state: EditorState, pos: number): { from: number; to: number } | null {
  if (!state?.doc) {
    return null;
  }

  const textblockPos = findNearestTextblockResolvedPos(state.doc, pos);
  if (!textblockPos) {
    return null;
  }

  return { from: textblockPos.start(), to: textblockPos.end() };
}

function findNearestTextblockResolvedPos(doc: ProseMirrorNode, pos: number): ResolvedPos | null {
  const $pos = doc.resolve(pos);

  let textblockPos = $pos;
  while (textblockPos.depth > 0) {
    if (textblockPos.parent?.isTextblock) {
      break;
    }
    if (!textblockPos.parent || textblockPos.depth === 0) {
      break;
    }
    const beforePos = textblockPos.before();
    if (beforePos < 0 || beforePos > doc.content.size) {
      return null;
    }
    textblockPos = doc.resolve(beforePos);
  }

  if (!textblockPos.parent?.isTextblock) {
    return null;
  }

  return textblockPos;
}
