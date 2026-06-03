/**
 * Pure gate for the native-selection refinement in
 * {@link computeCaretLayoutRectGeometry}.
 *
 * The native-selection refinement (added in SD-2933) reads the browser's
 * collapsed selection rect and prefers it over the geometry-computed caret
 * when within a sanity bound. That refinement is only sound when the
 * requested `pos` IS the local user's actual caret.
 *
 * Two callers in PresentationEditor ask {@link computeCaretLayoutRect} about
 * positions that are NOT the local caret:
 *
 * - {@link RemoteCursorManager} queries each remote collaborator's head.
 * - Vertical-arrow navigation binary-searches candidate positions on the
 *   next line to pick the one closest to the previous horizontal X.
 *
 * Without this gate, the native-selection refinement would substitute the
 * LOCAL caret's rect for those queries when they happen to fall within the
 * sanity window. Remote cursors would render at the local caret's position;
 * vertical navigation would converge to the local caret.
 *
 * SD-3170 tracks this.
 *
 * @param selection - The current ProseMirror selection (or null/undefined
 *   when no editor is attached).
 * @param pos - The position the caller is asking about.
 * @returns true only when the selection is collapsed AND its caret head is
 *   exactly the requested position.
 */
export type CaretFallbackSelection = {
  empty: boolean;
  head: number;
};

export const shouldUseNativeCaretFallback = (
  selection: CaretFallbackSelection | null | undefined,
  pos: number,
): boolean => {
  if (!selection) return false;
  if (!selection.empty) return false;
  return selection.head === pos;
};
