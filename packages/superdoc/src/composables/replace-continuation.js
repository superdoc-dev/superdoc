// @ts-check
/**
 * The find/replace panel's settled-replace continuation.
 *
 * A worker-backed replace resolves asynchronously, and the session it belongs to
 * can be gone by the time it does: the search handle is reassigned when the
 * active editor changes and nulled on teardown. Publishing the resolved snapshot
 * anyway would repopulate the panel with matches from a document the user is no
 * longer looking at.
 *
 * A leaf module rather than a closure inside `useFindReplace`, following
 * `find-shortcut-owner.js`. The guard previously lived in two byte-identical
 * inline closures, each of which needed a full composable driving a
 * worker-backed host caught mid-swap to reach one branch. Nothing could, so it
 * shipped with a comment admitting it was verified by inspection only. The
 * duplication was the tell: logic worth stating twice is worth naming once.
 */

/**
 * Build the continuation that publishes a settled replace back into the panel.
 *
 * The session handle itself is the identity. `onSettled` always runs, including
 * when the write is skipped: it clears the pending flag that gates the replace
 * controls, and leaving it set would disable them with nothing left to settle.
 *
 * @param {{ getSnapshot: () => unknown }} session The handle captured when the replace was issued.
 * @param {object} deps
 * @param {() => unknown} deps.getCurrentSession Reads the live session identity.
 * @param {(snapshot: unknown) => void} deps.applySlice Publishes a snapshot into the panel.
 * @param {() => void} deps.onSettled Runs whether or not the write was skipped.
 * @returns {() => void}
 */
export function createReplaceContinuation(session, { getCurrentSession, applySlice, onSettled }) {
  return () => {
    if (session === getCurrentSession()) {
      try {
        applySlice(session.getSnapshot());
      } catch {
        /* host gone */
      }
    }
    onSettled();
  };
}
