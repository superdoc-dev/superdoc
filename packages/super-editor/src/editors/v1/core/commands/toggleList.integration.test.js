import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { initTestEditor, loadTestDataForEditorTests } from '../../tests/helpers/helpers.js';

describe('toggleList integration', () => {
  let docx;
  let media;
  let mediaFiles;
  let fonts;
  let editor;

  beforeAll(async () => {
    ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests('blank-doc.docx'));
  });

  beforeEach(() => {
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts }));
  });

  it('keeps a collapsed caret after toggling a single paragraph into an ordered list', () => {
    editor.commands.insertContent('First item');
    editor.commands.toggleOrderedList();

    const { selection, doc } = editor.state;
    const selectedText = doc.textBetween(selection.from, selection.to, '\n');

    expect(selection.empty).toBe(true);
    expect(selectedText).toBe('');
  });
});
