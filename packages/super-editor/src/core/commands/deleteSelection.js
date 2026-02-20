import { deleteSelection as originalDeleteSelection } from 'prosemirror-commands';

/**
 * Delete the selection, if there is one.
 *
 * This command handles deletion of selected content in the editor with special handling
 * for list content and a workaround for SD-1013.
 *
 * @returns {Function} A ProseMirror command function that accepts ({state, tr, dispatch})
 *
 * Behavior:
 * 1. SD-1013 Workaround: When a user selects text from right to left and replaces it with
 *    a single character, ProseMirror can incorrectly interpret this as a backspace operation.
 *    This command checks the DOM selection and returns false if the baseNode contains only
 *    a single character, preventing the incorrect deletion.
 *
 * 2. List Content Handling: When the selection contains list content (orderedList, bulletList,
 *    or listItem nodes), this command performs a hard delete using transaction.deleteRange()
 *    instead of delegating to ProseMirror's default deleteSelection behavior. This ensures
 *    proper handling of list structure deletion.
 *
 * 3. Default Behavior: For all other cases (empty selections or non-list content),
 *    the command delegates to ProseMirror's original deleteSelection command.
 *
 * @param {Object} params - The command parameters
 * @param {EditorState} params.state - The current editor state
 * @param {Transaction} params.tr - The transaction to apply changes to
 * @param {Function} [params.dispatch] - Optional dispatch function to apply the transaction
 *
 * @returns {boolean} Returns true if the command was handled, false if it should not be executed
 *   - Returns false when SD-1013 workaround is triggered (single-char DOM selection)
 *   - Returns true when list content is deleted
 *   - Returns the result of originalDeleteSelection for all other cases
 */
export const deleteSelection =
  () =>
  ({ state, tr, dispatch }) => {
    const { from, to, empty } = state.selection;

    // Fix for SD-1013
    // Docs that are loaded into SuperDoc, when user selects text from right to left and replace it with a single char:
    // Prosemirror will interpret this as a backspace operation, which will delete the character.
    // This is a workaround to prevent this from happening, by checking if the current DOM selection is a single character.
    if (typeof document !== 'undefined' && document.getSelection) {
      const currentDomSelection = document.getSelection();
      // If the current DOM selection is a single character, we don't want to delete it.
      if (currentDomSelection?.baseNode?.data?.length === 1) {
        return false;
      }
    }

    if (empty) {
      return originalDeleteSelection(state, dispatch);
    }

    let hasListContent = false;
    state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'orderedList' || node.type.name === 'bulletList' || node.type.name === 'listItem') {
        hasListContent = true;
        return false;
      }
    });

    if (hasListContent) {
      const transaction = tr || state.tr;
      transaction.deleteRange(from, to);

      if (dispatch) {
        dispatch(transaction);
      }

      return true;
    }

    return originalDeleteSelection(state, dispatch);
  };
