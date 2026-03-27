import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

const shouldAddLeadingCaret = (node) => {
  if (node.type.name !== 'paragraph') return false;
  if (node.childCount === 0) return false;
  const first = node.child(0);
  if (first.type.name === 'fieldAnnotation') return true;
  if (first.type.name !== 'run') return false;
  if (first.childCount === 0) return false;
  return first.child(0).type.name === 'fieldAnnotation';
};

export function createLeadingCaretPlugin() {
  const leadingCaretPlugin = new Plugin({
    props: {
      decorations(state) {
        if (typeof document === 'undefined') return null;
        const decorations = [];
        state.doc.descendants((node, pos) => {
          if (!shouldAddLeadingCaret(node)) return true;
          const widgetPos = pos + 1;
          const deco = Decoration.widget(widgetPos, () => document.createTextNode('\u200B'), {
            key: `sd-leading-caret-${pos}`,
            side: -1,
          });
          decorations.push(deco);
          return false;
        });
        return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
      },
    },
  });
  return leadingCaretPlugin;
}
