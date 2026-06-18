/**
 * SD-3400: undo after a footnote delete must restore the note TEXT, not just
 * the marker. The fix tombstones the w:footnote element (only the PM marker
 * delete is history-recorded), so a single undo brings the whole note back;
 * export prunes session-managed ids that have no surviving reference.
 *
 * Real pipeline: basic-footnotes.docx through Editor.loadXmlData, real
 * prosemirror-history, real exportDocx, no parts-system mocks.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { undo, redo } from 'prosemirror-history';
import { Editor } from '@core/Editor.js';
import DocxZipper from '@core/DocxZipper.js';
import { parseXmlToJson } from '@converter/v2/docxHelper.js';
import { initTestEditor } from '../../tests/helpers/helpers.js';
import {
  removeNoteReferenceAt,
  removeNoteEverywhere,
} from '../../document-api-adapters/plan-engine/footnote-wrappers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../tests/data/basic-footnotes.docx');

const findFirstMarker = (doc) => {
  let found = null;
  doc.descendants((node, pos) => {
    if (!found && node.type.name === 'footnoteReference') {
      found = { pos, noteId: String(node.attrs.id) };
      return false;
    }
    return true;
  });
  return found;
};

const markerCount = (doc, noteId) => {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'footnoteReference' && String(node.attrs.id) === noteId) count += 1;
    return true;
  });
  return count;
};

const storeIds = (editor) => editor.converter.footnotes.map((f) => String(f.id));

const exportedFootnoteIds = async (editor) => {
  const buffer = await editor.exportDocx({ isFinalDoc: false });
  const files = await new DocxZipper().getDocxData(buffer, true);
  const xml = parseXmlToJson(files.find((f) => f.name === 'word/footnotes.xml').content);
  const root = xml.elements.find((el) => el.name === 'w:footnotes') ?? xml.elements[0];
  return {
    noteIds: root.elements
      .filter((el) => el.name === 'w:footnote' && !el.attributes?.['w:type'])
      .map((el) => String(el.attributes['w:id'])),
    documentXml: files.find((f) => f.name === 'word/document.xml').content,
  };
};

describe('undo after footnote delete (SD-3400 tombstones, real pipeline)', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const setup = async () => {
    const buffer = await fs.readFile(FIXTURE);
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true }));
    const marker = findFirstMarker(editor.state.doc);
    expect(marker).toBeTruthy();
    return marker;
  };

  it('restores the marker AND keeps the note content resolvable across delete-undo-redo cycles', async () => {
    const marker = await setup();
    expect(storeIds(editor)).toContain(marker.noteId);

    const removed = removeNoteReferenceAt(editor, { pos: marker.pos, noteId: marker.noteId, type: 'footnote' });
    expect(removed).toBe(true);
    expect(markerCount(editor.state.doc, marker.noteId)).toBe(0);
    // Tombstone: the derived cache still resolves the note content, so an
    // undo-restored marker immediately paints its band entry again.
    expect(storeIds(editor)).toContain(marker.noteId);
    expect(editor.converter.sessionManagedNoteIds.footnotes.has(marker.noteId)).toBe(true);

    undo(editor.state, (tr) => editor.dispatch(tr));
    expect(markerCount(editor.state.doc, marker.noteId)).toBe(1);
    expect(storeIds(editor)).toContain(marker.noteId);

    redo(editor.state, (tr) => editor.dispatch(tr));
    expect(markerCount(editor.state.doc, marker.noteId)).toBe(0);
    expect(storeIds(editor)).toContain(marker.noteId);

    undo(editor.state, (tr) => editor.dispatch(tr));
    expect(markerCount(editor.state.doc, marker.noteId)).toBe(1);
    expect(storeIds(editor)).toContain(marker.noteId);
  });

  it('removeNoteEverywhere parks the caret at the former first-marker position (SD-3400 boundary)', async () => {
    const marker = await setup();

    const result = removeNoteEverywhere(editor, { noteId: marker.noteId, type: 'footnote' });

    expect(result.success).toBe(true);
    // Parked: the selection sits where the first marker stood, not wherever
    // the pre-session body selection was. Continued deletion is then governed
    // by the boundary guard, and a deliberate edit acts at the marker site.
    const { from, to } = editor.state.selection;
    expect(from).toBe(to);
    expect(Math.abs(from - marker.pos)).toBeLessThanOrEqual(1);
  });

  it('export prunes the note while deleted and keeps it after undo (no dangling reference either way)', async () => {
    const marker = await setup();

    removeNoteReferenceAt(editor, { pos: marker.pos, noteId: marker.noteId, type: 'footnote' });
    const whileDeleted = await exportedFootnoteIds(editor);
    expect(whileDeleted.noteIds).not.toContain(marker.noteId);
    expect(whileDeleted.documentXml).not.toContain(`w:footnoteReference w:id="${marker.noteId}"`);

    undo(editor.state, (tr) => editor.dispatch(tr));
    const afterUndo = await exportedFootnoteIds(editor);
    expect(afterUndo.noteIds).toContain(marker.noteId);
    expect(afterUndo.documentXml).toContain('w:footnoteReference');
  });

  it('exportDocx never destroys the tombstone in the live part store (undo-after-save survives)', async () => {
    const marker = await setup();

    removeNoteReferenceAt(editor, { pos: marker.pos, noteId: marker.noteId, type: 'footnote' });
    await editor.exportDocx({ isFinalDoc: false });

    // Pruning is a zip-time transform: the live part store and the derived
    // cache must both still hold the tombstoned element, otherwise the next
    // notes-part mutation rebuilds the cache without it and undo-after-save
    // silently loses the note (and exports a dangling reference).
    const partRoot = editor.converter.convertedXml['word/footnotes.xml'].elements[0];
    const storedIds = partRoot.elements
      .filter((el) => el.name === 'w:footnote' && !el.attributes?.['w:type'])
      .map((el) => String(el.attributes['w:id']));
    expect(storedIds).toContain(marker.noteId);
    expect(storeIds(editor)).toContain(marker.noteId);

    // The full failure sequence: save, undo, then export again.
    undo(editor.state, (tr) => editor.dispatch(tr));
    const afterUndo = await exportedFootnoteIds(editor);
    expect(afterUndo.noteIds).toContain(marker.noteId);
  });
});
