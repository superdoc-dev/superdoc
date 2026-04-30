import { useEffect, useState } from 'react';
import { shallowEqual } from '../equality.js';
import type {
  CommentsSlice,
  ReviewSlice,
  SelectionSlice,
  ToolbarSnapshotSlice,
  UIToolbarCommandState,
} from '../types.js';
import { useSuperDocSlice, useSuperDocUI } from './provider.js';

const EMPTY_SELECTION: SelectionSlice = {
  empty: true,
  target: null,
  selectionTarget: null,
  activeMarks: [],
  activeCommentIds: [],
  activeChangeIds: [],
  quotedText: '',
};

const EMPTY_COMMENTS: CommentsSlice = { items: [], activeIds: [], total: 0 };

const EMPTY_REVIEW: ReviewSlice = { items: [], openCount: 0, activeId: null };

const EMPTY_TOOLBAR: ToolbarSnapshotSlice = { context: null, commands: {} };

/**
 * Subscribe to the current selection slice.
 *
 * Returns the full {@link SelectionSlice} — empty/target/selectionTarget
 * (SD-2812)/activeMarks/activeCommentIds/activeChangeIds/quotedText.
 * Use the returned `target` for `editor.doc.comments.create({ target })`
 * and the `selectionTarget` for `editor.doc.insert({ target })`.
 */
export function useSuperDocSelection(): SelectionSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.selection, shallowEqual), EMPTY_SELECTION);
}

/** Subscribe to the comments slice (items, activeIds, total). */
export function useSuperDocComments(): CommentsSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.comments, shallowEqual), EMPTY_COMMENTS);
}

/** Subscribe to the merged review feed (comments + tracked changes). */
export function useSuperDocReview(): ReviewSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.review, shallowEqual), EMPTY_REVIEW);
}

/** Subscribe to the full toolbar snapshot (context + per-command states). */
export function useSuperDocToolbar(): ToolbarSnapshotSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.toolbar, shallowEqual), EMPTY_TOOLBAR);
}

const FALLBACK_COMMAND_STATE: UIToolbarCommandState = {
  active: false,
  disabled: true,
  value: undefined,
  source: 'built-in',
};

/**
 * Subscribe to a single command's state by id.
 *
 * Works for both built-in command ids (`'bold'`, `'italic'`, …) and
 * custom command ids registered via `ui.commands.register(...)`. The
 * returned object includes `active`, `disabled`, `value`, and the
 * `source` discriminator (`'built-in' | 'custom'`).
 *
 * Returns the fallback disabled state until the editor is ready or
 * while the id isn't registered.
 *
 * ```tsx
 * const bold = useSuperDocCommand('bold');
 * <button data-active={bold.active} disabled={bold.disabled}>B</button>
 * ```
 *
 * Implementation note: this hook bypasses {@link useSuperDocSlice}
 * because the selector closes over `id`. `useSuperDocSlice`'s
 * subscription effect re-runs only when the controller swaps, so a
 * toolbar component reused with a different command id under the
 * same provider would otherwise keep emitting state for the prior
 * id. Subscribing here with `[ui, id]` deps fixes the resubscription
 * the substrate alone can't see.
 */
export function useSuperDocCommand(id: string): UIToolbarCommandState {
  const ui = useSuperDocUI();
  const [value, setValue] = useState<UIToolbarCommandState>(FALLBACK_COMMAND_STATE);

  useEffect(() => {
    if (!ui) {
      setValue(FALLBACK_COMMAND_STATE);
      return;
    }
    const sub = ui.select((state) => state.toolbar.commands?.[id] ?? FALLBACK_COMMAND_STATE, shallowEqual);
    return sub.subscribe((next) => setValue(next));
  }, [ui, id]);

  return value;
}
