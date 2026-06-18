/**
 * Enumerate every revision-capable story in a host document.
 *
 * Used by {@link TrackedChangeIndex} to drive cross-story tracked-change
 * discovery when callers pass `in: 'all'` or need to build a single
 * aggregated snapshot.
 *
 * The enumeration is purely a read over the converter's derived caches —
 * it never resolves a story runtime. Runtime resolution is deferred to
 * the index so we do not pay editor construction cost for stories that
 * hold zero tracked changes.
 */

import type { StoryLocator } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';

interface NoteEntry {
  id: string | number;
}

interface ConverterShape {
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  footnotes?: NoteEntry[];
  endnotes?: NoteEntry[];
  sessionManagedNoteIds?: { footnotes: Set<string>; endnotes: Set<string> };
}

function getConverter(editor: Editor): ConverterShape | undefined {
  return (editor as unknown as { converter?: ConverterShape }).converter;
}

/**
 * Returns the note's revision-capable id as a string, or `null` when the note
 * lacks an id or uses a special-purpose negative id (separator,
 * continuationSeparator, etc.).
 */
function toRevisionCapableNoteId(note: NoteEntry | undefined | null): string | null {
  if (!note || note.id === undefined || note.id === null) return null;
  const numeric = Number(note.id);
  if (Number.isFinite(numeric) && numeric < 0) return null;
  const noteId = String(note.id);
  return noteId.length > 0 ? noteId : null;
}

/**
 * Returns every revision-capable story locator for the given host editor.
 *
 * Body is always first; header/footer parts, footnotes, and endnotes follow
 * in insertion-order. Header/footer slots are intentionally NOT enumerated —
 * tracked-change identity always addresses the owning part, so slot
 * enumeration would produce duplicates against parts.
 */
export function enumerateRevisionCapableStories(editor: Editor): StoryLocator[] {
  const stories: StoryLocator[] = [{ kind: 'story', storyType: 'body' }];

  const converter = getConverter(editor);
  if (!converter) return stories;

  if (converter.headers) {
    for (const refId of Object.keys(converter.headers)) {
      stories.push({ kind: 'story', storyType: 'headerFooterPart', refId });
    }
  }

  if (converter.footers) {
    for (const refId of Object.keys(converter.footers)) {
      stories.push({ kind: 'story', storyType: 'headerFooterPart', refId });
    }
  }

  if (Array.isArray(converter.footnotes)) {
    const tombstoned = collectTombstonedNoteIds(editor, converter, 'footnote');
    for (const note of converter.footnotes) {
      const noteId = toRevisionCapableNoteId(note);
      if (!noteId || tombstoned.has(noteId)) continue;
      stories.push({ kind: 'story', storyType: 'footnote', noteId });
    }
  }

  if (Array.isArray(converter.endnotes)) {
    const tombstoned = collectTombstonedNoteIds(editor, converter, 'endnote');
    for (const note of converter.endnotes) {
      const noteId = toRevisionCapableNoteId(note);
      if (!noteId || tombstoned.has(noteId)) continue;
      stories.push({ kind: 'story', storyType: 'endnote', noteId });
    }
  }

  return stories;
}

/**
 * Ids of session-deleted (tombstoned) notes: registered as session-managed
 * AND without a surviving reference node in the host doc (SD-3400). Their
 * elements stay in the part so undo can restore them, but they must not
 * surface as revision-capable stories. Pre-existing orphan notes are never
 * registered, so their enumeration behavior is unchanged.
 */
function collectTombstonedNoteIds(
  editor: Editor,
  converter: ConverterShape,
  type: 'footnote' | 'endnote',
): Set<string> {
  const registry = converter.sessionManagedNoteIds?.[type === 'endnote' ? 'endnotes' : 'footnotes'];
  if (!registry || registry.size === 0) return new Set();

  const referenceNodeName = type === 'endnote' ? 'endnoteReference' : 'footnoteReference';
  const referenced = new Set<string>();
  editor.state?.doc?.descendants((node) => {
    if (node.type?.name === referenceNodeName && node.attrs?.id != null) {
      referenced.add(String(node.attrs.id));
    }
    return true;
  });

  const tombstoned = new Set<string>();
  for (const id of registry) {
    if (!referenced.has(id)) tombstoned.add(id);
  }
  return tombstoned;
}
