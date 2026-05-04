import { Plugin, TextSelection } from 'prosemirror-state';

import { applyEditableSlotAtInlineBoundary } from '@helpers/ensure-editable-slot-inline-boundary.js';

const INLINE_LEAF_TEXT = '\ufffc';

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
export function createStructuredContentSelectPlugin(editor) {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (editor?.options?.documentMode === 'viewing') return false;
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false;
        // Keep native modified-arrow behavior (range extend, word/line jump).
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;

        const { state } = view;
        const { selection } = state;
        const isEditableSlotText = (text) => text.replace(/\u200B/g, '').length === 0;

        const resolveBoundaryExit = ($pos) => {
          for (let depth = $pos.depth; depth > 0; depth -= 1) {
            const node = $pos.node(depth);
            if (node.type.name !== 'structuredContent') continue;

            const contentFrom = $pos.start(depth);
            const contentTo = $pos.end(depth);
            const nodePos = $pos.before(depth);
            const beforePos = nodePos;
            const afterPos = nodePos + node.nodeSize;

            // Empty selection: exit only at exact boundaries.
            if (selection.empty) {
              const trailingSlice = state.doc.textBetween(selection.from, contentTo, '', INLINE_LEAF_TEXT);
              const leadingSlice = state.doc.textBetween(contentFrom, selection.from, '', INLINE_LEAF_TEXT);
              const onlyTrailingEditableSlots = trailingSlice.length > 0 && isEditableSlotText(trailingSlice);
              const onlyLeadingEditableSlots = leadingSlice.length > 0 && isEditableSlotText(leadingSlice);
              // Be tolerant by 1 position to avoid requiring a second key press
              // when PM lands just inside boundary positions.
              if (event.key === 'ArrowRight' && (selection.from >= contentTo - 1 || onlyTrailingEditableSlots)) {
                return afterPos;
              }
              if (event.key === 'ArrowLeft' && (selection.from <= contentFrom + 1 || onlyLeadingEditableSlots)) {
                return beforePos;
              }
              return null;
            }

            // Full SDT-content selection (first-click behavior): allow immediate exit.
            const selectsWholeContent = selection.from === contentFrom && selection.to === contentTo;
            if (!selectsWholeContent) return null;
            if (event.key === 'ArrowRight') return afterPos;
            if (event.key === 'ArrowLeft') return beforePos;
            return null;
          }
          return null;
        };

        const nextPos = resolveBoundaryExit(selection.$from);
        if (nextPos == null) return false;

        try {
          const direction = event.key === 'ArrowLeft' ? 'before' : 'after';
          const tr = applyEditableSlotAtInlineBoundary(state.tr, nextPos, direction);
          view.dispatch(tr);
          event.preventDefault();
          return true;
        } catch {
          return false;
        }
      },
    },
    appendTransaction(transactions, oldState, newState) {
      if (editor?.options?.documentMode === 'viewing') return null;

      const { selection } = newState;

      // Only when selection actually changed
      if (oldState.selection.eq(newState.selection)) return null;

      // Only for selection-only transactions (no doc changes — filters out
      // typing, paste, etc. that also move the cursor)
      if (transactions.some((tr) => tr.docChanged)) return null;

      if (!selection.empty) {
        let selectedSdt = null;
        newState.doc.descendants((node, pos) => {
          if (node.type.name !== 'structuredContent') return true;

          const contentFrom = pos + 1;
          const contentTo = pos + node.nodeSize - 1;
          const wrapsSelection = selection.from <= contentFrom && selection.to >= contentTo;
          if (!wrapsSelection) return true;

          selectedSdt = {
            node,
            pos,
            contentFrom,
            contentTo,
          };
          return false;
        });

        if (selectedSdt) {
          const oldAtTrailingBoundary =
            oldState.selection.empty && oldState.selection.from >= selectedSdt.pos + selectedSdt.node.nodeSize;
          const oldAtLeadingBoundary = oldState.selection.empty && oldState.selection.from <= selectedSdt.pos;

          if (oldAtTrailingBoundary) {
            return applyEditableSlotAtInlineBoundary(newState.tr, selectedSdt.pos + selectedSdt.node.nodeSize, 'after');
          }
          if (oldAtLeadingBoundary) {
            return applyEditableSlotAtInlineBoundary(newState.tr, selectedSdt.pos, 'before');
          }
        }
        return null;
      }

      // Only for collapsed selections (cursor placement, not range selections)
      if (!selection.empty) return null;

      // Walk up to find an enclosing inline structuredContent node
      const $pos = selection.$from;
      const old$pos = oldState.selection.$from;
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d);
        if (node.type.name !== 'structuredContent') continue;
        const sdtStart = $pos.before(d);
        const contentFrom = $pos.start(d);
        const contentTo = $pos.end(d);

        // Boundary positions represent "before/after SDT content" intent and should
        // not trigger first-click select-all behavior.
        if (selection.from <= contentFrom || selection.from >= contentTo) {
          return null;
        }

        // Don't select empty content
        if (contentFrom === contentTo) return null;

        // If old selection was already inside this same SDT, allow normal
        // cursor placement (second click / arrow navigation within SDT)
        for (let od = old$pos.depth; od > 0; od--) {
          if (old$pos.node(od).type.name === 'structuredContent' && old$pos.before(od) === sdtStart) {
            return null;
          }
        }

        return newState.tr.setSelection(TextSelection.create(newState.doc, contentFrom, contentTo));
      }

      return null;
    },
  });
}
