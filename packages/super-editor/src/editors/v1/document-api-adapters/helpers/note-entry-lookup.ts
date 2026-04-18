/**
 * Shared lookup for note entries by ID.
 *
 * When a notes part contains both a special entry (separator /
 * continuationSeparator) and a regular note with the same numeric ID,
 * the regular note takes precedence. This prevents special boilerplate
 * entries from masking real user-created content in rendering and in the
 * document API (get_footnote).
 *
 * Used by:
 *   - `footnote-resolver.ts` (document API reads)
 *   - `FootnotesBuilder.ts`  (layout rendering)
 */

/** Minimal note-entry shape shared across resolver, builder, and exporter. */
export interface NoteEntryLike {
  id?: unknown;
  type?: string | null;
  content?: unknown;
}

/** Types that Word uses for separator boilerplate (not real user content). */
const SPECIAL_NOTE_TYPES = new Set(['separator', 'continuationSeparator']);

function isSpecialEntry(entry: NoteEntryLike): boolean {
  return SPECIAL_NOTE_TYPES.has(entry.type ?? '');
}

/**
 * Find a note entry by ID with regular-note priority.
 *
 * Precedence:
 *   1. Exact-id regular note (type is null / undefined / any non-special string)
 *   2. Exact-id special note (only if no regular note matched)
 *
 * Returns `undefined` when no entry matches.
 */
export function findNoteEntryById<T extends NoteEntryLike>(
  entries: T[] | undefined | null,
  noteId: string,
): T | undefined {
  if (!Array.isArray(entries)) return undefined;

  let fallback: T | undefined;

  for (const entry of entries) {
    if (String(entry.id ?? '') !== noteId) continue;

    if (!isSpecialEntry(entry)) return entry; // exact-id regular note — best match
    fallback ??= entry; // exact-id special note — keep as fallback
  }

  return fallback;
}
