/**
 * SD-3400: `editor.can().insertFootnote()` and
 * `editor.can().deleteSelectedNoteMarker()` must be side-effect free.
 *
 * Both command shims delegate to self-dispatching orchestrators (document
 * API compound mutations), so without a dispatch-gate a can() probe would
 * perform the REAL insert/delete. Real editor, real fixture, no mocks.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'fs';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { Editor } from '@core/Editor.js';
import { initTestEditor } from '../../tests/helpers/helpers.js';

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

describe('footnote command can() probes are side-effect free (SD-3400)', () => {
  let editor;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const setup = async () => {
    const buffer = await fs.readFile(FIXTURE);
    const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, isHeadless: true }));
  };

  it('can().insertFootnote() reports eligibility without inserting', async () => {
    await setup();
    const refCountBefore = editor.state.doc.toJSON();
    const storeBefore = editor.converter.footnotes.length;

    const allowed = editor.can().insertFootnote();

    expect(allowed).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(refCountBefore);
    expect(editor.converter.footnotes.length).toBe(storeBefore);
  });

  it('can().deleteSelectedNoteMarker() reports without deleting the staged marker', async () => {
    await setup();
    const marker = findFirstMarker(editor.state.doc);
    expect(marker).toBeTruthy();
    editor.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, marker.pos)));

    const docBefore = editor.state.doc.toJSON();
    const storeBefore = editor.converter.footnotes.length;

    const allowed = editor.can().deleteSelectedNoteMarker();

    expect(allowed).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(docBefore);
    expect(editor.converter.footnotes.length).toBe(storeBefore);
  });

  it('can().deleteSelectedNoteMarker() is false without a staged marker selection', async () => {
    await setup();
    editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)));

    expect(editor.can().deleteSelectedNoteMarker()).toBe(false);
  });
});
