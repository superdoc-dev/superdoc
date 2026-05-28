import { NodeSelection, Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';
import { BLOCK_NODE_METADATA_UPDATE_META } from '../block-node/block-node.js';

export const STRUCTURED_CONTENT_LOCK_KEY = new PluginKey('structuredContentLock');

/**
 * Lock enforcement plugin for StructuredContent nodes.
 *
 * Lock modes (ECMA-376 w:lock):
 * - unlocked: No restrictions
 * - sdtLocked: Cannot delete the SDT wrapper (content editable)
 * - contentLocked: Cannot edit content (can delete wrapper)
 * - sdtContentLocked: Cannot delete wrapper OR edit content
 *
 * Strategy:
 * 1. handleKeyDown - Intercept keys BEFORE transaction to prevent browser selection issues
 * 2. filterTransaction - Safety net to catch programmatic changes
 */

/**
 * Collect all SDT nodes from the document.
 */
function collectSDTNodes(doc) {
  const sdtNodes = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') {
      sdtNodes.push({
        type: node.type.name,
        lockMode: node.attrs.lockMode,
        pos,
        end: pos + node.nodeSize,
      });
    }
  });
  return sdtNodes;
}

/**
 * Check if a range [from, to] would violate any lock rules
 * Returns { blocked: boolean, reason?: string }
 */
function checkLockViolation(sdtNodes, from, to) {
  for (const sdt of sdtNodes) {
    const overlaps = from < sdt.end && to > sdt.pos;
    if (!overlaps) continue;

    // Calculate relationship
    const containsSDT = from <= sdt.pos && to >= sdt.end;
    const insideSDT = from >= sdt.pos && to <= sdt.end;
    const crossesStart = from < sdt.pos && to > sdt.pos && to < sdt.end;
    const crossesEnd = from > sdt.pos && from < sdt.end && to > sdt.end;

    const wouldDamageWrapper = containsSDT || crossesStart || crossesEnd;
    // Content modification: inside SDT but NOT deleting the entire wrapper
    const wouldModifyContent = insideSDT && !containsSDT;

    const isSdtLocked = sdt.lockMode === 'sdtLocked' || sdt.lockMode === 'sdtContentLocked';
    const isContentLocked = sdt.lockMode === 'contentLocked' || sdt.lockMode === 'sdtContentLocked';

    if (isSdtLocked && wouldDamageWrapper) {
      return { blocked: true, reason: `Cannot delete SDT wrapper (${sdt.lockMode})` };
    }

    if (isContentLocked && wouldModifyContent) {
      return { blocked: true, reason: `Cannot modify content (${sdt.lockMode})` };
    }
  }
  return { blocked: false };
}

export function createStructuredContentLockPlugin() {
  return new Plugin({
    key: STRUCTURED_CONTENT_LOCK_KEY,

    state: {
      init(_, editorState) {
        return collectSDTNodes(editorState.doc);
      },
      apply(tr, cachedSDTNodes, _oldState, newState) {
        if (!tr.docChanged) return cachedSDTNodes;
        return collectSDTNodes(newState.doc);
      },
    },

    props: {
      /**
       * Intercept key events BEFORE any transaction is created.
       * This prevents the browser selection from getting out of sync.
       */
      handleKeyDown(view, event) {
        const { state } = view;
        const { selection } = state;
        const { from, to } = selection;

        // Only intercept destructive keys
        const isDelete = event.key === 'Delete';
        const isBackspace = event.key === 'Backspace';
        const isCut = (event.metaKey || event.ctrlKey) && event.key === 'x';

        if (!isDelete && !isBackspace && !isCut) {
          return false; // Let other handlers process
        }

        const sdtNodes = STRUCTURED_CONTENT_LOCK_KEY.getState(state);
        if (sdtNodes.length === 0) {
          return false;
        }

        // Path 1 — non-collapsed selection that exactly covers the editable
        // content of an SDT (e.g., a label/handle selection, a triple-click
        // that lands on the content range, or precise keyboard selection).
        // For wrapper-deletable but content-locked modes, promote to a
        // NodeSelection on the wrapper so the next operation targets the whole
        // field instead of trying to edit locked content. For content-editable
        // modes, let the normal command chain delete the selected content while
        // preserving the SDT wrapper.
        if (from !== to && !(selection instanceof NodeSelection)) {
          const exactContentSDT = sdtNodes.find((s) => from === s.pos + 1 && to === s.end - 1);
          if (exactContentSDT) {
            const isContentLocked =
              exactContentSDT.lockMode === 'contentLocked' || exactContentSDT.lockMode === 'sdtContentLocked';
            const isWrapperDeletable =
              exactContentSDT.lockMode !== 'sdtLocked' && exactContentSDT.lockMode !== 'sdtContentLocked';
            const isFullyLocked = exactContentSDT.lockMode === 'sdtContentLocked';
            if (isFullyLocked && exactContentSDT.type === 'structuredContent' && (isBackspace || isDelete)) {
              const collapsePos = isBackspace ? exactContentSDT.pos : exactContentSDT.end;
              view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, collapsePos)));
              event.preventDefault();
              return true;
            }
            if (isContentLocked && isWrapperDeletable) {
              if (isCut) {
                const tr = state.tr.setSelection(NodeSelection.create(state.doc, exactContentSDT.pos));
                view.dispatch(tr);
                return false;
              }
              const tr = state.tr.delete(exactContentSDT.pos, exactContentSDT.end);
              view.dispatch(tr);
              event.preventDefault();
              return true;
            }
          }
        }

        // Calculate the range that would be affected
        let affectedFrom = from;
        let affectedTo = to;

        // If selection is collapsed, Backspace/Delete affects adjacent content.
        // Inline SDT wrapper boundaries are handed to keymap commands so both
        // directions can select the SDT content before a destructive action.
        // Other positions use a single-character approximation here;
        // filterTransaction catches wider step ranges as a safety net.
        if (from === to) {
          const emptyInlineSDT = sdtNodes.find(
            (s) => s.type === 'structuredContent' && s.pos + 1 === from && s.end - 1 === from,
          );
          if ((isBackspace || isDelete) && emptyInlineSDT) {
            const isWrapperDeletable =
              emptyInlineSDT.lockMode !== 'sdtLocked' && emptyInlineSDT.lockMode !== 'sdtContentLocked';
            event.preventDefault();
            if (isWrapperDeletable) {
              view.dispatch(state.tr.delete(emptyInlineSDT.pos, emptyInlineSDT.end));
            }
            return true;
          }

          const inlineSdtAncestor = sdtNodes.find(
            (s) => s.type === 'structuredContent' && from > s.pos && from < s.end,
          );
          const inlineSdtContentEditable =
            inlineSdtAncestor &&
            inlineSdtAncestor.lockMode !== 'contentLocked' &&
            inlineSdtAncestor.lockMode !== 'sdtContentLocked';
          if ((isBackspace || isDelete) && inlineSdtContentEditable && selection.$from.parent.type.name === 'run') {
            const deleteFrom = isBackspace ? from - 1 : from;
            const deleteTo = isBackspace ? from : from + 1;
            const staysInsideInlineSdt = deleteFrom > inlineSdtAncestor.pos && deleteTo < inlineSdtAncestor.end;
            const staysInsideRun = isBackspace ? from > selection.$from.start() : from < selection.$from.end();

            if (staysInsideInlineSdt && staysInsideRun) {
              view.dispatch(state.tr.delete(deleteFrom, deleteTo).scrollIntoView());
              event.preventDefault();
              return true;
            }
          }

          if (isBackspace && from > 0) {
            affectedFrom = from - 1;
            // Path 2 — caret is exactly at the trailing wrapper boundary of an
            // SDT. The Backspace keymap has a specialized command that selects
            // the inline SDT content, so let that run instead of treating this
            // as an attempted wrapper deletion.
            const adjacentSDT = sdtNodes.find((s) => s.end === from);
            if (adjacentSDT) {
              return false;
            }
          } else if (isDelete && to < state.doc.content.size) {
            affectedTo = to + 1;
            // Symmetric: caret immediately before an inline SDT. Let the
            // Delete keymap select its content, mirroring trailing Backspace.
            const adjacentSDT = sdtNodes.find((s) => s.pos === to);
            if (adjacentSDT?.type === 'structuredContent') {
              return false;
            }
            if (adjacentSDT) {
              affectedFrom = adjacentSDT.pos;
              affectedTo = adjacentSDT.end;
            }
          }
        }

        const result = checkLockViolation(sdtNodes, affectedFrom, affectedTo);

        if (result.blocked) {
          event.preventDefault();
          return true; // Stop event propagation
        }

        return false;
      },

      /**
       * Handle text input (typing) for content-locked nodes
       */
      handleTextInput(view, from, to, _text) {
        const sdtNodes = STRUCTURED_CONTENT_LOCK_KEY.getState(view.state);
        if (sdtNodes.length === 0) {
          return false;
        }

        const result = checkLockViolation(sdtNodes, from, to);

        if (result.blocked) {
          return true; // Prevent the input
        }

        return false;
      },
    },

    /**
     * Safety net: filter transactions that slip through
     * (e.g., programmatic changes, paste, drag-drop)
     */
    filterTransaction(tr, state) {
      if (!tr.docChanged) {
        return true;
      }

      // Any y-prosemirror transaction (remote sync, snapshot enter/exit) must
      // always be applied locally to keep every client converged, even if the
      // incoming step spans locked SDTs.
      if (tr.getMeta?.(ySyncPluginKey)) {
        return true;
      }

      const inputType = tr.getMeta?.('inputType');
      if (inputType === 'historyUndo' || inputType === 'historyRedo') {
        return true;
      }

      if (tr.getMeta?.(BLOCK_NODE_METADATA_UPDATE_META)) {
        return true;
      }

      const sdtNodes = STRUCTURED_CONTENT_LOCK_KEY.getState(state);
      if (sdtNodes.length === 0) {
        return true;
      }

      for (const step of tr.steps) {
        // Skip steps without from/to (AttrStep, AddNodeMarkStep, RemoveNodeMarkStep) —
        // these change metadata, not content, so they can't violate lock rules.
        if (step.from === undefined || step.to === undefined) {
          continue;
        }

        const result = checkLockViolation(sdtNodes, step.from, step.to);

        if (result.blocked) {
          return false;
        }
      }

      return true;
    },
  });
}
