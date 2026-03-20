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

type NoteStoryLocator = FootnoteStoryLocator | EndnoteStoryLocator;

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
      const noteType = isFootnote ? 'footnote' : 'endnote';
      const notesConfig = getNotesConfig(noteType);

      // Try rich export via converter's exportToXmlJson (preserves formatting)
      const conv = (hostEditor as unknown as { converter?: ConverterWithNoteExport }).converter;
      const pmJson =
        typeof storyEditor.getUpdatedJson === 'function' ? storyEditor.getUpdatedJson() : storyEditor.getJSON();

      if (conv?.exportToXmlJson && pmJson) {
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

        if (ooxmlElements && ooxmlElements.length > 0) {
          mutatePart({
            editor: hostEditor,
            partId: notesConfig.partId,
            operation: 'mutate',
            source: `story-runtime:commit:${locator.storyType}`,
            mutate({ part }) {
              updateNoteContentFromOoxml(part, notesConfig, noteId, ooxmlElements!);
            },
          });
          return;
        }
      }

      // Fallback: plain-text export (loses formatting)
      const doc = storyEditor.state.doc;
      const text = doc.textBetween(0, doc.content.size, '\n', '\n');

      mutatePart({
        editor: hostEditor,
        partId: notesConfig.partId,
        operation: 'mutate',
        source: `story-runtime:commit:${locator.storyType}`,
        mutate({ part }) {
          updateNoteElement(part, notesConfig, noteId, text);
        },
      });
    },
  };
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
    return {
      type: 'doc',
      content: note.content.length > 0 ? note.content : [{ type: 'paragraph' }],
    };
  }

  // If the note has a `doc` field (pre-built PM JSON), return it directly
  if (note.doc && typeof note.doc === 'object') {
    return note.doc;
  }

  // If the note itself looks like PM JSON (has a `type` field)
  if (note.type === 'doc' || note.type === 'footnoteBody' || note.type === 'endnoteBody') {
    return note;
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
