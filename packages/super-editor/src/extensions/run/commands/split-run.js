// @ts-check
import { NodeSelection, TextSelection, AllSelection } from 'prosemirror-state';
import { canSplit } from 'prosemirror-transform';
import { defaultBlockAt } from '@core/helpers/defaultBlockAt.js';
import { resolveRunProperties, encodeMarksFromRPr } from '@core/super-converter/styles.js';
import { extractTableInfo } from '../calculateInlineRunPropertiesPlugin.js';

/**
 * Splits a run node at the current selection into two paragraphs.
 * @returns {import('@core/commands/types').Command}
 */
export const splitRunToParagraph = () => (props) => {
  const { state, view, tr, editor } = props;
  const { $from, empty } = state.selection;
  if (!empty) return false;
  if ($from.parent.type.name !== 'run') return false;

  let dispatchTransaction = null;
  if (view?.dispatch) {
    dispatchTransaction = view.dispatch.bind(view);
  } else if (editor?.dispatch) {
    dispatchTransaction = editor.dispatch.bind(editor);
  }
  if (!dispatchTransaction) return false;

  const handled = splitBlockPatch(
    state,
    (transaction) => {
      dispatchTransaction(transaction);
    },
    editor,
  );

  if (handled) {
    tr.setMeta('preventDispatch', true);
  }

  return handled;
};

/**
 * Minimal copy of ProseMirror splitBlock logic that tolerates splitting runs.
 * Enhanced to preserve paragraph attributes and apply style-based marks.
 * @param {import('prosemirror-state').EditorState} state
 * @param {(tr: import('prosemirror-state').Transaction) => void} dispatch
 * @param {Object} [editor]
 */
export function splitBlockPatch(state, dispatch, editor) {
  let { $from } = state.selection;
  if (state.selection instanceof NodeSelection && state.selection.node.isBlock) {
    if (!$from.parentOffset || !canSplit(state.doc, $from.pos)) return false;
    if (dispatch) dispatch(state.tr.split($from.pos).scrollIntoView());
    return true;
  }

  if (!$from.depth) return false;
  let types = [];
  let splitDepth,
    deflt,
    paragraphAttrs = null,
    atEnd = false,
    atStart = false,
    tableInfo = null;
  for (let d = $from.depth; d > 0; d--) {
    let node = $from.node(d);
    if (node.isBlock) {
      if (node.type.name === 'paragraph') {
        atEnd = $from.end(d) == $from.pos + ($from.depth - d);
        atStart = $from.start(d) == $from.pos - ($from.depth - d);
        deflt = defaultBlockAt($from.node(d - 1).contentMatchAt($from.indexAfter(d - 1)));
        paragraphAttrs = /** @type {Record<string, unknown>} */ ({
          ...node.attrs,
          // Ensure newly created block gets a fresh ID (block-node plugin assigns one)
          sdBlockId: null,
          sdBlockRev: null,
          // Reset DOCX identifiers on split to avoid duplicate paragraph IDs
          paraId: null,
          textId: null,
        });
        types.unshift({ type: deflt || node.type, attrs: paragraphAttrs });
        splitDepth = d;
      } else if (node.type.name === 'tableCell') {
        tableInfo = extractTableInfo($from, d);
        break;
      }
    } else if (paragraphAttrs == null) {
      if (d == 1) return false;
      types.unshift(null);
    }
  }

  let tr = state.tr;
  if (state.selection instanceof TextSelection || state.selection instanceof AllSelection) tr.deleteSelection();
  let splitPos = tr.mapping.map($from.pos);
  let can = canSplit(tr.doc, splitPos, types.length, types);
  if (!can) {
    types[0] = deflt ? { type: deflt, attrs: paragraphAttrs } : null;
    can = canSplit(tr.doc, splitPos, types.length, types);
  }
  if (!can) return false;
  tr.split(splitPos, types.length, types);
  if (!atEnd && atStart && $from.node(splitDepth).type != deflt) {
    let first = tr.mapping.map($from.before(splitDepth)),
      $first = tr.doc.resolve(first);
    if (deflt && $from.node(splitDepth - 1).canReplaceWith($first.index(), $first.index() + 1, deflt))
      tr.setNodeMarkup(tr.mapping.map($from.before(splitDepth)), deflt);
  }

  applyStyleMarks(state, tr, editor, paragraphAttrs, tableInfo);

  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Applies style-based marks to a transaction after a block split operation.
 * Resolves run properties from paragraph styles and converts them to editor marks.
 * If the selection already has marks, those take precedence over style-based marks.
 *
 * @param {import('prosemirror-state').EditorState} state - The current editor state.
 * @param {import('prosemirror-state').Transaction} tr - The transaction to modify with marks.
 * @param {Object} editor - The editor instance containing the converter.
 * @param {{ paragraphProperties?: { styleId?: string, numberingProperties?: Record<string, unknown> } } | null} paragraphAttrs - The paragraph attributes containing style information.
 * @param {{
 *   tableProperties: Record<string, any>|null,
 *   rowIndex: number,
 *   cellIndex: number,
 *   numCells: number,
 *   numRows: number,
 * }|null} tableInfo - Information about the table context if the split is occurring within a table cell.
 * @returns {void}
 *
 * @remarks
 * This function performs the following steps:
 * 1. Extracts the styleId from paragraph attributes
 * 2. Resolves run properties from the paragraph style using the converter
 * 3. Encodes resolved properties into mark definitions
 * 4. Checks if selection already has marks (user-applied formatting)
 * 5. Applies either selection marks or style-based marks to the transaction
 * 6. Stores mark definitions in transaction metadata for downstream plugins
 *
 * Error handling: Failures are silently ignored to ensure typing continues to work
 * even if style resolution fails. This is intentional defensive programming.
 */
function applyStyleMarks(state, tr, editor, paragraphAttrs, tableInfo) {
  const styleId = paragraphAttrs?.paragraphProperties?.styleId;
  if (!editor?.converter && !styleId) {
    return;
  }

  try {
    const params = {
      docx: editor?.converter?.convertedXml ?? {},
      numbering: editor?.converter?.numbering ?? {},
      translatedNumbering: editor?.converter?.translatedNumbering ?? {},
      translatedLinkedStyles: editor?.converter?.translatedLinkedStyles ?? {},
    };
    const resolvedPpr = styleId ? { styleId } : {};
    const runProperties = styleId
      ? resolveRunProperties(
          params,
          {},
          resolvedPpr,
          tableInfo,
          false,
          Boolean(paragraphAttrs.paragraphProperties?.numberingProperties),
        )
      : {};
    /** @type {Array<{type: string, attrs: Record<string, unknown>}>} */
    const markDefsFromStyle = styleId
      ? /** @type {Array<{type: string, attrs: Record<string, unknown>}>} */ (
          encodeMarksFromRPr(runProperties, editor?.converter?.convertedXml ?? {})
        )
      : [];

    const selectionMarks = state.selection?.$from?.marks ? state.selection.$from.marks() : [];
    const selectionMarkDefs = selectionMarks.map((mark) => ({ type: mark.type.name, attrs: mark.attrs }));

    /** @type {Array<{type: string, attrs: Record<string, unknown>}>} */
    const markDefsToApply = selectionMarks.length ? selectionMarkDefs : markDefsFromStyle;

    const marksToApply = markDefsToApply
      .map((def) => {
        const markType = state.schema.marks[def.type];
        return markType ? markType.create(def.attrs) : null;
      })
      .filter(Boolean);

    if (marksToApply.length > 0) {
      tr.ensureMarks(marksToApply);
      tr.setMeta('sdStyleMarks', markDefsToApply);
    }
  } catch {
    // ignore failures; typing still works without style marks
  }
}

export const splitRunAtCursor = () => (props) => {
  let { state, dispatch, tr } = props;
  const sel = state.selection;
  if (!sel.empty) return false;

  const $pos = sel.$from;
  const runType = state.schema.nodes.run;
  if ($pos.parent.type !== runType) return false;

  const run = $pos.parent;
  const offset = $pos.parentOffset;
  const runStart = $pos.before();
  const runEnd = runStart + run.nodeSize;

  const leftFrag = run.content.cut(0, offset);
  const rightFrag = run.content.cut(offset);

  const leftRun = runType.create(run.attrs, leftFrag, run.marks);
  const rightRun = runType.create(run.attrs, rightFrag, run.marks);
  const gapPos = runStart + leftRun.nodeSize;
  tr.replaceWith(runStart, runEnd, [leftRun, rightRun]).setSelection(TextSelection.create(tr.doc, gapPos));

  if (dispatch) {
    dispatch(tr);
  }
  return true;
};
