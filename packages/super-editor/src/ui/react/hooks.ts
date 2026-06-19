import { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual } from '../equality.js';
import type {
  CommentsSlice,
  ContentControlsSlice,
  DocumentSlice,
  FontFamilyOption,
  FontSizeOption,
  TrackChangesSlice,
  SelectionSlice,
  ToolbarSnapshotSlice,
  UIToolbarCommandState,
  ZoomMode,
  ZoomSlice,
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

const EMPTY_TRACK_CHANGES: TrackChangesSlice = { items: [], total: 0, activeId: null, authors: [] };

const EMPTY_CONTENT_CONTROLS: ContentControlsSlice = { items: [], activeIds: [], activeId: null, total: 0 };

const EMPTY_TOOLBAR: ToolbarSnapshotSlice = { context: null, commands: {} };

const EMPTY_DOCUMENT: DocumentSlice = { ready: false, mode: null, dirty: false };

const EMPTY_FONT_OPTIONS: FontFamilyOption[] = [];
const EMPTY_FONT_SIZE_OPTIONS: FontSizeOption[] = [];

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

/** Subscribe to the tracked-changes slice (items, total, activeId). */
export function useSuperDocTrackChanges(): TrackChangesSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.trackChanges, shallowEqual), EMPTY_TRACK_CHANGES);
}

/**
 * Subscribe to the content-controls (SDT) slice (items, activeIds,
 * activeId, total). Pair with `ui.contentControls.getRect({ id })` to
 * anchor custom field chips, citation popovers, or property panels to
 * the painted wrapper of the active control.
 *
 * ```tsx
 * const { activeId } = useSuperDocContentControls();
 * const ui = useSuperDocUI();
 * if (!activeId || !ui) return null;
 * const r = ui.contentControls.getRect({ id: activeId });
 * if (!r.success) return null;
 * return <Popover style={{ position: 'fixed', left: r.rect.left, top: r.rect.top }} />;
 * ```
 */
export function useSuperDocContentControls(): ContentControlsSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.contentControls, shallowEqual), EMPTY_CONTENT_CONTROLS);
}

/** Subscribe to the full toolbar snapshot (context + per-command states). */
export function useSuperDocToolbar(): ToolbarSnapshotSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.toolbar, shallowEqual), EMPTY_TOOLBAR);
}

/**
 * Subscribe to the document slice (`{ ready, mode }`). Pair with
 * `useSuperDocUI()?.document.setMode(...)` and `.export(...)` /
 * `.replaceFile(...)` to drive a document bar / Export button / mode
 * toggle from one subscription.
 */
export function useSuperDocDocument(): DocumentSlice {
  return useSuperDocSlice((ui) => ui.select((state) => state.document, shallowEqual), EMPTY_DOCUMENT);
}

const EMPTY_ZOOM: ZoomSlice = {
  mode: 'manual',
  value: 100,
  fitZoom: null,
  min: 10,
  max: 100,
  metrics: null,
};

/**
 * Zoom state + actions for custom zoom UIs. The snapshot updates on
 * value changes, mode-only transitions, and viewport metric updates;
 * `set(percent)` switches the host to manual mode by contract,
 * `setMode('fit-width')` re-enters automatic fitting.
 *
 * ```tsx
 * const zoom = useSuperDocZoom();
 * return (
 *   <>
 *     <span>{zoom.value}%</span>
 *     <button
 *       aria-pressed={zoom.mode === 'fit-width'}
 *       onClick={() => zoom.setMode(zoom.mode === 'fit-width' ? 'manual' : 'fit-width')}
 *     >
 *       Fit width
 *     </button>
 *   </>
 * );
 * ```
 */
export function useSuperDocZoom(): ZoomSlice & {
  set: (percent: number) => void;
  setMode: (mode: ZoomMode) => void;
} {
  const ui = useSuperDocUI();
  const slice = useSuperDocSlice((controller) => controller.select((state) => state.zoom, shallowEqual), EMPTY_ZOOM);
  const set = useCallback(
    (percent: number) => {
      ui?.zoom.set(percent);
    },
    [ui],
  );
  const setMode = useCallback(
    (mode: ZoomMode) => {
      ui?.zoom.setMode(mode);
    },
    [ui],
  );
  // Memoized so the returned object keeps its identity while the slice and
  // actions are unchanged; the controller-side slice memo makes `slice`
  // reference-stable, and effects keyed on this hook's result must not
  // re-run on unrelated parent renders.
  return useMemo(() => ({ ...slice, set, setMode }), [slice, set, setMode]);
}

/** Subscribe to the final font-family picker options for custom toolbar UIs. */
export function useSuperDocFontOptions(): FontFamilyOption[] {
  return useSuperDocSlice((ui) => ui.select((state) => state.fonts.options, shallowEqual), EMPTY_FONT_OPTIONS);
}

/** Subscribe to default font-size picker options for custom toolbar UIs. */
export function useSuperDocFontSizeOptions(): FontSizeOption[] {
  return useSuperDocSlice((ui) => ui.select((state) => state.fonts.sizeOptions, shallowEqual), EMPTY_FONT_SIZE_OPTIONS);
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
