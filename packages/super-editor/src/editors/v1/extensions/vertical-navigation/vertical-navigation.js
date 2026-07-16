import { Extension } from '@core/Extension.js';
import { Plugin, PluginKey, TextSelection, NodeSelection } from 'prosemirror-state';
import { DOM_CLASS_NAMES } from '@superdoc/dom-contract';
import { CellSelection } from 'prosemirror-tables';

export const VerticalNavigationPluginKey = new PluginKey('verticalNavigation');

/**
 * Creates the default plugin state for vertical navigation.
 * @returns {{ goalX: number | null }} State with no goal X position set.
 */
const createDefaultState = () => ({
  goalX: null,
  goalClientX: null,
});

/**
 * Enables vertical caret navigation in presentation mode by preserving a goal X
 * column and translating Up/Down arrow presses into layout-engine hit tests.
 * This keeps the caret aligned across wrapped lines, fragments, and pages while
 * respecting selection extension and avoiding non-text selections.
 */
export const VerticalNavigation = Extension.create({
  name: 'verticalNavigation',

  /**
   * Registers ProseMirror plugins used for vertical navigation.
   * @returns {import('prosemirror-state').Plugin[]} Plugin list, empty when disabled.
   */
  addPmPlugins() {
    if (this.editor.options?.isHeaderOrFooter) return [];
    if (this.editor.options?.isHeadless) return [];

    const editor = this.editor;
    const plugin = new Plugin({
      key: VerticalNavigationPluginKey,
      state: {
        /**
         * Initializes plugin state.
         * @returns {{ goalX: number | null }} Initial plugin state.
         */
        init: () => createDefaultState(),
        /**
         * Updates plugin state based on transaction metadata and selection changes.
         * @param {import('prosemirror-state').Transaction} tr
         * @param {{ goalX: number | null }} value
         * @returns {{ goalX: number | null }}
         */
        apply(tr, value) {
          const meta = tr.getMeta(VerticalNavigationPluginKey);
          if (meta?.type === 'vertical-move') {
            return {
              goalX: meta.goalX ?? value.goalX ?? null,
              goalClientX: meta.goalClientX ?? value.goalClientX ?? null,
            };
          }
          if (meta?.type === 'set-goal-x') {
            return {
              ...value,
              goalX: meta.goalX ?? null,
              goalClientX: meta.goalClientX ?? null,
            };
          }
          if (meta?.type === 'reset-goal-x') {
            return {
              ...value,
              goalX: null,
              goalClientX: null,
            };
          }
          if (tr.selectionSet) {
            return {
              ...value,
              goalX: null,
              goalClientX: null,
            };
          }
          return value;
        },
      },
      props: {
        /**
         * Handles vertical navigation key presses while presenting.
         * @param {import('prosemirror-view').EditorView} view
         * @param {KeyboardEvent} event
         * @returns {boolean} Whether the event was handled.
         */
        handleKeyDown(view, event) {
          // Guard clauses
          if (view.composing || !editor.isEditable) return false;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          }
          if (event.key === 'Home' || event.key === 'End') {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            if (!isPresenting(editor)) return false;
            if (event.ctrlKey || event.metaKey || event.altKey) return false;
            const targetPos = resolveLineBoundaryPosition(editor, view.state.selection, event.key);
            if (!Number.isFinite(targetPos)) return false;
            const selection = buildSelection(view.state, targetPos, event.shiftKey);
            if (!selection) return false;
            view.dispatch(view.state.tr.setSelection(selection));
            return true;
          }
          if (event.key === 'PageUp' || event.key === 'PageDown') {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;

          if (!isPresenting(editor)) {
            return false;
          }

          // Basic logic:
          // 1. On first vertical move, record goal X from current caret position (in layout space coordinates).
          // 2. Find adjacent line element in the desired direction.
          // 3. Perform hit test at (goal X, adjacent line center Y) to find target position.
          // 4. Move selection to target position, extending if Shift is held.

          // 1. Get or set goal X (layout space for the body fallback, client
          //    space for hit testing — the two only coincide for body surfaces).
          const pluginState = VerticalNavigationPluginKey.getState(view.state);
          let goalX = pluginState?.goalX;
          let goalClientX = pluginState?.goalClientX;
          const coords = getCurrentCoords(editor, view.state.selection);
          if (!coords) return false;
          if (goalX == null || goalClientX == null) {
            goalX = coords?.x;
            goalClientX = coords?.clientX;
            if (!Number.isFinite(goalX) || !Number.isFinite(goalClientX)) return false;
            view.dispatch(
              view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'set-goal-x', goalX, goalClientX }),
            );
          }

          // 2. Find adjacent line
          const adjacent = getAdjacentLineClientTarget(editor, coords, event.key === 'ArrowUp' ? -1 : 1);
          if (!adjacent) return false;

          // 3. Hit test at (goal X, adjacent line center Y).
          //    When the adjacent line is outside the visible viewport (e.g., crossing
          //    a page boundary), hit testing with screen coordinates produces incorrect
          //    positions. In that case, fall back to layout-based position resolution
          //    using the line's PM position range and computeCaretLayoutRect.
          // SD-3400: note sessions resolve the goal column natively on the
          // painted adjacent line via caretRangeFromPoint — pure client space,
          // no layout conversions (which mix coordinate systems for notes).
          const isNoteSession = Boolean(editor?.options?.parentEditor && !editor?.options?.isHeaderOrFooter);
          let hit = null;
          if (isNoteSession && adjacent.lineElement) {
            const ownerDoc = editor.presentationEditor?.visibleHost?.ownerDocument ?? document;
            hit = resolvePositionAtClientPoint(ownerDoc, adjacent.lineElement, goalClientX);
          }
          if (!hit) {
            // Hit test directly in client space — the goal column came from the
            // painted caret, so no layout-to-client conversion is needed.
            hit = editor.presentationEditor.hitTest(goalClientX, adjacent.clientY);
          }

          // Check if the hit test result is plausible: if the adjacent line has PM
          // position data, the hit should land within or very close to that range.
          // A miss indicates off-screen coordinate mapping failure or fragment
          // boundary misalignment (adjacent line center Y mapping to wrong fragment).
          //
          // Tolerance is kept small (5 positions) to catch cases where the hit
          // lands on the current line's fragment start instead of the adjacent
          // line — this causes the cursor to appear stuck since the "new" position
          // equals the current one.
          if (!isNoteSession && adjacent.pmStart != null && adjacent.pmEnd != null) {
            const TOLERANCE = 5;
            const hitPos = hit?.pos;
            if (
              !hit ||
              !Number.isFinite(hitPos) ||
              hitPos < adjacent.pmStart - TOLERANCE ||
              hitPos > adjacent.pmEnd + TOLERANCE
            ) {
              // Hit test produced a position outside the adjacent line's range.
              // Resolve position directly from layout data using binary search at goalX.
              hit = resolvePositionAtGoalX(editor, adjacent.pmStart, adjacent.pmEnd, goalX, adjacent.isRtl);
            }
          }

          if (!hit || !Number.isFinite(hit.pos)) return false;

          // 4. Move selection
          const selection = buildSelection(view.state, hit.pos, event.shiftKey);
          if (!selection) return false;
          view.dispatch(
            view.state.tr
              .setMeta(VerticalNavigationPluginKey, { type: 'vertical-move', goalX, goalClientX })
              .setSelection(selection),
          );
          return true;
        },
        handleDOMEvents: {
          /**
           * Resets goal X on pointer-driven selection changes.
           * @param {import('prosemirror-view').EditorView} view
           * @returns {boolean}
           */
          mousedown: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
          /**
           * Resets goal X on touch-driven selection changes.
           * @param {import('prosemirror-view').EditorView} view
           * @returns {boolean}
           */
          touchstart: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
          /**
           * Resets goal X when IME composition starts.
           * @param {import('prosemirror-view').EditorView} view
           * @returns {boolean}
           */
          compositionstart: (view) => {
            view.dispatch(view.state.tr.setMeta(VerticalNavigationPluginKey, { type: 'reset-goal-x' }));
            return false;
          },
        },
      },
    });

    return [plugin];
  },
});

/**
 * Determines whether the editor is the active presentation editor.
 * @param {Object} editor
 * @returns {boolean}
 */
function isPresenting(editor) {
  const presentationCtx = editor?.presentationEditor;
  if (!presentationCtx) return false;
  const activeEditor = presentationCtx.getActiveEditor?.();
  return activeEditor === editor;
}

/**
 * Gets the current caret coordinates in both layout and client space.
 * @param {Object} editor
 * @param {import('prosemirror-state').Selection} selection
 * @returns {{ clientX: number, clientY: number, height: number, x: number, y: number } | null}
 */
function getCurrentCoords(editor, selection) {
  const presentationEditor = editor.presentationEditor;
  const layoutSpaceCoords = presentationEditor.computeCaretLayoutRect(selection.head);

  // SD-3400: the painted caret overlay is the ground truth in client space.
  // computeCaretLayoutRect + denormalizeClientPoint disagree on coordinate
  // spaces for note sessions (stacked vs page-local y), which broke goal-x
  // and produced off-screen client points for arrows inside footnotes.
  const doc = presentationEditor?.visibleHost?.ownerDocument ?? document;
  const caretRect = doc.querySelector('.presentation-editor__selection-caret')?.getBoundingClientRect?.();
  if (caretRect && caretRect.height > 0) {
    return {
      clientX: caretRect.left,
      clientY: caretRect.top,
      height: caretRect.height,
      x: layoutSpaceCoords?.x ?? caretRect.left,
      y: layoutSpaceCoords?.y ?? caretRect.top,
    };
  }

  if (!layoutSpaceCoords) return null;
  const clientCoords = presentationEditor.denormalizeClientPoint(
    layoutSpaceCoords.x,
    layoutSpaceCoords.y,
    layoutSpaceCoords.pageIndex,
    layoutSpaceCoords.height,
  );
  return {
    clientX: clientCoords.x,
    clientY: clientCoords.y,
    height: clientCoords.height,
    x: layoutSpaceCoords.x,
    y: layoutSpaceCoords.y,
  };
}

/**
 * Resolves the PM boundary position for Home/End within the current visual line.
 *
 * @param {Object} editor
 * @param {import('prosemirror-state').Selection} selection
 * @param {'Home'|'End'} key
 * @returns {number | null}
 */
function resolveLineBoundaryPosition(editor, selection, key) {
  const coords = getCurrentCoords(editor, selection);
  if (!coords) return null;
  const doc = editor.presentationEditor?.visibleHost?.ownerDocument ?? document;
  const caretX = coords.clientX;
  const caretY = coords.clientY + coords.height / 2;
  const lineEl = findLineElementAtPoint(doc, caretX, caretY);
  if (!lineEl) return null;

  let pmStart = Number(lineEl.dataset?.pmStart);
  let pmEnd = Number(lineEl.dataset?.pmEnd);
  if (!Number.isFinite(pmStart) || !Number.isFinite(pmEnd)) return null;
  // SD-3400: translate stale note ranges into current coordinates.
  ({ pmStart, pmEnd } = translateStaleNoteLineRange(editor, lineEl, pmStart, pmEnd));
  return key === 'Home' ? pmStart : pmEnd;
}

/**
 * Browser-portable caret-from-point: WebKit/Blink expose caretRangeFromPoint,
 * Firefox exposes caretPositionFromPoint. Normalizes both to {node, offset}.
 * Without the Firefox branch, note sessions silently fell back to the
 * mixed-coordinate hitTest path and the goal column drifted.
 *
 * @param {Document} ownerDoc
 * @param {number} x
 * @param {number} y
 * @returns {{ node: Node, offset: number } | null}
 */
function caretPointFromClientPoint(ownerDoc, x, y) {
  if (typeof ownerDoc.caretRangeFromPoint === 'function') {
    const range = ownerDoc.caretRangeFromPoint(x, y);
    if (range?.startContainer) return { node: range.startContainer, offset: range.startOffset };
  }
  if (typeof ownerDoc.caretPositionFromPoint === 'function') {
    const caret = ownerDoc.caretPositionFromPoint(x, y);
    if (caret?.offsetNode) return { node: caret.offsetNode, offset: caret.offset };
  }
  return null;
}

/**
 * Resolves the ProseMirror position at a client X on a painted line using the
 * browser's native point-to-text mapping ({@link caretPointFromClientPoint})
 * and the line's leaf pm attributes. Pure client space — no layout/client
 * conversions.
 *
 * @param {Document} ownerDoc
 * @param {Element} lineEl
 * @param {number} clientX
 * @returns {{ pos: number } | null}
 */
function resolvePositionAtClientPoint(ownerDoc, lineEl, clientX) {
  const lineRect = lineEl.getBoundingClientRect?.();
  if (!lineRect || lineRect.height === 0) return null;
  const y = lineRect.top + lineRect.height / 2;
  const x = Math.max(lineRect.left, Math.min(clientX, lineRect.right - 1));

  // Browser globals via the document's own window (also keeps the file free
  // of DOM globals for lint environments without them).
  const win = ownerDoc.defaultView;
  if (!win) return null;

  const hit = caretPointFromClientPoint(ownerDoc, x, y);
  if (hit?.node) {
    const node = hit.node;
    const host = node.nodeType === win.Node.TEXT_NODE ? node.parentElement : node;
    const leaf = host?.closest?.('[data-pm-start][data-pm-end]');
    if (leaf && lineEl.contains(leaf)) {
      const pmStart = Number(leaf.dataset?.pmStart);
      const pmEnd = Number(leaf.dataset?.pmEnd);
      if (Number.isFinite(pmStart)) {
        let offset = 0;
        const walker = ownerDoc.createTreeWalker(leaf, win.NodeFilter.SHOW_TEXT);
        let current = walker.nextNode();
        while (current) {
          if (current === node) {
            offset += hit.offset;
            break;
          }
          offset += current.textContent?.length ?? 0;
          current = walker.nextNode();
        }
        const pos = pmStart + offset;
        return { pos: Number.isFinite(pmEnd) ? Math.min(pos, pmEnd) : pos };
      }
    }
  }

  // Point fell outside text (margins): clamp to the line's edges.
  const lineStart = Number(lineEl.dataset?.pmStart);
  const lineEnd = Number(lineEl.dataset?.pmEnd);
  if (clientX <= lineRect.left && Number.isFinite(lineStart)) return { pos: lineStart };
  if (Number.isFinite(lineEnd)) return { pos: lineEnd };
  return null;
}

/**
 * SD-3400: painted pm ranges of unchanged note paragraphs drift after edits
 * (the painter skips repainting them), so the adjacent line's data-pm range
 * can be stale. Translate it into CURRENT session coordinates by anchoring on
 * the line's paragraph block: find the block in the live doc by sdBlockId and
 * shift the range by (current block content start - fragment first pmStart).
 * Returns the input range unchanged when translation is not applicable.
 *
 * @param {Object} editor
 * @param {Element} lineEl
 * @param {number} pmStart
 * @param {number} pmEnd
 * @returns {{ pmStart: number, pmEnd: number }}
 */
function translateStaleNoteLineRange(editor, lineEl, pmStart, pmEnd) {
  const isNoteSession = Boolean(editor?.options?.parentEditor && !editor?.options?.isHeaderOrFooter);
  if (!isNoteSession) return { pmStart, pmEnd };

  const fragEl = lineEl.closest?.('[data-block-id]');
  const blockIdAttr = fragEl?.getAttribute?.('data-block-id') ?? '';
  const doc = editor.state?.doc;
  if (!fragEl || !blockIdAttr || !doc) return { pmStart, pmEnd };

  // Anchor: the smallest painted pmStart across the fragment's lines.
  let fragmentFirstStart = Infinity;
  for (const line of fragEl.querySelectorAll('.superdoc-line[data-pm-start]')) {
    const start = Number(line.dataset?.pmStart);
    if (Number.isFinite(start)) fragmentFirstStart = Math.min(fragmentFirstStart, start);
  }
  if (!Number.isFinite(fragmentFirstStart)) return { pmStart, pmEnd };

  let delta = null;
  doc.descendants((node, pos) => {
    if (delta != null) return false;
    if (!node.isBlock) return true;
    const id = node.attrs?.sdBlockId;
    if (typeof id !== 'string' || !id || !blockIdAttr.endsWith(id)) return true;
    let firstLeaf = null;
    node.descendants((child, childPos) => {
      if (firstLeaf != null) return false;
      if (child.isInline && (child.isLeaf || child.isText)) {
        firstLeaf = pos + 1 + childPos;
        return false;
      }
      return true;
    });
    const currentStart = firstLeaf ?? pos + 1;
    delta = currentStart - fragmentFirstStart;
    return false;
  });
  if (delta == null || delta === 0) return { pmStart, pmEnd };
  return { pmStart: pmStart + delta, pmEnd: pmEnd + delta };
}

/**
 * Finds the adjacent line center Y in client space and associated page index.
 * Also returns the PM position range from the line's data attributes so that
 * when the adjacent line is outside the viewport (off-screen), the caller can
 * resolve the target position directly from layout data rather than relying on
 * hit testing with potentially inaccurate screen coordinates.
 *
 * @param {Object} editor
 * @param {{ clientX: number, clientY: number, height: number }} coords
 * @param {number} direction -1 for up, 1 for down.
 * @returns {{ clientY: number, pageIndex?: number, pmStart?: number, pmEnd?: number } | null}
 */
function getAdjacentLineClientTarget(editor, coords, direction) {
  const presentationEditor = editor.presentationEditor;
  const doc = presentationEditor.visibleHost?.ownerDocument ?? document;
  const caretX = coords.clientX;
  const caretY = coords.clientY + coords.height / 2;
  const currentLine = findLineElementAtPoint(doc, caretX, caretY);
  if (!currentLine) return null;
  const adjacentLine = findAdjacentLineElement(currentLine, direction, caretX);
  if (!adjacentLine) return null;
  const pageEl = adjacentLine.closest?.(`.${DOM_CLASS_NAMES.PAGE}`);
  const pageIndex = pageEl ? Number(pageEl.dataset.pageIndex ?? 'NaN') : null;
  const rect = adjacentLine.getBoundingClientRect();
  const clientY = rect.top + rect.height / 2;
  if (!Number.isFinite(clientY)) return null;

  // Read PM position range from data attributes for layout-based fallback.
  // SD-3400: translate stale note ranges into current coordinates.
  let pmStart = Number(adjacentLine.dataset?.pmStart);
  let pmEnd = Number(adjacentLine.dataset?.pmEnd);
  if (Number.isFinite(pmStart) && Number.isFinite(pmEnd)) {
    ({ pmStart, pmEnd } = translateStaleNoteLineRange(editor, adjacentLine, pmStart, pmEnd));
  }

  // Read direction from the visual DOM — DomPainter sets dir="rtl" on RTL lines
  // using fully resolved properties (style cascade, not just inline attrs).
  const isRtl = adjacentLine.closest?.('[dir="rtl"]') != null;

  return {
    clientY,
    pageIndex: Number.isFinite(pageIndex) ? pageIndex : undefined,
    pmStart: Number.isFinite(pmStart) ? pmStart : undefined,
    pmEnd: Number.isFinite(pmEnd) ? pmEnd : undefined,
    isRtl,
    lineElement: adjacentLine,
  };
}

/**
 * Builds a text selection for the target position, optionally extending.
 * @param {import('prosemirror-state').EditorState} state
 * @param {number} pos
 * @param {boolean} extend
 * @returns {import('prosemirror-state').Selection | null}
 */
function buildSelection(state, pos, extend) {
  const { doc, selection } = state;
  if (selection instanceof NodeSelection || selection instanceof CellSelection) {
    return null;
  }
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  if (extend) {
    const anchor = selection.anchor ?? selection.from;
    return TextSelection.create(doc, anchor, clamped);
  }
  return TextSelection.create(doc, clamped);
}

/**
 * Finds a line element at the given client point.
 * @param {Document} doc
 * @param {number} x
 * @param {number} y
 * @returns {Element | null}
 */
function findLineElementAtPoint(doc, x, y) {
  if (typeof doc?.elementsFromPoint !== 'function') return null;
  const chain = doc.elementsFromPoint(x, y) ?? [];
  for (const el of chain) {
    if (el?.classList?.contains?.(DOM_CLASS_NAMES.LINE)) return el;
  }
  return null;
}

/**
 * Locates the visually adjacent line element across fragments/pages.
 * @param {Element} currentLine
 * @param {number} direction -1 for up, 1 for down.
 * @param {number} caretX
 * @returns {Element | null}
 */
function findAdjacentLineElement(currentLine, direction, caretX) {
  const pageClass = DOM_CLASS_NAMES.PAGE;
  const page = currentLine.closest?.(`.${pageClass}`);
  if (!page) return null;

  const currentLineMetrics = getLineMetrics(currentLine);
  if (!currentLineMetrics) return null;

  const currentPageLines = getPageLineElements(page);
  const adjacentOnCurrentPage = findClosestLineInDirection(
    currentPageLines,
    currentLine,
    currentLineMetrics,
    direction,
    caretX,
  );
  if (adjacentOnCurrentPage) return adjacentOnCurrentPage;

  const pages = Array.from(page.parentElement?.querySelectorAll?.(`.${pageClass}`) ?? []);
  const pageIndex = pages.indexOf(page);
  if (pageIndex === -1) return null;
  const nextPage = pages[pageIndex + direction];
  if (!nextPage) return null;
  const nextPageLines = getPageLineElements(nextPage);
  return findEdgeLineForPage(nextPageLines, direction, caretX);
}

/**
 * Resolves the PM position at a given goalX within a line's position range.
 *
 * Uses binary search with computeCaretLayoutRect to find the position within
 * [pmStart, pmEnd] whose layout X is closest to goalX. This avoids relying on
 * screen-space hit testing, which fails when the target line is outside the
 * visible viewport (e.g., after crossing a page boundary).
 *
 * @param {Object} editor
 * @param {number} pmStart - Start PM position of the target line.
 * @param {number} pmEnd - End PM position of the target line.
 * @param {number} goalX - Target X coordinate in layout space.
 * @param {boolean} [isRtl=false] - Whether the target line is RTL. In RTL lines,
 *   X decreases as PM position increases, so the binary search must be inverted.
 * @returns {{ pos: number } | null}
 */
export function resolvePositionAtGoalX(editor, pmStart, pmEnd, goalX, isRtl = false) {
  const presentationEditor = editor.presentationEditor;
  let bestPos = pmStart;
  let bestDist = Infinity;

  let lo = pmStart;
  let hi = pmEnd;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const rect = presentationEditor.computeCaretLayoutRect(mid);
    if (!rect || !Number.isFinite(rect.x)) {
      // Can't measure this position (e.g. inline node boundary) — skip it
      // and continue searching. Breaking here would fall back to pmStart,
      // causing the caret to jump to the line start.
      lo = mid + 1;
      continue;
    }

    const dist = Math.abs(rect.x - goalX);
    if (dist < bestDist) {
      bestDist = dist;
      bestPos = mid;
    }

    if (rect.x < goalX) {
      // In LTR, X < goalX means search higher positions (further right).
      // In RTL, X < goalX means search lower positions (further right in RTL).
      if (isRtl) hi = mid - 1;
      else lo = mid + 1;
    } else if (rect.x > goalX) {
      if (isRtl) lo = mid + 1;
      else hi = mid - 1;
    } else {
      // Exact match
      break;
    }
  }

  return { pos: bestPos };
}

/**
 * Returns all non-header/footer line elements for a page.
 * @param {Element} page
 * @returns {Element[]}
 */
function getPageLineElements(page) {
  const fragmentClass = DOM_CLASS_NAMES.FRAGMENT;
  const lineClass = DOM_CLASS_NAMES.LINE;
  const headerClass = 'superdoc-page-header';
  const footerClass = 'superdoc-page-footer';

  return Array.from(page.querySelectorAll(`.${fragmentClass}`))
    .filter((fragment) => !fragment.closest?.(`.${headerClass}, .${footerClass}`))
    .flatMap((fragment) => Array.from(fragment.querySelectorAll(`.${lineClass}`)));
}

/**
 * Chooses the closest visual line in the requested direction.
 * @param {Element[]} lineEls
 * @param {Element} currentLine
 * @param {NonNullable<ReturnType<typeof getLineMetrics>>} currentMetrics
 * @param {number} direction
 * @param {number} caretX
 * @returns {Element | null}
 */
function findClosestLineInDirection(lineEls, currentLine, currentMetrics, direction, caretX) {
  const directionalCandidates = lineEls
    .filter((line) => line !== currentLine)
    .map((line) => ({ line, metrics: getLineMetrics(line) }))
    .filter(({ metrics }) => metrics && isLineInDirection(metrics.centerY, currentMetrics.centerY, direction));

  if (directionalCandidates.length === 0) return null;

  const nearestVerticalDistance = directionalCandidates.reduce((minDistance, { metrics }) => {
    const distance = Math.abs(metrics.centerY - currentMetrics.centerY);
    return Math.min(minDistance, distance);
  }, Infinity);

  const targetRowCenterY = directionalCandidates
    .filter(({ metrics }) =>
      isWithinTolerance(Math.abs(metrics.centerY - currentMetrics.centerY), nearestVerticalDistance, 1),
    )
    .reduce((bestCenterY, { metrics }) => {
      if (bestCenterY == null) return metrics.centerY;
      return direction > 0 ? Math.min(bestCenterY, metrics.centerY) : Math.max(bestCenterY, metrics.centerY);
    }, null);

  if (!Number.isFinite(targetRowCenterY)) return null;

  const rowCandidates = directionalCandidates.filter(({ metrics }) =>
    isWithinTolerance(metrics.centerY, targetRowCenterY, getRowTolerance(currentMetrics, metrics)),
  );

  return chooseLineClosestToX(rowCandidates, caretX);
}

/**
 * Chooses the first/last visual row on a page, then the line closest to caretX.
 * @param {Element[]} lineEls
 * @param {number} direction
 * @param {number} caretX
 * @returns {Element | null}
 */
function findEdgeLineForPage(lineEls, direction, caretX) {
  const candidates = lineEls.map((line) => ({ line, metrics: getLineMetrics(line) })).filter(({ metrics }) => metrics);

  if (candidates.length === 0) return null;

  const targetRowCenterY = candidates.reduce((edgeCenterY, { metrics }) => {
    if (edgeCenterY == null) return metrics.centerY;
    return direction > 0 ? Math.min(edgeCenterY, metrics.centerY) : Math.max(edgeCenterY, metrics.centerY);
  }, null);

  if (!Number.isFinite(targetRowCenterY)) return null;

  const rowCandidates = candidates.filter(({ metrics }) =>
    isWithinTolerance(metrics.centerY, targetRowCenterY, Math.max(metrics.height / 2, 1)),
  );

  return chooseLineClosestToX(rowCandidates, caretX);
}

/**
 * Picks the line whose horizontal span is closest to the requested caret X.
 * @param {{ line: Element, metrics: ReturnType<typeof getLineMetrics> }[]} candidates
 * @param {number} caretX
 * @returns {Element | null}
 */
function chooseLineClosestToX(candidates, caretX) {
  if (candidates.length === 0) return null;

  let best = null;
  for (const candidate of candidates) {
    const horizontalDistance = getHorizontalDistanceToLine(candidate.metrics, caretX);
    const centerDistance = Math.abs(candidate.metrics.centerX - caretX);
    if (
      !best ||
      horizontalDistance < best.horizontalDistance ||
      (horizontalDistance === best.horizontalDistance && centerDistance < best.centerDistance)
    ) {
      best = {
        line: candidate.line,
        horizontalDistance,
        centerDistance,
      };
    }
  }

  return best?.line ?? null;
}

/**
 * Reads the geometry used for visual row and column matching.
 * @param {Element} line
 * @returns {{ top: number, bottom: number, left: number, right: number, height: number, centerX: number, centerY: number } | null}
 */
function getLineMetrics(line) {
  const rect = line?.getBoundingClientRect?.();
  if (!rect) return null;

  const { top, bottom, left, right, height, width } = rect;
  if (![top, bottom, left, right, height, width].every(Number.isFinite)) return null;

  return {
    top,
    bottom,
    left,
    right,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

/**
 * Returns whether a line center lies above or below the current line center.
 * @param {number} lineCenterY
 * @param {number} currentCenterY
 * @param {number} direction
 * @returns {boolean}
 */
function isLineInDirection(lineCenterY, currentCenterY, direction) {
  const epsilon = 1;
  return direction > 0 ? lineCenterY > currentCenterY + epsilon : lineCenterY < currentCenterY - epsilon;
}

/**
 * Returns whether two numeric values are within a tolerance.
 * @param {number} value
 * @param {number} expected
 * @param {number} tolerance
 * @returns {boolean}
 */
function isWithinTolerance(value, expected, tolerance) {
  return Math.abs(value - expected) <= tolerance;
}

/**
 * Determines the Y tolerance for considering lines part of the same visual row.
 * @param {{ height: number }} currentMetrics
 * @param {{ height: number }} candidateMetrics
 * @returns {number}
 */
function getRowTolerance(currentMetrics, candidateMetrics) {
  return Math.max(Math.min(currentMetrics.height, candidateMetrics.height) / 2, 1);
}

/**
 * Returns the horizontal distance from the caret X to a line's bounds.
 * @param {{ left: number, right: number }} metrics
 * @param {number} caretX
 * @returns {number}
 */
function getHorizontalDistanceToLine(metrics, caretX) {
  if (caretX < metrics.left) return metrics.left - caretX;
  if (caretX > metrics.right) return caretX - metrics.right;
  return 0;
}
