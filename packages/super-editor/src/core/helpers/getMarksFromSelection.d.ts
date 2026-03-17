import type { EditorState } from 'prosemirror-state';
import type { Mark } from 'prosemirror-model';

export function getMarksFromSelection(state: EditorState): Mark[];
export function getSelectionFormattingState(
  state: EditorState,
  editor?: any,
): {
  resolvedMarks: Mark[];
  inlineMarks: Mark[];
  resolvedRunProperties: Record<string, unknown> | null;
  inlineRunProperties: Record<string, unknown> | null;
  styleRunProperties: Record<string, unknown> | null;
};
export function getFormattingStateAtPos(
  state: EditorState,
  pos: number,
  editor?: any,
  options?: {
    storedMarks?: Mark[] | null;
    includeCursorMarksWithStoredMarks?: boolean;
    preferParagraphRunProperties?: boolean;
  },
): {
  resolvedMarks: Mark[];
  inlineMarks: Mark[];
  resolvedRunProperties: Record<string, unknown> | null;
  inlineRunProperties: Record<string, unknown> | null;
  styleRunProperties: Record<string, unknown> | null;
};
export function getFormattingStateForRange(
  state: EditorState,
  from: number,
  to: number,
  editor?: any,
): {
  resolvedMarks: Mark[];
  inlineMarks: Mark[];
  resolvedRunProperties: Record<string, unknown> | null;
  inlineRunProperties: Record<string, unknown> | null;
  styleRunProperties: Record<string, unknown> | null;
};
export function getInheritedRunProperties(
  $pos: any,
  editor?: any,
  inlineRunProperties?: Record<string, unknown> | null,
): {
  resolvedRunProperties: Record<string, unknown> | null;
  inlineRunProperties: Record<string, unknown> | null;
  styleRunProperties: Record<string, unknown> | null;
};
