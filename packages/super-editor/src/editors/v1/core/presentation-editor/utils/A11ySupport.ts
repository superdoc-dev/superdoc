import type { EditorState } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';

/**
 * Synchronizes ARIA attributes on the hidden ProseMirror editor element for accessibility.
 *
 * This function ensures the hidden ProseMirror contenteditable maintains proper ARIA roles
 * and attributes for screen reader compatibility. It sets essential attributes like role,
 * tabindex, and aria-readonly based on the current document mode.
 *
 * @param pmDom - The ProseMirror DOM element (typed as unknown for flexibility)
 * @param documentMode - Current editing mode: 'editing', 'viewing', or 'suggesting'
 *
 * @remarks
 * ARIA attributes configured:
 * - tabindex: 0 (makes element keyboard-focusable)
 * - role: "textbox" (identifies as an editable text input)
 * - aria-multiline: "true" (indicates multi-line text editing)
 * - aria-label: "Document content area" (provides accessible name)
 * - aria-readonly: "true" in viewing mode, "false" otherwise
 *
 * The function only sets attributes that are not already present, preserving any
 * custom attributes set by consuming applications. The aria-readonly attribute is
 * always updated to reflect the current document mode.
 *
 * This is called during initialization and whenever the document mode changes to
 * ensure screen readers have accurate information about the editor state.
 *
 * @example
 * ```typescript
 * // Called during editor initialization
 * syncHiddenEditorA11yAttributes(pmDom, 'editing');
 *
 * // Called when switching to viewing mode
 * syncHiddenEditorA11yAttributes(pmDom, 'viewing');
 * ```
 */
export function syncHiddenEditorA11yAttributes(
  pmDom: unknown,
  documentMode: 'editing' | 'viewing' | 'suggesting',
): void {
  const element = pmDom as unknown;
  if (!(element instanceof HTMLElement)) return;

  if (!element.hasAttribute('tabindex')) {
    element.tabIndex = 0;
  }
  if (!element.hasAttribute('role')) {
    element.setAttribute('role', 'textbox');
  }
  if (!element.hasAttribute('aria-multiline')) {
    element.setAttribute('aria-multiline', 'true');
  }
  if (!element.hasAttribute('aria-label')) {
    element.setAttribute('aria-label', 'Document content area');
  }
  element.setAttribute('aria-readonly', documentMode === 'viewing' ? 'true' : 'false');
}

/**
 * Schedules a debounced accessibility announcement for selection changes.
 *
 * This function implements debounced announcements of selection changes to screen readers
 * via an ARIA live region. It prevents excessive announcements during rapid selection
 * changes while ensuring users are informed of meaningful selection updates.
 *
 * @param deps - Dependencies object containing state and callback
 * @param options - Optional configuration to control announcement timing
 * @returns The new timeout ID, or null if announcement was not scheduled
 *
 * @remarks
 * Debouncing behavior:
 * - Default delay: 150ms from the last selection change
 * - Immediate mode (options.immediate): 0ms delay
 * - Clears any pending timeout before scheduling a new one
 *
 * Conditions that prevent scheduling:
 * - No aria live region available (ariaLiveRegion is null)
 * - Session mode is not 'body' (header/footer editing is skipped)
 * - User is actively dragging (unless options.immediate is true)
 *
 * The debouncing prevents announcement spam during rapid selection changes like:
 * - Continuous dragging to extend selection
 * - Arrow key navigation with selection
 * - Word/paragraph selection via double/triple click
 *
 * The immediate option is used for important selection events that should be
 * announced without delay, such as programmatic selection changes or user-initiated
 * search results.
 *
 * @example
 * ```typescript
 * // Normal debounced announcement
 * const timeoutId = scheduleA11ySelectionAnnouncement({
 *   ariaLiveRegion,
 *   sessionMode: 'body',
 *   isDragging: false,
 *   visibleHost,
 *   currentTimeout: null,
 *   announceNow: () => announceSelection()
 * });
 *
 * // Immediate announcement for search result
 * scheduleA11ySelectionAnnouncement(deps, { immediate: true });
 * ```
 */
export function scheduleA11ySelectionAnnouncement(
  deps: {
    ariaLiveRegion: HTMLElement | null;
    sessionMode: 'body' | 'header' | 'footer';
    isDragging: boolean;
    visibleHost: HTMLElement | null;
    currentTimeout: number | null;
    announceNow: () => void;
  },
  options?: { immediate?: boolean },
): number | null {
  if (!deps.ariaLiveRegion) return deps.currentTimeout;
  if (deps.sessionMode !== 'body') return deps.currentTimeout;
  if (deps.isDragging && !options?.immediate) return deps.currentTimeout;

  if (deps.currentTimeout != null) {
    clearTimeout(deps.currentTimeout);
  }

  const win = deps.visibleHost?.ownerDocument?.defaultView ?? window;
  const testImmediate = Boolean(options?.immediate);
  const delayMs = testImmediate ? 0 : 150;
  return win.setTimeout(() => {
    deps.announceNow();
  }, delayMs);
}

/**
 * Computes an accessibility-friendly announcement message for the current selection.
 *
 * This function generates a human-readable message describing the current selection state,
 * suitable for announcing to screen reader users. It handles different selection types
 * (text, cell) and extracts text snippets for range selections.
 *
 * @param editorState - Current ProseMirror editor state
 * @returns Announcement object with positions, message, and cache key, or null if selection is invalid
 *
 * @remarks
 * Selection types and messages:
 * - CellSelection: "Table cells selected."
 * - Collapsed selection (caret): "Cursor moved."
 * - Text range selection: "Selected: [text snippet]" or "Selection updated."
 *
 * Text snippet extraction:
 * - Maximum 256 characters sampled from the selection
 * - Whitespace normalized to single spaces
 * - Trailing ellipsis (…) if selection is longer than 256 characters
 * - Gracefully handles extraction failures (returns generic message)
 *
 * Return value structure:
 * - from: Start position of selection
 * - to: End position of selection
 * - message: Human-readable announcement text
 * - key: Unique cache key in format "from:to:message" for deduplication
 *
 * The cache key enables deduplication of identical announcements, preventing
 * screen readers from re-announcing the same information unnecessarily.
 *
 * Edge cases:
 * - Returns null if editorState or selection is invalid
 * - Returns null if selection positions are not numbers
 * - Handles rapid transaction failures gracefully (during document updates)
 * - Normalizes position order (handles backward selections)
 *
 * @example
 * ```typescript
 * const announcement = computeA11ySelectionAnnouncement(editorState);
 * if (announcement) {
 *   // Check if this is a new announcement
 *   if (announcement.key !== lastAnnouncementKey) {
 *     ariaLiveRegion.textContent = announcement.message;
 *     lastAnnouncementKey = announcement.key;
 *   }
 * }
 * ```
 */
export function computeA11ySelectionAnnouncement(
  editorState: EditorState,
): { from: number; to: number; message: string; key: string } | null {
  const selection = editorState?.selection as unknown as { from?: unknown; to?: unknown } | null | undefined;
  if (!selection) return null;

  const fromRaw = selection.from;
  const toRaw = selection.to;
  if (typeof fromRaw !== 'number' || typeof toRaw !== 'number') {
    return null;
  }

  const from = fromRaw;
  const to = toRaw;

  let message: string;
  if (selection instanceof CellSelection) {
    message = 'Table cells selected.';
  } else if (from === to) {
    message = 'Cursor moved.';
  } else {
    const start = Math.max(0, Math.min(from, to));
    const end = Math.max(0, Math.max(from, to));
    const doc = editorState?.doc as unknown as {
      textBetween?: (from: number, to: number, blockSeparator?: string, leafText?: string) => string;
    };

    let snippet = '';
    if (doc && typeof doc.textBetween === 'function') {
      try {
        const sampleEnd = Math.min(end, start + 256);
        snippet = doc.textBetween(start, sampleEnd, ' ', ' ').replace(/\s+/g, ' ').trim();
        if (sampleEnd < end && snippet.length > 0) {
          snippet = `${snippet}…`;
        }
      } catch {
        // Ignore doc sampling failures (e.g., during rapid transactions)
      }
    }

    message = snippet.length > 0 ? `Selected: ${snippet}` : 'Selection updated.';
  }

  const key = `${from}:${to}:${message}`;
  return { from, to, message, key };
}
