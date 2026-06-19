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
import { removeNoteEverywhere } from '../plan-engine/footnote-wrappers.js';
import { TrackChangesBasePluginKey } from '../../extensions/track-changes/plugins/index.js';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

type NoteStoryLocator = FootnoteStoryLocator | EndnoteStoryLocator;

/**
 * SD-3400: a note is "empty" once it holds no text and no embedded atoms
 * (images, etc.). Whitespace-only content counts as empty — the user cleared it.
 * Exported so PresentationEditor's note-session watcher applies the same rule.
 */
export function isNoteContentEmpty(doc: ProseMirrorNode): boolean {
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
    // SD-3400: emptied-note auto-removal is an editing-mode behavior. In
    // suggesting mode the marker delete would be rewritten into a tracked
    // suggestion while the part write ran unconditionally, silently diverging
    // doc and part. Keep the note UNTOUCHED instead (no removal AND no commit
    // of the emptied content — a part write is untracked and not undoable);
    // reopening the note shows the original text.
    const trackingActive = Boolean(TrackChangesBasePluginKey.getState(hostEditor.state)?.isTrackChangesActive);
    if (trackingActive) {
      return;
    }
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
 * sides — the note element in the notes part AND every body reference — and
 * the document renumbers. This mirrors the body-side staged delete; deleting
 * from either side removes the whole footnote. Multi-reference notes lose all
 * their markers (the emptied note no longer exists for any of them), and
 * resolution is type-aware so emptying endnote "2" never touches footnote "2".
 * The `w:footnote` element itself is tombstoned (kept in the part), so a
 * single undo restores the whole note; export prunes it while unreferenced.
 */
function removeEmptiedNote(hostEditor: Editor, locator: NoteStoryLocator): void {
  removeNoteEverywhere(hostEditor, { noteId: locator.noteId, type: locator.storyType });
}

const NOTE_REFERENCE_NODE_TYPES = new Set(['footnoteReference', 'endnoteReference']);

/**
 * §17.11.14: a footnote reference inside a footnote or endnote makes the
 * document non-conformant. Reference nodes can reach a note story through
 * paste (HTML containing `sup[data-footnote-id]` parses to footnoteReference);
 * strip them before the note content is exported to the OOXML part.
 */
function stripNoteReferenceNodes<T extends { type?: string; content?: T[] }>(node: T): T {
  if (!Array.isArray(node.content)) return node;
  return {
    ...node,
    content: node.content
      .filter((child) => !NOTE_REFERENCE_NODE_TYPES.has(child?.type ?? ''))
      .map((child) => stripNoteReferenceNodes(child)),
  };
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
  const rawPmJson =
    typeof storyEditor.getUpdatedJson === 'function' ? storyEditor.getUpdatedJson() : storyEditor.getJSON();
  if (!conv?.exportToXmlJson || !rawPmJson) return false;
  const pmJson = stripNoteReferenceNodes(rawPmJson);

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
