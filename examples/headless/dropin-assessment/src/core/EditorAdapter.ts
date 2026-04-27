import type {
  Comment,
  SelectionInfo,
  ToolbarCommandId,
  ToolbarState,
  TrackedChange,
} from './types';

/**
 * The contract every editor adapter must satisfy so the same React UI
 * (toolbar + comments sidebar) can drive TipTap or SuperDoc interchangeably.
 *
 * Capabilities on this interface are the "drop-in checklist":
 *   - If an editor exposes all of these cleanly, drop-in is viable.
 *   - If we have to contort its internals, that's a DX gap.
 *
 * We keep the surface deliberately small — only what the video UX demands.
 *
 * No PM-shaped types are exposed: the adapter resolves whatever its
 * underlying engine needs (TextTarget for SuperDoc, PM range for TipTap)
 * from the current selection at call-time. Consumers copying this
 * contract should not inherit ProseMirror positions on the public surface.
 */
export interface EditorAdapter {
  mount(element: HTMLElement): void | Promise<void>;
  destroy(): void;

  executeCommand(id: ToolbarCommandId, payload?: unknown): boolean;
  getToolbarState(): ToolbarState;
  onToolbarStateChange(cb: (state: ToolbarState) => void): () => void;

  getSelection(): SelectionInfo;
  onSelectionChange(cb: (selection: SelectionInfo) => void): () => void;

  listComments(): Comment[];
  /**
   * Create a new comment anchored to the adapter's current selection.
   * Returns the created comment, or `null` if the engine rejected the
   * insert (no selection, validation error, thrown resolver). Callers
   * should treat `null` as "failed, do not update UI state as if it
   * succeeded" — the assessment harness surfaces failures rather than
   * inventing placeholder comments.
   */
  addComment(input: { body: string; authorId: string }): Comment | null;
  updateComment(id: string, patch: { body?: string; resolved?: boolean }): void;
  deleteComment(id: string): void;
  onCommentsChange(cb: (comments: Comment[]) => void): () => void;

  /**
   * Scroll the viewport so the given comment's anchored range is visible.
   * Each adapter routes this through its engine's native scroll-to-range
   * primitive — for SuperDoc that's `editor.doc.ranges.scrollIntoView` which
   * handles paginated, virtualized layouts.
   */
  scrollToComment(commentId: string): Promise<void> | void;

  /**
   * Scroll the viewport so the given tracked change's range is visible.
   * Mirrors scrollToComment for tracked changes.
   */
  scrollToChange(changeId: string): Promise<void> | void;

  // ---- track changes ----

  /** Is the editor currently recording changes (suggesting mode)? */
  isTrackingChanges(): boolean;
  setTrackingChanges(enabled: boolean): void;

  listTrackedChanges(): TrackedChange[];
  acceptChange(id: string): void;
  rejectChange(id: string): void;
  onTrackedChangesChange(cb: (changes: TrackedChange[]) => void): () => void;

  // ---- export ----

  /**
   * Export the current document as DOCX and trigger a browser download.
   * Throws (or rejects) when the underlying engine cannot produce a
   * DOCX directly — that's the gap the assessment exposes for editors
   * that lack first-class DOCX export.
   */
  exportDocx(): Promise<void>;
}
