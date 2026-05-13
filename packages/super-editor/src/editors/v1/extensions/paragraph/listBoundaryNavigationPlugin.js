import { Plugin, TextSelection } from 'prosemirror-state';
import { getParagraphInlineDirection } from '@superdoc/contracts';

function isListParagraph(node) {
  return (
    node?.type?.name === 'paragraph' &&
    node.attrs?.paragraphProperties?.numberingProperties &&
    node.attrs?.listRendering
  );
}

function isRtlParagraph(node) {
  return getParagraphInlineDirection(node?.attrs) === 'rtl';
}

function getParagraphContext($pos) {
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name !== 'paragraph') continue;
    return {
      node,
      pos: depth === 0 ? 0 : $pos.before(depth),
      start: $pos.start(depth),
      end: $pos.end(depth),
    };
  }
  return null;
}

function getParagraphTextBounds(paragraph, paragraphStart) {
  let first = null;
  let last = null;

  paragraph.descendants((node, pos) => {
    if (!node.isText || !node.text?.length) return true;

    const from = paragraphStart + pos;
    const to = from + node.text.length;
    if (first == null || from < first) first = from;
    if (last == null || to > last) last = to;
    return true;
  });

  return first == null || last == null ? null : { first, last };
}

function findAdjacentTextPosition(doc, boundary, direction) {
  let target = null;
  if (direction < 0) {
    doc.nodesBetween(0, boundary, (node, pos) => {
      if (node.isText && node.text?.length) {
        target = pos + node.text.length;
      }
      return true;
    });
    return target;
  }

  doc.nodesBetween(boundary, doc.content.size, (node, pos) => {
    if (target != null) return false;
    if (node.isText && node.text?.length) {
      target = pos;
      return false;
    }
    return true;
  });
  return target;
}

function shouldHandlePlainHorizontalArrow(event) {
  return (
    (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  );
}

export function createListBoundaryNavigationPlugin() {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (!shouldHandlePlainHorizontalArrow(event)) return false;

        const { state } = view;
        const { selection } = state;
        if (!selection.empty) return false;

        const paragraph = getParagraphContext(selection.$from);
        if (!paragraph || !isListParagraph(paragraph.node)) return false;
        if (isRtlParagraph(paragraph.node)) return false;

        const bounds = getParagraphTextBounds(paragraph.node, paragraph.start);
        if (!bounds) return false;

        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const atLeftBoundary = direction < 0 && selection.from <= bounds.first;
        const atRightBoundary = direction > 0 && selection.from >= bounds.last;
        if (!atLeftBoundary && !atRightBoundary) return false;

        const target = findAdjacentTextPosition(state.doc, direction < 0 ? paragraph.pos : paragraph.end, direction);
        if (target == null || target === selection.from) return false;

        event.preventDefault();
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
        return true;
      },
    },
  });
}
