import { Plugin, PluginKey } from 'prosemirror-state';

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

        // Calculate the range that would be affected
        let affectedFrom = from;
        let affectedTo = to;

        // If selection is collapsed, backspace/delete affects adjacent position.
        // Note: this is a single-character approximation. joinBackward at paragraph
        // boundaries can span wider ranges, but filterTransaction catches the real
        // step range as a safety net (with a possible brief cursor jump).
        if (from === to) {
          if (isBackspace && from > 0) {
            affectedFrom = from - 1;
          } else if (isDelete && to < state.doc.content.size) {
            affectedTo = to + 1;
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
