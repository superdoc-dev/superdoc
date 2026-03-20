import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { Doc as YDoc } from 'yjs';
import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import * as processModule from './processUploadedImage.js';
import {
  checkAndProcessImage,
  replaceSelectionWithImagePlaceholder,
  uploadAndInsertImage,
} from './startImageUpload.js';
import { findPlaceholder, removeImagePlaceholder } from './imageRegistrationPlugin.js';
import * as relsMutationModule from '@core/parts/adapters/relationships-mutation.js';

const originalAlert = window.alert;

describe('checkAndProcessImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.alert = vi.fn();
  });

  afterEach(() => {
    window.alert = originalAlert;
  });

  it('returns empty result when file is larger than 5MB', async () => {
    const bytes = new Uint8Array(6 * 1024 * 1024);
    const file = new File([bytes], 'large.png', { type: 'image/png' });

    const spy = vi.spyOn(processModule, 'processUploadedImage');

    const result = await checkAndProcessImage({
      getMaxContentSize: () => ({ width: 800, height: 600 }),
      file,
    });

    expect(window.alert).toHaveBeenCalledWith('Image size must be less than 5MB');
    expect(result).toEqual({ file: null, size: { width: 0, height: 0 } });
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns processed image data when resizing succeeds', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'small.png', { type: 'image/png' });
    const processedFile = new File([new Uint8Array([4, 5, 6])], 'processed.png', { type: 'image/png' });

    vi.spyOn(processModule, 'processUploadedImage').mockResolvedValue({
      file: processedFile,
      width: 123,
      height: 456,
    });

    const result = await checkAndProcessImage({
      getMaxContentSize: () => ({ width: 1024, height: 768 }),
      file,
    });

    expect(result).toEqual({
      file: processedFile,
      size: { width: 123, height: 456 },
    });
  });

  it('returns empty result when resizing throws', async () => {
    const file = new File([new Uint8Array([7, 8, 9])], 'error.png', { type: 'image/png' });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.spyOn(processModule, 'processUploadedImage').mockRejectedValue(new Error('processing failed'));

    const result = await checkAndProcessImage({
      getMaxContentSize: () => ({ width: 1024, height: 768 }),
      file,
    });

    expect(consoleSpy).toHaveBeenCalledWith('Error processing image:', expect.any(Error));
    expect(result).toEqual({ file: null, size: { width: 0, height: 0 } });

    consoleSpy.mockRestore();
  });
});

describe('image upload helpers integration', () => {
  const filename = 'blank-doc.docx';
  let docx, media, mediaFiles, fonts, editor;

  const createTestFile = (name = 'test.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename)));

  beforeEach(() => {
    const ydoc = new YDoc();
    ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts, ydoc }));
  });

  it('respects lastSelection when in header or footer', () => {
    const id = {};
    const originalOptions = { ...editor.options };
    const headerSelection = TextSelection.create(editor.state.doc, 0, 0);
    editor.options.isHeaderOrFooter = true;
    editor.options.lastSelection = headerSelection;

    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id,
    });

    expect(findPlaceholder(editor.view.state, id)).toBe(headerSelection.from);

    const cleanupTr = removeImagePlaceholder(editor.view.state, editor.view.state.tr, id);
    editor.view.dispatch(cleanupTr);

    editor.options.isHeaderOrFooter = originalOptions.isHeaderOrFooter;
    editor.options.lastSelection = originalOptions.lastSelection;
  });

  it('deletes the current selection before inserting a placeholder', () => {
    editor.commands.insertContentAt(0, 'abc');
    const id = {};

    editor.commands.selectAll();

    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id,
    });

    const remainingText = editor.view.state.doc.textBetween(0, editor.view.state.doc.content.size, '\n', '\n');
    expect(remainingText).toBe('');

    const cleanupTr = removeImagePlaceholder(editor.view.state, editor.view.state.tr, id);
    editor.view.dispatch(cleanupTr);
  });

  it('returns early if the placeholder cannot be found', async () => {
    const placeholderId = {};
    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id: placeholderId,
    });

    const uploadStub = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    editor.options.handleImageUpload = uploadStub;

    const missingId = {};
    await uploadAndInsertImage({
      editor,
      view: editor.view,
      file: createTestFile('missing.png'),
      size: { width: 10, height: 10 },
      id: missingId,
    });

    expect(uploadStub).toHaveBeenCalledTimes(1);
    expect(findPlaceholder(editor.view.state, missingId)).toBeNull();

    let imageCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') {
        imageCount += 1;
      }
    });
    expect(imageCount).toBe(0);

    const cleanupTr = removeImagePlaceholder(editor.view.state, editor.view.state.tr, placeholderId);
    editor.view.dispatch(cleanupTr);
  });

  it('handles collaboration uploads without throwing when ydoc is present', async () => {
    const id = {};
    editor.options.handleImageUpload = vi.fn().mockResolvedValue('data:image/png;base64,BBB');

    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id,
    });

    await expect(
      uploadAndInsertImage({
        editor,
        view: editor.view,
        file: createTestFile('collab.png'),
        size: { width: 20, height: 20 },
        id,
      }),
    ).resolves.not.toThrow();
  });

  it('continues gracefully when relationship insertion fails', async () => {
    const id = {};
    editor.options.mode = 'docx';
    editor.options.handleImageUpload = vi.fn().mockResolvedValue('data:image/png;base64,CCC');

    const relSpy = vi.spyOn(relsMutationModule, 'findOrCreateRelationship').mockReturnValue(null);

    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id,
    });

    await uploadAndInsertImage({
      editor,
      view: editor.view,
      file: createTestFile('relationship.png'),
      size: { width: 30, height: 30 },
      id,
    });

    const imageNode = editor.state.doc.firstChild.firstChild;
    expect(imageNode.attrs.rId).toBeNull();

    relSpy.mockRestore();
  });

  it('sanitizes filenames with special whitespace and avoids collisions', async () => {
    const weirdName = 'Screenshot_2025-09-22 at 3.45.41\u202fPM.png';
    const uploadStub = vi.fn().mockResolvedValue('data:image/png;base64,DDD');
    editor.options.handleImageUpload = uploadStub;

    const firstId = {};
    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id: firstId,
    });

    await uploadAndInsertImage({
      editor,
      view: editor.view,
      file: createTestFile(weirdName),
      size: { width: 40, height: 40 },
      id: firstId,
    });

    const endPos = editor.state.doc.content.size;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, endPos))); // place cursor after first image

    const secondId = {};
    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id: secondId,
    });

    await uploadAndInsertImage({
      editor,
      view: editor.view,
      file: createTestFile(weirdName),
      size: { width: 50, height: 50 },
      id: secondId,
    });

    const mediaKeys = Object.keys(editor.storage.image.media).sort();
    expect(mediaKeys).toEqual([
      'word/media/Screenshot_2025-09-22_at_3.45.41_PM-1.png',
      'word/media/Screenshot_2025-09-22_at_3.45.41_PM.png',
    ]);

    const imageSources = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') {
        imageSources.push(node.attrs.src);
      }
    });

    expect(imageSources.sort()).toEqual([
      'word/media/Screenshot_2025-09-22_at_3.45.41_PM-1.png',
      'word/media/Screenshot_2025-09-22_at_3.45.41_PM.png',
    ]);

    expect(uploadStub).toHaveBeenCalledTimes(2);
    uploadStub.mockRestore();
  });
});
