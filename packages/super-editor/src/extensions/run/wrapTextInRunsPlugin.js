import { Plugin, TextSelection } from 'prosemirror-state';
import { decodeRPrFromMarks, encodeMarksFromRPr } from '@converter/styles.js';
import { carbonCopy } from '@core/utilities/carbonCopy';

const mergeRanges = (ranges, docSize) => {
  if (!ranges.length) return [];
  const sorted = ranges
    .map(({ from, to }) => ({
      from: Math.max(0, from),
      to: Math.min(docSize, to),
    }))
    .filter(({ from, to }) => from < to)
    .sort((a, b) => a.from - b.from);

  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
};

const collectChangedRanges = (trs, docSize) => {
  const ranges = [];
  trs.forEach((tr) => {
    if (!tr.docChanged) return;
    tr.mapping.maps.forEach((map) => {
      map.forEach((oldStart, oldEnd, newStart, newEnd) => {
        if (newStart !== oldStart || oldEnd !== newEnd) {
          ranges.push({ from: newStart, to: newEnd });
        }
      });
    });
  });
  return mergeRanges(ranges, docSize);
};

const mapRangesThroughTransactions = (ranges, transactions, docSize) => {
  let mapped = ranges;
  transactions.forEach((tr) => {
    mapped = mapped
      .map(({ from, to }) => {
        const mappedFrom = tr.mapping.map(from, -1);
        const mappedTo = tr.mapping.map(to, 1);
        if (mappedFrom >= mappedTo) return null;
        return { from: mappedFrom, to: mappedTo };
      })
      .filter(Boolean);
  });
  return mergeRanges(mapped, docSize);
};

const getParagraphAtPos = (doc, pos) => {
  try {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth >= 0; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === 'paragraph') {
        return node;
      }
    }
  } catch (_e) {
    /* ignore invalid positions */
  }
  return null;
};

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
 * Copies run properties from the previous paragraph's last run and applies its marks to a text node.
 * @param {import('prosemirror-state').EditorState} state
 * @param {number} pos
 * @param {import('prosemirror-model').Node} textNode
 * @param {import('prosemirror-model').NodeType} runType
 * @param {Object} editor
 * @returns {{ runProperties: Record<string, unknown> | undefined, textNode: import('prosemirror-model').Node }}
 */
const copyRunPropertiesFromPreviousParagraph = (state, pos, textNode, runType, editor) => {
  let runProperties;
  let updatedTextNode = textNode;
  const paragraphNode = getParagraphAtPos(state.doc, pos - 2);
  if (paragraphNode && paragraphNode.content.size > 0) {
    const lastChild = paragraphNode.child(paragraphNode.childCount - 1);
    if (lastChild.type === runType && lastChild.attrs.runProperties) {
      runProperties = carbonCopy(lastChild.attrs.runProperties);
    }
    // Copy marks and apply them to the text node being wrapped.
    if (runProperties) {
      const markDefs = encodeMarksFromRPr(runProperties, editor?.converter?.convertedXml ?? {});
      const markInstances = markDefs.map((def) => state.schema.marks[def.type]?.create(def.attrs)).filter(Boolean);
      if (markInstances.length) {
        const mergedMarks = markInstances.reduce((set, mark) => mark.addToSet(set), updatedTextNode.marks);
        updatedTextNode = updatedTextNode.mark(mergedMarks);
      }
    }
  }
  return { runProperties, textNode: updatedTextNode };
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

      if (index === 0) {
        // First node in parent. Copy run properties from the preceding paragraph's last run, if any.
        ({ runProperties, textNode } = copyRunPropertiesFromPreviousParagraph(state, pos, textNode, runType, editor));
      } else {
        runProperties = decodeRPrFromMarks(node.marks);
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

      pendingRanges = mapRangesThroughTransactions(pendingRanges, transactions, docSize);
      const changedRanges = collectChangedRanges(transactions, docSize);
      pendingRanges = mergeRanges([...pendingRanges, ...changedRanges], docSize);

      if (view?.composing) {
        return null;
      }

      const tr = buildWrapTransaction(newState, pendingRanges, runType, editor);
      pendingRanges = [];
      return tr;
    },
  });
};
