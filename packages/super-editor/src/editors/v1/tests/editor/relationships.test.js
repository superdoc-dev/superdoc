import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { expect } from 'vitest';
import { getDocumentRelationshipElements } from '@core/super-converter/docx-helpers/document-rels.js';
import {
  uploadAndInsertImage,
  replaceSelectionWithImagePlaceholder,
} from '@extensions/image/imageHelpers/startImageUpload.js';
import { findPlaceholder } from '@extensions/image/imageHelpers/imageRegistrationPlugin.js';
import { imageBase64 } from './data/imageBase64.js';

describe('Relationships tests', () => {
  window.URL.createObjectURL = vi.fn().mockImplementation((file) => {
    return file.name;
  });

  const filename = 'blank-doc.docx';
  let docx, media, mediaFiles, fonts, editor;

  beforeAll(async () => ({ docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(filename)));
  beforeEach(() => ({ editor } = initTestEditor({ content: docx, media, mediaFiles, fonts })));

  it('tests that the inserted link has a rId and a relationship', () => {
    // Insert 'link' text
    editor.commands.insertContent('link');

    // Select all the inserted text
    editor.commands.selectAll();

    // Apply the link
    editor.commands.setLink({ href: 'https://www.superdoc.dev' });

    const linkMark = editor.state.doc.firstChild.firstChild.firstChild.marks[0];

    expect(linkMark.type.name).toBe('link');
    expect(linkMark.attrs.rId).toBeTruthy();

    const relationships = getDocumentRelationshipElements(editor);
    const found = relationships.find((i) => i.attributes.Id === linkMark.attrs.rId);

    expect(found).toBeTruthy();
    expect(found.attributes.Target).toBe('https://www.superdoc.dev');
  });

  it('tests that the uploaded image has a rId and a relationship', async () => {
    const blob = await fetch(imageBase64).then((res) => res.blob());
    const file = new File([blob], 'image.png', { type: 'image/png' });

    const id = {};

    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id,
    });

    await uploadAndInsertImage({
      editor,
      view: editor.view,
      file,
      size: { width: 100, height: 100 },
      id,
    });

    const imageNode = editor.state.doc.firstChild.firstChild;

    expect(imageNode.type.name).toBe('image');
    expect(imageNode.attrs.rId).toBeTruthy();

    const relationships = getDocumentRelationshipElements(editor);
    const found = relationships.find((i) => i.attributes.Id === imageNode.attrs.rId);

    expect(found).toBeTruthy();
    expect(found.attributes.Target).toBe('media/image.png');
  });

  it('removes the placeholder if image upload fails', async () => {
    const blob = await fetch(imageBase64).then((res) => res.blob());
    const file = new File([blob], 'failing.png', { type: 'image/png' });

    const id = {};

    replaceSelectionWithImagePlaceholder({
      view: editor.view,
      editorOptions: editor.options,
      id,
    });

    const originalHandler = editor.options.handleImageUpload;
    const failingUpload = vi.fn().mockRejectedValue(new Error('upload failed'));
    editor.options.handleImageUpload = failingUpload;

    await expect(
      uploadAndInsertImage({
        editor,
        view: editor.view,
        file,
        size: { width: 100, height: 100 },
        id,
      }),
    ).resolves.toBeUndefined();

    editor.options.handleImageUpload = originalHandler;

    expect(failingUpload).toHaveBeenCalledTimes(1);
    expect(findPlaceholder(editor.view.state, id)).toBeNull();

    let imageCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') {
        imageCount += 1;
      }
    });
    expect(imageCount).toBe(0);
  });
});
