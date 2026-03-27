/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import { findAllCaptions } from './caption-resolver.js';
import type { Editor } from '../../core/Editor.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

describe('caption resolver', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('detects caption paragraphs by paragraphProperties.styleId', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const captionParagraph = editor.schema.nodes.paragraph.create(
      {
        sdBlockId: 'caption-style-only',
        paragraphProperties: { styleId: 'Caption' },
      },
      editor.schema.text('Style-only caption paragraph'),
    );

    editor.dispatch(editor.state.tr.insert(editor.state.doc.content.size, captionParagraph));

    const captions = findAllCaptions(editor.state.doc);
    const styleCaption = captions.find((caption) => caption.nodeId === 'caption-style-only');

    expect(styleCaption).toBeTruthy();
    expect(styleCaption?.instruction).toBe('');
    expect(styleCaption?.label).toBe('');
  });

  it('still detects caption paragraphs by SEQ field fallback', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sequenceField = editor.schema.nodes.sequenceField.create({
      instruction: 'SEQ Figure \\* ARABIC',
      identifier: 'Figure',
      format: 'ARABIC',
      resolvedNumber: '',
      marksAsAttrs: [],
      sdBlockId: 'seq-caption-node',
    });

    const captionParagraph = editor.schema.nodes.paragraph.create(
      {
        sdBlockId: 'caption-seq-only',
      },
      [sequenceField, editor.schema.text(': Caption with seq only')],
    );

    editor.dispatch(editor.state.tr.insert(editor.state.doc.content.size, captionParagraph));

    const captions = findAllCaptions(editor.state.doc);
    const seqCaption = captions.find((caption) => caption.nodeId === 'caption-seq-only');

    expect(seqCaption).toBeTruthy();
    expect(seqCaption?.instruction).toBe('SEQ Figure \\* ARABIC');
    expect(seqCaption?.label).toBe('Figure');
  });
});
