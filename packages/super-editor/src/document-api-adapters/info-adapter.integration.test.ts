/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';
import { infoAdapter } from './info-adapter.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

let blankDocData: LoadedDocData;
let editor: Editor | undefined;

beforeAll(async () => {
  blankDocData = await loadTestDataForEditorTests('blank-doc.docx');
});

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function createBlankEditor(): Editor {
  const result = initTestEditor({
    content: blankDocData.docx,
    media: blankDocData.media,
    mediaFiles: blankDocData.mediaFiles,
    fonts: blankDocData.fonts,
    useImmediateSetTimeout: false,
  });
  editor = result.editor;
  return editor;
}

describe('infoAdapter integration', () => {
  it('returns correct counts for a blank document', () => {
    const ed = createBlankEditor();
    const result = infoAdapter(ed, {});

    expect(result.counts).toEqual({
      words: 0,
      characters: 0,
      paragraphs: 1,
      headings: 0,
      tables: 0,
      images: 0,
      comments: 0,
      trackedChanges: 0,
      sdtFields: 0,
      lists: 0,
    });
  });

  it('characters matches the Document API text projection length', () => {
    const ed = createBlankEditor();
    const doc = ed.state.doc;
    const textProjection = doc.textBetween(0, doc.content.size, '\n', '\n');
    const result = infoAdapter(ed, {});

    expect(result.counts.characters).toBe(textProjection.length);
  });
});
