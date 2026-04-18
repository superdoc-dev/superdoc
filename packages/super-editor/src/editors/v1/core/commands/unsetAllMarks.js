/**
 * Remove all marks in the current selection.
 *
 * We collect marks only from leaf/atom nodes (text nodes) and remove each
 * explicitly via `tr.removeMark(from, to, mark)`.  This avoids a ProseMirror
 * asymmetry: `RemoveMarkStep` strips marks from ALL inline nodes (including
 * non-atom containers like `run`), but its inverse `AddMarkStep` only adds
 * marks to atom nodes.  When a container carries a mark with different attrs
 * (e.g. textStyle with all-null attrs on a run node), undo would overwrite
 * the correct mark on the text node.  By scoping removal to leaf-node marks
 * only, the undo path restores the exact marks that were visible to the user.
 */
//prettier-ignore
export const unsetAllMarks = () => ({ tr, dispatch, editor }) => {
  let { selection } = tr;
  if (editor.options.isHeaderOrFooter) {
    selection = editor.options.lastSelection;
  }
  const { empty, ranges } = selection;

  if (dispatch) {
    if (!empty) {
      ranges.forEach((range) => {
        const from = range.$from.pos;
        const to = range.$to.pos;

        // Collect unique marks from leaf/atom nodes only (not inline containers)
        const seen = new Set();
        const marksToRemove = [];
        tr.doc.nodesBetween(from, to, (node) => {
          if (!node.isInline || !node.isLeaf) return;
          for (const mark of node.marks) {
            const key = mark.type.name + '\0' + JSON.stringify(mark.attrs);
            if (!seen.has(key)) {
              seen.add(key);
              marksToRemove.push(mark);
            }
          }
        });

        for (const mark of marksToRemove) {
          tr.removeMark(from, to, mark);
        }
      });
    }
    // Clear stored marks to prevent formatting from being inherited by newly typed content
    tr.setStoredMarks([]);
  }

  return true;
};
