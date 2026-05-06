import { Selection } from 'prosemirror-state';

/**
 * Atom inline node types that should be treated as a single deletable unit
 * when Delete is pressed with the cursor immediately before them. Mirrors
 * `backspaceAtomBefore`'s allowlist — same opt-in policy, same rationale
 * (don't accidentally delete bookmarkEnd-style markers).
 */
const DELETABLE_INLINE_ATOMS = new Set(['noBreakHyphen']);

/**
 * Forward-Delete handler that targets the deletable inline atom directly
 * after the cursor.
 *
 * Only handles the case the rest of the Delete chain misses: caret inside
 * the atom's wrapper run with `nodeAfter` being the atom itself. At that
 * caret, `deleteNextToRun` bails (its early return excludes any nodeAfter
 * that isn't a `run`), `deleteSelection` is a no-op for empty selections,
 * `joinForward` only fires at textblock end, and `selectNodeForward` skips
 * non-selectable atoms — so the chain falls through and nothing happens.
 *
 * Paragraph-level boundary cases (caret between runs, or at the end of the
 * previous run with the atom-wrapper run as the next sibling) already work
 * via `deleteNextToRun`, which removes the atom and lets PM's replace fold
 * the now-empty wrapper into the surrounding paragraph. Don't intercept
 * those — leave the existing path alone.
 *
 * @returns {import('@core/commands/types').Command}
 */
export const deleteAtomAfter =
  () =>
  ({ state, tr, dispatch }) => {
    const sel = state.selection;
    if (!sel.empty) return false;

    const $pos = sel.$from;
    const after = $pos.nodeAfter;
    if (!after || !after.isInline || !after.isAtom) return false;
    if (!DELETABLE_INLINE_ATOMS.has(after.type.name)) return false;

    // Case 1 only: caret is inside the atom's wrapper run, immediately
    // before the atom, and the atom is that run's only child. Remove the
    // whole wrapper as a single unit so we don't leak an empty run.
    // Note: `childCount !== 1` is defensive — `calculateInlineRunPropertiesPlugin`
    // segments runs by inline properties on every change, so a run holding
    // text+atom+text is always split back into three single-content runs
    // before this command runs. The guard documents the invariant; it isn't
    // reachable through normal editing.
    const parent = $pos.parent;
    if (parent.type.name !== 'run' || parent.content.childCount !== 1) return false;

    const runStart = $pos.before($pos.depth);
    const from = runStart;
    const to = runStart + parent.nodeSize;

    if (dispatch) {
      tr.delete(from, to).setSelection(Selection.near(tr.doc.resolve(from)));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
