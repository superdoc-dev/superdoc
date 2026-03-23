/**
 * Part descriptors for `word/footnotes.xml` and `word/endnotes.xml`.
 *
 * Follows the same architectural pattern as numbering-part-descriptor.ts:
 * canonical data is OOXML JSON in the parts store. `converter.footnotes`
 * and `converter.endnotes` are derived caches rebuilt in `afterCommit`.
 *
 * Both footnotes and endnotes share the same OOXML structure (w:footnotes /
 * w:endnotes containing w:footnote / w:endnote children), so a single
 * factory creates both descriptors.
 */

import type { Editor } from '../../Editor.js';
import type { PartDescriptor, PartId } from '../types.js';
import { clearPartCacheStale } from '../cache-staleness.js';

// ---------------------------------------------------------------------------
// Part IDs
// ---------------------------------------------------------------------------

export const FOOTNOTES_PART_ID = 'word/footnotes.xml' as PartId;
export const ENDNOTES_PART_ID = 'word/endnotes.xml' as PartId;

// ---------------------------------------------------------------------------
// OOXML Constants
// ---------------------------------------------------------------------------

/** Config for footnotes vs endnotes — element names and namespace URIs. */
interface NotePartConfig {
  partId: PartId;
  rootElementName: string;
  childElementName: string;
  converterKey: 'footnotes' | 'endnotes';
}

const FOOTNOTES_CONFIG: NotePartConfig = {
  partId: FOOTNOTES_PART_ID,
  rootElementName: 'w:footnotes',
  childElementName: 'w:footnote',
  converterKey: 'footnotes',
};

const ENDNOTES_CONFIG: NotePartConfig = {
  partId: ENDNOTES_PART_ID,
  rootElementName: 'w:endnotes',
  childElementName: 'w:endnote',
  converterKey: 'endnotes',
};

/**
 * Minimal OOXML namespace attributes for footnotes/endnotes parts.
 * Matches the namespaces Word emits for these part types.
 */
const NOTES_XMLNS: Record<string, string> = {
  'xmlns:wpc': 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
  'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  'xmlns:o': 'urn:schemas-microsoft-com:office:office',
  'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'xmlns:m': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  'xmlns:v': 'urn:schemas-microsoft-com:vml',
  'xmlns:wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  'xmlns:wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  'xmlns:w10': 'urn:schemas-microsoft-com:office:word',
  'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
  'xmlns:wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  'xmlns:wpi': 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk',
  'xmlns:wne': 'http://schemas.microsoft.com/office/word/2006/wordml',
  'xmlns:wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
};

// ---------------------------------------------------------------------------
// Converter shape (minimal interface to avoid importing SuperConverter)
// ---------------------------------------------------------------------------

export interface NoteEntry {
  id: string;
  type?: string | null;
  content: unknown[];
  originalXml?: unknown;
}

interface ConverterForNotes {
  footnotes?: NoteEntry[];
  endnotes?: NoteEntry[];
  reimportNotePart?: (partId: string) => NoteEntry[];
}

function getConverter(editor: Editor): ConverterForNotes | undefined {
  return (editor as unknown as { converter?: ConverterForNotes }).converter;
}

// ---------------------------------------------------------------------------
// OOXML Tree Helpers
// ---------------------------------------------------------------------------

interface OoxmlElement {
  type?: string;
  name?: string;
  attributes?: Record<string, string>;
  elements?: OoxmlElement[];
}

interface OoxmlDocument {
  declaration?: unknown;
  elements?: OoxmlElement[];
}

/** Get the root element (e.g., <w:footnotes>) from the part document. */
function getRootElement(part: unknown): OoxmlElement | undefined {
  return (part as OoxmlDocument)?.elements?.[0];
}

/** Get the child note elements (e.g., <w:footnote> children). */
export function getNoteElements(part: unknown, childElementName: string): OoxmlElement[] {
  const root = getRootElement(part);
  if (!root?.elements) return [];
  return root.elements.filter((el) => el.name === childElementName);
}

// ---------------------------------------------------------------------------
// OOXML Mutation Helpers (used by footnote-wrappers via mutatePart)
// ---------------------------------------------------------------------------

/**
 * Convert plain text lines into minimal OOXML paragraph elements.
 *
 * Used during insert/update to write text content directly into the
 * canonical OOXML part. The result is valid w:p elements that can be
 * re-imported by the standard footnote importer.
 */
export function textToNoteOoxmlParagraphs(text: string): OoxmlElement[] {
  return text.split(/\r?\n/).map((line) => ({
    type: 'element',
    name: 'w:p',
    elements:
      line.length > 0
        ? [
            {
              type: 'element',
              name: 'w:r',
              elements: [
                {
                  type: 'element',
                  name: 'w:t',
                  attributes: { 'xml:space': 'preserve' },
                  elements: [{ type: 'text', text: line } as OoxmlElement],
                },
              ],
            },
          ]
        : [],
  }));
}

/**
 * Insert a footnote/endnote reference marker run as the first run of the
 * first paragraph. Word expects this marker in note content.
 *
 * When the content starts with a non-paragraph element (e.g. a table),
 * the function finds the first `w:p` in the array. If no paragraph
 * exists at all, no reference run is inserted — the content is left as-is.
 */
export function ensureFootnoteRefRun(elements: OoxmlElement[], childElementName: string): void {
  if (elements.length === 0) return;

  // Find the first w:p element — may not be at index 0 if the note
  // starts with a table or other block-level content.
  const firstParagraph = elements.find((el) => el.name === 'w:p');
  if (!firstParagraph) return;

  if (!firstParagraph.elements) firstParagraph.elements = [];

  const refName = childElementName === 'w:footnote' ? 'w:footnoteRef' : 'w:endnoteRef';
  const styleName = childElementName === 'w:footnote' ? 'FootnoteReference' : 'EndnoteReference';

  // Check if the ref run already exists to avoid duplication
  const alreadyHasRef = firstParagraph.elements.some(
    (el) => el.name === 'w:r' && el.elements?.some((child) => child.name === refName),
  );
  if (alreadyHasRef) return;

  const refRun: OoxmlElement = {
    type: 'element',
    name: 'w:r',
    elements: [
      {
        type: 'element',
        name: 'w:rPr',
        elements: [
          { type: 'element', name: 'w:rStyle', attributes: { 'w:val': styleName } },
          { type: 'element', name: 'w:vertAlign', attributes: { 'w:val': 'superscript' } },
        ],
      },
      { type: 'element', name: refName, elements: [] },
    ],
  };

  // Insert after w:pPr if present, otherwise at index 0
  const pPrIndex = firstParagraph.elements.findIndex((el) => el?.name === 'w:pPr');
  firstParagraph.elements.splice(pPrIndex >= 0 ? pPrIndex + 1 : 0, 0, refRun);
}

/**
 * Add a new note element to the OOXML part.
 *
 * Called inside a `mutatePart` callback. Mutates the part in place.
 * Returns the created OOXML element.
 */
export function addNoteElement(part: unknown, config: NotePartConfig, noteId: string, text: string): OoxmlElement {
  const root = getRootElement(part);
  if (!root) throw new Error(`addNoteElement: missing root element in ${config.partId}`);
  if (!root.elements) root.elements = [];

  // Collision guard: fail fast instead of silently corrupting the part
  const duplicate = root.elements.find(
    (el) => el.name === config.childElementName && el.attributes?.['w:id'] === noteId,
  );
  if (duplicate) {
    throw new Error(`addNoteElement: note id "${noteId}" already exists in ${config.partId}`);
  }

  const paragraphs = textToNoteOoxmlParagraphs(text);
  ensureFootnoteRefRun(paragraphs, config.childElementName);

  const noteElement: OoxmlElement = {
    type: 'element',
    name: config.childElementName,
    attributes: { 'w:id': noteId },
    elements: paragraphs,
  };

  root.elements.push(noteElement);
  return noteElement;
}

/**
 * Update the content of an existing note element in the OOXML part.
 *
 * Called inside a `mutatePart` callback. Mutates the part in place.
 * Returns true if the element was found and updated.
 */
export function updateNoteElement(part: unknown, config: NotePartConfig, noteId: string, text: string): boolean {
  const notes = getNoteElements(part, config.childElementName);
  const target = notes.find((el) => el.attributes?.['w:id'] === noteId);
  if (!target) return false;

  const paragraphs = textToNoteOoxmlParagraphs(text);
  ensureFootnoteRefRun(paragraphs, config.childElementName);
  target.elements = paragraphs;
  return true;
}

/**
 * Remove a note element from the OOXML part.
 *
 * Called inside a `mutatePart` callback. Mutates the part in place.
 * Returns true if the element was found and removed.
 */
export function removeNoteElement(part: unknown, config: NotePartConfig, noteId: string): boolean {
  const root = getRootElement(part);
  if (!root?.elements) return false;

  const index = root.elements.findIndex(
    (el) => el.name === config.childElementName && el.attributes?.['w:id'] === noteId,
  );
  if (index < 0) return false;

  root.elements.splice(index, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Derived Cache Rebuild
// ---------------------------------------------------------------------------

/**
 * Rebuild `converter.footnotes` or `converter.endnotes` from the canonical
 * OOXML part. Delegates to `converter.reimportNotePart()` when available
 * (full re-import with converter pipeline). Falls back to a lightweight
 * structural extraction for environments where the full pipeline is not ready.
 */
function rebuildDerivedCache(editor: Editor, config: NotePartConfig, part: unknown): void {
  const converter = getConverter(editor);
  if (!converter) return;

  if (typeof converter.reimportNotePart === 'function') {
    try {
      converter[config.converterKey] = converter.reimportNotePart(config.partId);
      return;
    } catch (err) {
      console.warn(`[parts] reimportNotePart failed for ${config.partId}, using fallback:`, err);
    }
  }

  // Fallback: structural extraction without full PM conversion.
  // Produces entries with empty content — sufficient for cache consistency
  // until the next full re-import (e.g., on document reload).
  const notes = getNoteElements(part, config.childElementName);
  const entries: NoteEntry[] = notes.map((el) => ({
    id: String(el.attributes?.['w:id'] ?? ''),
    type: el.attributes?.['w:type'] ?? null,
    content: [],
    originalXml: structuredClone(el),
  }));

  converter[config.converterKey] = entries;
}

// ---------------------------------------------------------------------------
// Initial OOXML Structure
// ---------------------------------------------------------------------------

/**
 * Create the initial OOXML structure for a notes part.
 *
 * Includes boilerplate separator notes that Word requires in every notes
 * part. Uses Word-compatible special IDs:
 *   - separator:              w:id="-1"
 *   - continuationSeparator:  w:id="0"
 *
 * Real user-created notes start at id=1, so there is no collision.
 * This matches the convention used by Microsoft Word and by the project's
 * own roundtrip test fixtures (footnotes-roundtrip.test.js).
 *
 * Used by:
 * - The descriptor's `ensurePart` hook (part-registry path)
 * - `bootstrapNotesPart` (direct convertedXml seeding for bundled environments)
 */
function createInitialNotesPart(config: NotePartConfig): unknown {
  return {
    declaration: {
      attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' },
    },
    elements: [
      {
        type: 'element',
        name: config.rootElementName,
        attributes: { ...NOTES_XMLNS },
        elements: [
          // Separator note (id=-1) — Word requires this
          {
            type: 'element',
            name: config.childElementName,
            attributes: { 'w:type': 'separator', 'w:id': '-1' },
            elements: [
              {
                type: 'element',
                name: 'w:p',
                elements: [
                  {
                    type: 'element',
                    name: 'w:r',
                    elements: [{ type: 'element', name: 'w:separator', elements: [] }],
                  },
                ],
              },
            ],
          },
          // Continuation separator note (id=0) — Word requires this
          {
            type: 'element',
            name: config.childElementName,
            attributes: { 'w:type': 'continuationSeparator', 'w:id': '0' },
            elements: [
              {
                type: 'element',
                name: 'w:p',
                elements: [
                  {
                    type: 'element',
                    name: 'w:r',
                    elements: [{ type: 'element', name: 'w:continuationSeparator', elements: [] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Descriptor Factory
// ---------------------------------------------------------------------------

function createNotePartDescriptor(config: NotePartConfig): PartDescriptor {
  return {
    id: config.partId,

    ensurePart() {
      return createInitialNotesPart(config);
    },

    normalizePart(part: unknown) {
      const root = getRootElement(part);
      if (!root?.elements) return;

      // Sort: separator types first (by id), then regular notes (by id).
      // This matches Word's canonical ordering.
      root.elements.sort((a, b) => {
        const aType = a.attributes?.['w:type'];
        const bType = b.attributes?.['w:type'];
        const aIsSpecial = aType === 'separator' || aType === 'continuationSeparator';
        const bIsSpecial = bType === 'separator' || bType === 'continuationSeparator';

        if (aIsSpecial !== bIsSpecial) return aIsSpecial ? -1 : 1;

        const aId = Number(a.attributes?.['w:id'] ?? 0);
        const bId = Number(b.attributes?.['w:id'] ?? 0);
        return aId - bId;
      });
    },

    afterCommit({ editor, part, source }) {
      rebuildDerivedCache(editor, config, part);
      clearPartCacheStale(editor, config.partId);

      editor.emit('notes-part-changed', { partId: config.partId, source });
    },
  };
}

// ---------------------------------------------------------------------------
// Exported Descriptors
// ---------------------------------------------------------------------------

export const footnotesPartDescriptor: PartDescriptor = createNotePartDescriptor(FOOTNOTES_CONFIG);
export const endnotesPartDescriptor: PartDescriptor = createNotePartDescriptor(ENDNOTES_CONFIG);

// ---------------------------------------------------------------------------
// Config Helpers (re-exported for footnote-wrappers)
// ---------------------------------------------------------------------------

export function getNotesConfig(type: 'footnote' | 'endnote'): NotePartConfig {
  return type === 'endnote' ? ENDNOTES_CONFIG : FOOTNOTES_CONFIG;
}

/**
 * Ensure the notes OOXML part exists in `convertedXml`.
 *
 * Directly seeds the converter's store when the part is missing, so the
 * subsequent `mutatePart` call finds it without relying on the descriptor
 * registry's `ensurePart` hook. This is a safety net for bundled environments
 * (e.g., bun build) where module duplication can cause the registry lookup
 * to miss the registered descriptor.
 *
 * No-op when the part already exists.
 */
export function bootstrapNotesPart(editor: Editor, type: 'footnote' | 'endnote'): void {
  const converter = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter;
  if (!converter?.convertedXml) return;

  const config = getNotesConfig(type);
  if (converter.convertedXml[config.partId] !== undefined) return;

  converter.convertedXml[config.partId] = createInitialNotesPart(config);
}
