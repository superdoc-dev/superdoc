/**
 * Shared types used by the custom UI components regardless of which
 * editor is driving the document. Keep these editor-agnostic.
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

export interface DocRange {
  from: number;
  to: number;
}

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
  range: DocRange;
  quotedText: string;
}

export interface SelectionInfo {
  range: DocRange | null;
  empty: boolean;
  quotedText: string;
}

export type TrackedChangeKind = 'insertion' | 'deletion' | 'format';

export interface TrackedChange {
  id: string;
  kind: TrackedChangeKind;
  author: CommentAuthor;
  createdAt: string;
  range: DocRange;
  text: string;      // what's being inserted/deleted
  summary: string;   // human-readable description of the change
}
