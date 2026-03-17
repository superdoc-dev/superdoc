import { Plugin, TextSelection } from 'prosemirror-state';
import { decodeRPrFromMarks } from '@converter/styles.js';
import { collectChangedRangesThroughTransactions } from '@utils/rangeUtils.js';
import { getFormattingStateAtPos } from '@core/helpers/getMarksFromSelection.js';

// Keep collapsed selections inside run nodes so caret geometry maps to text positions.
const normalizeSelectionIntoRun = (tr, runType) => {
  const selection = tr.selection;
  if (!(selection instanceof TextSelection)) return;
  if (selection.from !== selection.to) return;
  const $pos = tr.doc.resolve(selection.from);
  if ($pos.parent.type === runType) return;

  const nodeAfter = $pos.nodeAfter;
  if (nodeAfter?.type === runType && nodeAfter.content.size > 0) {
    const nextPos = selection.from + 1;
    if (nextPos <= tr.doc.content.size) {
      tr.setSelection(TextSelection.create(tr.doc, nextPos));
    }
    return;
  }

  const nodeBefore = $pos.nodeBefore;
  if (nodeBefore?.type === runType && nodeBefore.content.size > 0) {
    const prevPos = selection.from - 1;
    if (prevPos >= 0) {
      tr.setSelection(TextSelection.create(tr.doc, prevPos));
    }
  }
};

/**
 * Copies run properties from the current paragraph's `paragraphProperties.runProperties`
 * (set during paragraph split) and applies its marks to a text node.
 * @param {import('prosemirror-state').EditorState} state
 * @param {number} pos
 * @param {import('prosemirror-model').Node} textNode
 * @param {import('prosemirror-model').NodeType} runType
 * @param {Object} editor
 * @returns {{ runProperties: Record<string, unknown> | undefined, textNode: import('prosemirror-model').Node }}
 */
const copyRunPropertiesFromParagraph = (state, pos, textNode, runType, editor) => {
  let updatedTextNode = textNode;
  const formattingState = getFormattingStateAtPos(state, pos, editor, {
    preferParagraphRunProperties: true,
  });

  if (formattingState.resolvedMarks?.length) {
    const mergedMarks = formattingState.resolvedMarks.reduce((set, mark) => mark.addToSet(set), updatedTextNode.marks);
    updatedTextNode = updatedTextNode.mark(mergedMarks);
  }
  // Only explicit paragraph run overrides should be copied into the new run node.
  // Style/default-derived formatting stays visual so export semantics remain intact.
  return { runProperties: formattingState.inlineRunProperties, textNode: updatedTextNode };
};

const buildWrapTransaction = (state, ranges, runType, editor) => {
  if (!ranges.length) return null;

  const replacements = [];

  ranges.forEach(({ from, to }) => {
    state.doc.nodesBetween(from, to, (node, pos, parent, index) => {
      if (!node.isText || !parent || parent.type === runType) return;

      const match = parent.contentMatchAt ? parent.contentMatchAt(index) : null;
      if (match && !match.matchType(runType)) return;
      if (!match && !parent.type.contentMatch.matchType(runType)) return;

      let runProperties;
      let textNode = node;
      const originalMarks = node.marks;

      // For the first node in a paragraph, inherit run properties from the paragraph's
      // paragraphProperties.runProperties (set during split) and merge marks.
      // Only apply when the text is a direct child of the paragraph — not when it is
      // first inside an inline wrapper like structuredContent (SDT).
      if (index === 0 && parent.type.name === 'paragraph') {
        ({ runProperties, textNode } = copyRunPropertiesFromParagraph(state, pos, textNode, runType, editor));
      }

      // If we still don't have explicit runProperties, decode only the original text
      // marks. `textNode.marks` may now include visual-only style-derived marks.
      if (!runProperties) {
        runProperties = decodeRPrFromMarks(originalMarks);
      }

      const runNode = runType.create({ runProperties }, textNode);
      replacements.push({ from: pos, to: pos + node.nodeSize, runNode });
    });
  });

  if (!replacements.length) return null;

  const tr = state.tr;
  replacements.sort((a, b) => b.from - a.from).forEach(({ from, to, runNode }) => tr.replaceWith(from, to, runNode));
  normalizeSelectionIntoRun(tr, runType);

  return tr.docChanged ? tr : null;
};

export const wrapTextInRunsPlugin = (editor) => {
  let view = null;
  let pendingRanges = [];

  const flush = () => {
    if (!view) return;
    const runType = view.state.schema.nodes.run;
    if (!runType) {
      pendingRanges = [];
      return;
    }
    const tr = buildWrapTransaction(view.state, pendingRanges, runType, editor);
    pendingRanges = [];
    if (tr) {
      view.dispatch(tr);
    }
  };

  const onCompositionEnd = () => {
    if (typeof globalThis === 'undefined') return;
    globalThis.queueMicrotask(flush);
  };

  return new Plugin({
    view(editorView) {
      view = editorView;
      editorView.dom.addEventListener('compositionend', onCompositionEnd);
      return {
        destroy() {
          editorView.dom.removeEventListener('compositionend', onCompositionEnd);
          view = null;
          pendingRanges = [];
        },
      };
    },

    appendTransaction(transactions, _oldState, newState) {
      const docSize = newState.doc.content.size;
      const runType = newState.schema.nodes.run;
      if (!runType) return null;

      pendingRanges = collectChangedRangesThroughTransactions(transactions, docSize, {
        extraRanges: pendingRanges,
      });

      if (view?.composing) {
        return null;
      }

      const tr = buildWrapTransaction(newState, pendingRanges, runType, editor);
      pendingRanges = [];
      return tr;
    },
  });
};
