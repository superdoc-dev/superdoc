/**
 * Note story runtime resolution.
 *
 * Resolves footnote and endnote locators to a StoryRuntime by extracting
 * note content from the converter's derived cache and creating a headless
 * story editor.
 */

import type { FootnoteStoryLocator, EndnoteStoryLocator } from '@superdoc/document-api';
import type { Editor } from '../../core/Editor.js';
import type { StoryRuntime } from './story-types.js';
import { buildStoryKey } from './story-key.js';
import { createStoryEditor } from '../../core/story-editor-factory.js';
import { DocumentApiAdapterError } from '../errors.js';
import { mutatePart } from '../../core/parts/mutation/mutate-part.js';
import {
  getNotesConfig,
  getNoteElements,
  ensureFootnoteRefRun,
  updateNoteElement,
} from '../../core/parts/adapters/notes-part-descriptor.js';
import { normalizeNotePmJson } from '../helpers/note-pm-json.js';
import { footnotesRemoveWrapper } from '../plan-engine/footnote-wrappers.js';
import { findAllFootnotes } from '../helpers/footnote-resolver.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

type NoteStoryLocator = FootnoteStoryLocator | EndnoteStoryLocator;

/**
 * SD-3400: a note is "empty" once it holds no text and no embedded atoms
 * (images, etc.). Whitespace-only content counts as empty — the user cleared it.
 * Exported so PresentationEditor's note-session watcher applies the same rule.
 */
export function isNoteContentEmpty(doc: ProseMirrorNode): boolean {
  // Defensive: emptiness triggers REMOVAL of the footnote, so a doc that
  // cannot be inspected (detached/mocked session editors without a real PM
  // doc) must read as NOT empty — never delete on uncertainty.
  if (!doc || typeof (doc as { descendants?: unknown }).descendants !== 'function') return false;
  let hasContent = false;
  doc.descendants((node) => {
    if (hasContent) return false;
    if (node.isText) {
      if ((node.text ?? '').trim().length > 0) hasContent = true;
    } else if (node.isAtom && node.type.name !== 'text') {
      hasContent = true;
    }
    return !hasContent;
  });
  return !hasContent;
}

interface NoteExportToXmlJsonResult {
  result?: {
    elements?: Array<{
      elements?: unknown[];
    }>;
  };
}

interface NoteExportToXmlJsonOptions {
  data: unknown;
  editor: Editor;
  editorSchema: unknown;
  isHeaderFooter: boolean;
  comments: unknown[];
  commentDefinitions: unknown[];
}

interface ConverterWithNoteExport {
  exportToXmlJson?: (options: NoteExportToXmlJsonOptions) => NoteExportToXmlJsonResult;
}

/**
 * Resolves a footnote or endnote locator to a StoryRuntime.
 *
 * Note content is extracted from the converter's derived cache (the PM JSON
 * representation of the note's body paragraphs). If the converter cannot
 * provide PM JSON for the note, falls back to extracting from the OOXML part.
 */
export function resolveNoteRuntime(hostEditor: Editor, locator: NoteStoryLocator): StoryRuntime {
  const storyKey = buildStoryKey(locator);
  const converter = hostEditor.converter;

  if (!converter) {
    throw new DocumentApiAdapterError(
      'STORY_NOT_FOUND',
      `Cannot resolve ${locator.storyType} story: no converter available.`,
      { storyKey },
    );
  }

  const isFootnote = locator.storyType === 'footnote';
  const noteId = locator.noteId;

  // Try to get PM JSON content for this note from the converter's cache
  const pmJson = extractNotePmJson(converter, isFootnote, noteId);
  if (!pmJson) {
    throw new DocumentApiAdapterError(
      'STORY_NOT_FOUND',
      `${isFootnote ? 'Footnote' : 'Endnote'} "${noteId}" not found.`,
      { storyKey, noteId },
    );
  }

  const storyEditor = createStoryEditor(hostEditor, pmJson, {
    documentId: `${locator.storyType}:${noteId}`,
    isHeaderOrFooter: false,
    headless: true,
  });

  return {
    locator,
    storyKey,
    editor: storyEditor,
    kind: 'note',
    dispose: () => storyEditor.destroy(),
    commit: (hostEditor: Editor) => {
      commitNoteRuntime(hostEditor, storyEditor, locator, isFootnote);
    },
    commitEditor: (hostEditor: Editor, sessionEditor: Editor) => {
      commitNoteRuntime(hostEditor, sessionEditor, locator, isFootnote);
    },
  };
}

type NotesConfig = ReturnType<typeof getNotesConfig>;

function commitNoteRuntime(
  hostEditor: Editor,
  storyEditor: Editor,
  locator: NoteStoryLocator,
  isFootnote: boolean,
): void {
  const noteType = isFootnote ? 'footnote' : 'endnote';
  const notesConfig = getNotesConfig(noteType);

  if (isNoteContentEmpty(storyEditor.state.doc)) {
    removeEmptiedNote(hostEditor, locator);
    return;
  }

  if (commitRichNoteContent(hostEditor, storyEditor, locator, notesConfig)) {
    return;
  }

  commitPlainTextNoteContent(hostEditor, storyEditor, locator, notesConfig);
}

/**
 * SD-3400: clearing all content in the note area deletes the footnote on BOTH
 * sides — the note element in the notes part AND the body reference — and the
 * document renumbers. This mirrors the body-side staged delete; deleting from
 * either side removes the whole footnote. footnotesRemoveWrapper deletes the
 * body reference node and removes the OOXML element when no other reference
 * remains. Guard on the reference still existing so a stale commit is a no-op.
 */
function removeEmptiedNote(hostEditor: Editor, locator: NoteStoryLocator): void {
  const referenceExists = findAllFootnotes(hostEditor.state.doc).some((f) => f.noteId === locator.noteId);
  if (!referenceExists) return;
  footnotesRemoveWrapper(hostEditor, {
    target: { kind: 'entity', entityType: 'footnote', noteId: locator.noteId },
  });
}

/**
 * Rich commit via the converter's exportToXmlJson (preserves formatting).
 * Returns false when the converter is unavailable or export produced nothing,
 * so the caller can fall back to plain text.
 */
function commitRichNoteContent(
  hostEditor: Editor,
  storyEditor: Editor,
  locator: NoteStoryLocator,
  notesConfig: NotesConfig,
): boolean {
  const conv = (hostEditor as unknown as { converter?: ConverterWithNoteExport }).converter;
  const pmJson =
    typeof storyEditor.getUpdatedJson === 'function' ? storyEditor.getUpdatedJson() : storyEditor.getJSON();
  if (!conv?.exportToXmlJson || !pmJson) return false;

  let ooxmlElements: unknown[] | null = null;
  try {
    const { result } = conv.exportToXmlJson({
      data: pmJson,
      editor: storyEditor,
      editorSchema: storyEditor.schema,
      isHeaderFooter: true,
      comments: [],
      commentDefinitions: [],
    });
    // result.elements[0] is the body wrapper; its children are all
    // content elements (paragraphs, tables, etc.). Keep all of them
    // so tables and other non-paragraph content survive the commit.
    const body = result?.elements?.[0] as { elements?: unknown[] } | undefined;
    ooxmlElements = body?.elements ?? null;
  } catch {
    // Fall through to plain-text fallback
  }
  if (!ooxmlElements || ooxmlElements.length === 0) return false;

  const elements = ooxmlElements;
  mutatePart({
    editor: hostEditor,
    partId: notesConfig.partId,
    operation: 'mutate',
    source: `story-runtime:commit:${locator.storyType}`,
    mutate({ part }) {
      updateNoteContentFromOoxml(part, notesConfig, locator.noteId, elements);
    },
  });
  return true;
}

/** Fallback: plain-text export (loses formatting). */
function commitPlainTextNoteContent(
  hostEditor: Editor,
  storyEditor: Editor,
  locator: NoteStoryLocator,
  notesConfig: NotesConfig,
): void {
  const doc = storyEditor.state.doc;
  const text = doc.textBetween(0, doc.content.size, '\n', '\n');

  mutatePart({
    editor: hostEditor,
    partId: notesConfig.partId,
    operation: 'mutate',
    source: `story-runtime:commit:${locator.storyType}`,
    mutate({ part }) {
      updateNoteElement(part, notesConfig, locator.noteId, text);
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts PM JSON content for a specific note from the converter cache.
 *
 * The converter stores notes as arrays of `{ id, content }` objects in
 * `converter.footnotes` and `converter.endnotes`. This function searches
 * the appropriate collection by note ID and returns PM JSON suitable for
 * creating a story editor.
 */
function extractNotePmJson(converter: any, isFootnote: boolean, noteId: string): Record<string, unknown> | null {
  // The converter stores notes as arrays: [{ id, content }, ...]
  const collection: any[] | undefined = isFootnote ? converter.footnotes : converter.endnotes;
  if (!Array.isArray(collection)) return null;

  // Find the note by ID (IDs may be stored as strings or numbers)
  const note: any = collection.find((item: any) => String(item.id) === String(noteId));
  if (!note) return null;

  // If the note has a `content` array, wrap it as a PM doc.
  // Empty arrays represent blank notes (e.g., after the reference marker is stripped)
  // and are valid — they produce a minimal doc with an empty paragraph.
  if (Array.isArray(note.content)) {
    return normalizeNotePmJson({
      type: 'doc',
      content: note.content.length > 0 ? note.content : [{ type: 'paragraph' }],
    });
  }

  // If the note has a `doc` field (pre-built PM JSON), return it directly
  if (note.doc && typeof note.doc === 'object') {
    return normalizeNotePmJson(note.doc);
  }

  // If the note itself looks like PM JSON (has a `type` field)
  if (note.type === 'doc' || note.type === 'footnoteBody' || note.type === 'endnoteBody') {
    return normalizeNotePmJson(note);
  }

  return null;
}

/**
 * Replace the note's child elements with exported OOXML content,
 * preserving the footnote/endnote reference run in the first paragraph.
 *
 * Accepts all content element types (paragraphs, tables, etc.) so
 * rich note content survives the commit.
 */
function updateNoteContentFromOoxml(
  part: unknown,
  config: { childElementName: string },
  noteId: string,
  contentElements: unknown[],
): boolean {
  const notes = getNoteElements(part, config.childElementName);
  const target = notes.find((el: any) => el.attributes?.['w:id'] === noteId);
  if (!target) return false;

  const elements = contentElements as Array<{ name?: string; elements?: unknown[] }>;

  // Ensure the first paragraph has the footnote/endnote reference run.
  // ensureFootnoteRefRun only modifies w:p elements, so non-paragraph
  // content (tables, etc.) passes through unchanged.
  ensureFootnoteRefRun(elements as any[], config.childElementName);

  (target as any).elements = elements;
  return true;
}
