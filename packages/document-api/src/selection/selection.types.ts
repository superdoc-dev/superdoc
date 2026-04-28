import type { TextTarget } from '../types/address.js';

/**
 * Input for `selection.current` — reads the editor's current selection.
 *
 * Purely a read operation; does not modify the document. `selection.current`
 * always reflects the live editor selection in whichever story currently
 * holds focus (body, header, footer). Story scoping is not a query
 * parameter here; if a consumer needs a read of a specific story, focus
 * must be set there first.
 */
export interface SelectionCurrentInput {
  /**
   * When `true`, the `text` field of `SelectionInfo` is populated with the
   * quoted text of the selection (useful for comment composers and search).
   * Omit or set `false` to skip text extraction for performance.
   */
  includeText?: boolean;
}

/**
 * Canonical shape of the editor's current selection, projected into the
 * Document API's text-address model. This is the primitive consumers use
 * to build custom comments UIs, floating toolbars, mention popovers, etc.
 *
 * Unlike PM's `Selection` (positional and private), `SelectionInfo` is
 * portable across rendering backends and stable across layout changes.
 */
export interface SelectionInfo {
  /** True when the selection is empty (cursor only, no range). */
  empty: boolean;
  /**
   * The selection anchored to text content, or `null` when the selection
   * is not in text (empty document, node selection, no focus, etc.).
   *
   * `TextTarget.segments` may contain multiple entries when the selection
   * spans multiple blocks. Pass the whole target to `comments.create` —
   * it resolves multi-segment targets to a single PM range spanning the
   * full selection.
   */
  target: TextTarget | null;
  /**
   * Active marks at the caret or across the selection. Names are
   * ProseMirror mark type names (e.g. `'bold'`, `'italic'`, `'link'`).
   * Use these to drive toolbar active-state rendering.
   *
   * `activeMarks` uses **intersection** semantics — a name is present
   * only when every character in the selection carries that mark. This
   * matches Word/Google Docs toolbar behavior.
   */
  activeMarks: string[];
  /**
   * Comment IDs whose `commentMark` overlaps any part of the current
   * selection (or covers the caret when empty). Use to drive a
   * floating "comment here" hint, highlight the active sidebar card,
   * or disable a "new comment" button when the selection already
   * covers an existing comment.
   *
   * **Union** semantics: an id is present when *any* character in the
   * selection carries that comment, not when every character does.
   * Multiple overlapping comments produce multiple ids.
   */
  activeCommentIds: string[];
  /**
   * Tracked-change IDs whose `trackInsert` / `trackDelete` /
   * `trackFormat` mark overlaps any part of the current selection.
   * Same union semantics as {@link activeCommentIds}.
   *
   * Use to drive review-sidebar highlighting and next/previous
   * navigation without resolving every change individually via
   * `trackChanges.list()`.
   */
  activeChangeIds: string[];
  /**
   * Quoted text of the selection. Populated only when `includeText: true`.
   * Undefined otherwise.
   */
  text?: string;
}
