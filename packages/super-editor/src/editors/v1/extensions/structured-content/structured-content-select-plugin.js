import { Plugin, TextSelection } from 'prosemirror-state';

import { applyEditableSlotAtInlineBoundary } from '@helpers/ensure-editable-slot-inline-boundary.js';
import { SELECT_INLINE_SDT_BEFORE_RUN_START_META } from '@core/commands/selectInlineSdtBeforeRunStart.js';

const INLINE_LEAF_TEXT = '\ufffc';

/**
 * Boundary navigation plugin for inline StructuredContent nodes.
 *
 * Keeps arrow-key exits and editable boundary slots predictable without
 * converting normal content clicks into whole-inline-content selections.
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

        const resolveAdjacentEmptyInlineSdtEntry = () => {
          if (event.key !== 'ArrowLeft') return null;
          if (!selection.empty) return null;

          let targetPos = null;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'structuredContent') return true;
            if (node.content.size !== 0) return true;

            if (event.key === 'ArrowLeft' && selection.from === pos + node.nodeSize) {
              targetPos = pos + 1;
              return false;
            }

            return true;
          });

          return targetPos;
        };

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

        const adjacentEmptySdtEntry = resolveAdjacentEmptyInlineSdtEntry();
        if (adjacentEmptySdtEntry != null) {
          try {
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, adjacentEmptySdtEntry)));
            event.preventDefault();
            return true;
          } catch {
            return false;
          }
        }

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
        if (transactions.some((tr) => tr.getMeta(SELECT_INLINE_SDT_BEFORE_RUN_START_META))) return null;

        let selectedSdt = null;
        newState.doc.descendants((node, pos) => {
          if (node.type.name !== 'structuredContent') return true;

          const contentFrom = pos + 1;
          const contentTo = pos + node.nodeSize - 1;
          const selectsWholeContent = selection.from === contentFrom && selection.to === contentTo;
          if (!selectsWholeContent) return true;

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

      return null;
    },
  });
}
