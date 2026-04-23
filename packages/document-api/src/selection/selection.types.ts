import type { TextTarget } from '../types/address.js';
import type { StoryLocator } from '../types/story.types.js';

/**
 * Input for `selection.current` — reads the editor's current selection.
 *
 * Purely a read operation; does not modify the document.
 */
export interface SelectionCurrentInput {
  /**
   * When `true`, the `text` field of `SelectionInfo` is populated with the
   * quoted text of the selection (useful for comment composers and search).
   * Omit or set `false` to skip text extraction for performance.
   */
  includeText?: boolean;
  /**
   * Story locator — omit for body, provide for header/footer selections.
   */
  in?: StoryLocator;
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
   */
  activeMarks: string[];
  /**
   * Quoted text of the selection. Populated only when `includeText: true`.
   * Undefined otherwise.
   */
  text?: string;
}
