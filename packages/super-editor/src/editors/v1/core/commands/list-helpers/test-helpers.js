import { EditorState, TextSelection } from 'prosemirror-state';

export function createEditor(docNode, schema) {
  const editor = {
    schema,
    converter: { numbering: { definitions: {}, abstracts: {} } },
    emit: () => {},
  };
  const [from, to] = inlineSpanOf(docNode);
  const state = EditorState.create({
    schema,
    doc: docNode,
    selection: TextSelection.create(docNode, from, to),
  });
  return { editor, state };
}

export function inlineSpanOf(root) {
  const from = firstInlinePos(root);
  const to = lastInlinePos(root);
  return [from, Math.max(from, to)];
}

export function firstInlinePos(root) {
  let pos = null;
  root.descendants((node, p) => {
    if (node.isTextblock && node.content.size > 0 && pos == null) {
      pos = p + 1; // first position inside inline content
      return false;
    }
    return true;
  });
  return pos ?? 1;
}

export function lastInlinePos(root) {
  let pos = null;
  root.descendants((node, p) => {
    if (node.isTextblock && node.content.size > 0) {
      pos = p + node.content.size; // last position inside inline content
    }
    return true;
  });
  return pos ?? Math.max(1, root.nodeSize - 2);
}

export function selectionInsideFirstAndLastTextblocks(root) {
  // Convenience for “inside first item to inside last item”
  return inlineSpanOf(root);
}

export function applyCmd(state, editor, cmd) {
  let newState = state;
  cmd({
    editor,
    state,
    tr: state.tr,
    dispatch: (tr) => {
      newState = state.apply(tr);
    },
  });
  return newState;
}

export function getSelectionRange(st) {
  return [st.selection.from, st.selection.to];
}

export function hasNestedListInsideParagraph(root) {
  let nested = false;
  root.descendants((node) => {
    if (node.type.name === 'paragraph') {
      node.descendants((child) => {
        if (child.type.name === 'bulletList' || child.type.name === 'orderedList') nested = true;
      });
    }
  });
  return nested;
}

export const listItemSpec = {
  content: 'paragraph block*',
  attrs: {
    level: { default: 0 },
    listLevel: { default: [1] },
    numId: { default: null },
    lvlText: { default: null },
    numPrType: { default: null },
    listNumberingType: { default: null },
  },
  renderDOM() {
    return ['li', 0];
  },
  parseDOM: () => [{ tag: 'li' }],
};

export const orderedListSpec = {
  group: 'block',
  content: 'listItem+',
  attrs: {
    listId: { default: null },
    'list-style-type': { default: 'decimal' },
    order: { default: 0 },
  },
  renderDOM() {
    return ['ol', 0];
  },
  parseDOM: () => [{ tag: 'ol' }],
};

export const bulletListSpec = {
  group: 'block',
  content: 'listItem+',
  attrs: {
    listId: { default: null },
    'list-style-type': { default: 'bullet' },
  },
  renderDOM() {
    return ['ul', 0];
  },
  parseDOM: () => [{ tag: 'ul' }],
};

export const tableSpec = {
  group: 'block',
  content: 'tableRow+',
  isolating: true,
  toDOM() {
    return ['table', ['tbody', 0]];
  },
  parseDOM: [{ tag: 'table' }],
};

export const tableRowSpec = {
  content: 'tableCell+',
  toDOM() {
    return ['tr', 0];
  },
  parseDOM: [{ tag: 'tr' }],
};

export const tableCellSpec = {
  content: 'block+',
  toDOM() {
    return ['td', 0];
  },
  parseDOM: [{ tag: 'td' }],
};
