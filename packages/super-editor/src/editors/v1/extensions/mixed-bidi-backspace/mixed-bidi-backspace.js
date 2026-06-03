// @ts-nocheck
import { Extension } from '@core/Extension.js';

// SD-3169: widen beyond Hebrew/Arabic core blocks to include Hebrew/Arabic
// presentation forms (FB1D-FB4F, FB50-FDFF, FE70-FEFF) used by legacy fonts
// and some authoring tools. The Unicode Script properties catch presentation
// forms while excluding noncharacters (FDD0-FDEF) and the BOM (FEFF).
// AIDEV-NOTE: also duplicated in painter-dom features/inline-direction/run-direction.ts.
// Consolidating crosses a layer boundary; tracked under SD-3169 follow-ups.
const STRONG_RTL_CHAR_RE = /[\u0590-\u08FF\p{Script=Hebrew}\p{Script=Arabic}]/u;
const STRONG_LTR_CHAR_RE = /[A-Za-z\u00C0-\u024F]/;

const isStrongRtl = (char) => STRONG_RTL_CHAR_RE.test(char);
const isStrongLtr = (char) => STRONG_LTR_CHAR_RE.test(char);

const hasMixedDirectionBoundary = (leftChar, rightChar) =>
  (isStrongRtl(leftChar) && isStrongLtr(rightChar)) || (isStrongLtr(leftChar) && isStrongRtl(rightChar));

const resolveCaretPoint = (doc, range) => {
  const rect = range.getBoundingClientRect();
  if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
    // Collapsed ranges may transiently report a zero rect during render lag.
    // In that case, fail-open instead of falling back to the parent box,
    // which would produce an imprecise X and potentially a wrong boundary.
    if (rect.width === 0 && rect.height === 0) {
      return null;
    }
    const midY = rect.height > 0 ? rect.top + rect.height / 2 : rect.top;
    return { x: rect.left, y: midY };
  }

  const node =
    range.startContainer?.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
  if (!node || !(node instanceof HTMLElement)) return null;
  const fallbackRect = node.getBoundingClientRect();
  if (!fallbackRect) return null;
  return { x: fallbackRect.left, y: fallbackRect.top + fallbackRect.height / 2 };
};

const resolveLineElement = (doc, point) => {
  const hit = doc.elementsFromPoint(point.x, point.y);
  return hit.find((el) => (el instanceof HTMLElement ? el.classList.contains('superdoc-line') : false));
};

const collectVisualChars = (lineEl, view, targetX = null) => {
  const doc = lineEl.ownerDocument;
  const nodeFilter = doc.defaultView?.NodeFilter;
  if (!nodeFilter) return [];
  const chars = [];
  const walker = doc.createTreeWalker(lineEl, nodeFilter.SHOW_TEXT);
  const RANGE_WINDOW_PX = 96;
  const hasTargetX = Number.isFinite(targetX);
  let node = walker.nextNode();

  while (node) {
    const textNode = /** @type {Text} */ (node);
    const text = textNode.textContent ?? '';

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (!char || /\s/.test(char)) continue;

      let pmStart;
      let pmEnd;
      try {
        pmStart = view.posAtDOM(textNode, i);
        pmEnd = view.posAtDOM(textNode, i + 1);
      } catch {
        continue;
      }
      if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd) || pmEnd <= pmStart) continue;

      const range = doc.createRange();
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (hasTargetX && rect.right < targetX - RANGE_WINDOW_PX) continue;
      if (hasTargetX && rect.left > targetX + RANGE_WINDOW_PX) continue;

      chars.push({
        char,
        pmStart,
        pmEnd,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      });
    }

    node = walker.nextNode();
  }

  return chars;
};

const resolveBoundaryChars = (chars, caretPoint) => {
  if (chars.length === 0) return null;
  const sameBand = chars.filter((c) => Math.abs(c.centerY - caretPoint.y) <= 8);
  const band = sameBand.length > 0 ? sameBand : chars;
  band.sort((a, b) => a.centerX - b.centerX);

  let left = null;
  let right = null;
  for (const c of band) {
    if (c.centerX < caretPoint.x) {
      left = c;
      continue;
    }
    right = c;
    break;
  }

  if (!left || !right) return null;
  return { left, right };
};

/**
 * Compute the visual-left delete range at a mixed-bidi RTL/LTR boundary.
 *
 * Returns the PM-position range to delete, or `null` when the caret is not
 * on a mixed-direction boundary. Pure: does not mutate state or dispatch.
 *
 * @param {{ state: any, view: any }} args
 * @returns {{ from: number, to: number } | null}
 */
const resolveMixedBidiBackspaceRange = ({ state, view }) => {
  const { selection } = state;
  if (!selection?.empty) return null;

  const doc = view?.dom?.ownerDocument;
  const nativeSelection = doc?.getSelection?.();
  if (!nativeSelection || nativeSelection.rangeCount === 0) return null;

  const range = nativeSelection.getRangeAt(0);
  if (!range.collapsed) return null;

  const caretPoint = resolveCaretPoint(doc, range);
  if (!caretPoint) return null;

  const lineEl = resolveLineElement(doc, caretPoint);
  if (!lineEl) return null;
  const lineText = lineEl.textContent ?? '';
  const hasRtl = STRONG_RTL_CHAR_RE.test(lineText);
  const hasLtr = STRONG_LTR_CHAR_RE.test(lineText);
  if (!hasRtl || !hasLtr) return null;

  let chars = collectVisualChars(lineEl, view, caretPoint.x);
  if (chars.length < 2) {
    // Fallback to a full scan for correctness when the local window is too narrow.
    chars = collectVisualChars(lineEl, view, null);
  }
  const boundary = resolveBoundaryChars(chars, caretPoint);
  if (!boundary) return null;

  if (!hasMixedDirectionBoundary(boundary.left.char, boundary.right.char)) return null;
  if (selection.from !== boundary.right.pmStart && selection.from !== boundary.left.pmEnd) return null;

  return { from: boundary.left.pmStart, to: boundary.left.pmEnd };
};

/**
 * Mixed-bidi Backspace command. Slotted into the keymap Backspace chain so it
 * inherits the chain's history boundary, inputType: deleteContentBackward meta,
 * track-changes wrapping, protected-range guards, and SDT handling, instead of
 * dispatching its own transaction.
 *
 * Returns true (chain stops) only when the caret is at a strong-RTL/strong-LTR
 * boundary and the visual-left character is targeted for deletion. Otherwise
 * returns false so the chain falls through to deleteSelection / joinBackward.
 *
 * @returns {import('@core/commands/types/index.js').Command}
 */
export const mixedBidiBackspace =
  () =>
  ({ state, view, tr, dispatch }) => {
    const range = resolveMixedBidiBackspaceRange({ state, view });
    if (!range) return false;

    if (dispatch) {
      tr.delete(range.from, range.to);
      tr.scrollIntoView();
    }
    return true;
  };

export const MixedBidiBackspace = Extension.create({
  name: 'mixedBidiBackspace',

  addCommands() {
    return {
      mixedBidiBackspace,
    };
  },
});

export const __TEST_ONLY__ = {
  resolveCaretPoint,
  hasMixedDirectionBoundary,
  resolveMixedBidiBackspaceRange,
};
