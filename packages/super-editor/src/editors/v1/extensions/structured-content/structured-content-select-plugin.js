import { Plugin, TextSelection } from 'prosemirror-state';

/**
 * Select-all-on-click plugin for inline StructuredContent nodes.
 *
 * When a click places a collapsed cursor inside an inline SDT and the previous
 * selection was outside that SDT, the entire SDT content is selected. This
 * matches Word's content control behavior: first click selects all for easy
 * replacement, second click (cursor already inside) allows normal positioning.
 *
 * Uses appendTransaction so it works in both editing mode (PM DOM clicks) and
 * presentation mode (PresentationEditor dispatched selections).
 */
export function createStructuredContentSelectPlugin() {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      const { selection } = newState;

      // Only for collapsed selections (cursor placement, not range selections)
      if (!selection.empty) return null;

      // Only when selection actually changed
      if (oldState.selection.eq(newState.selection)) return null;

      // Only for selection-only transactions (no doc changes — filters out
      // typing, paste, etc. that also move the cursor)
      if (transactions.some((tr) => tr.docChanged)) return null;

      const $pos = selection.$from;

      // Walk up to find an enclosing inline structuredContent node
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d);
        if (node.type.name === 'structuredContent') {
          const sdtStart = $pos.before(d);
          const contentFrom = $pos.start(d);
          const contentTo = $pos.end(d);

          // Don't select empty content
          if (contentFrom === contentTo) return null;

          // If old selection was already inside this same SDT, allow normal
          // cursor placement (second click / arrow navigation within SDT)
          const old$pos = oldState.selection.$from;
          for (let od = old$pos.depth; od > 0; od--) {
            if (old$pos.node(od).type.name === 'structuredContent' && old$pos.before(od) === sdtStart) {
              return null;
            }
          }

          return newState.tr.setSelection(TextSelection.create(newState.doc, contentFrom, contentTo));
        }
      }

      return null;
    },
  });
}
