/**
 * Shared types used by the custom UI components regardless of which
 * editor is driving the document. Keep these editor-agnostic — no PM
 * positions, no engine-specific shapes. Selection/anchor semantics are
 * the adapter's job.
 */

export type ToolbarCommandId =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'h1'
  | 'h2'
  | 'bullet-list'
  | 'ordered-list'
  | 'link'
  | 'highlight';

export interface ToolbarCommandState {
  active: boolean;
  disabled: boolean;
}

export type ToolbarState = Record<ToolbarCommandId, ToolbarCommandState>;

export interface CommentAuthor {
  id: string;
  name: string;
  color: string;
}

export interface Comment {
  id: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
  resolved: boolean;
  quotedText: string;
}

/**
 * What the sidebar needs to know about the current selection. The
 * adapter resolves the underlying engine shape (TextTarget for SuperDoc,
 * PM range for TipTap) internally — the UI only needs a boolean gate
 * and the quoted text for the composer preview.
 */
export interface SelectionInfo {
  hasSelection: boolean;
  empty: boolean;
  quotedText: string;
}

export type TrackedChangeKind = 'insertion' | 'deletion' | 'format';

export interface TrackedChange {
  id: string;
  kind: TrackedChangeKind;
  author: CommentAuthor;
  createdAt: string;
  text: string;
  summary: string;
}
