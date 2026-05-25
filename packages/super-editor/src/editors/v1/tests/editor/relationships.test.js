import { loadTestDataForEditorTests, initTestEditor } from '@tests/helpers/helpers.js';
import { expect } from 'vitest';
import { getDocumentRelationshipElements } from '@core/super-converter/docx-helpers/document-rels.js';
import {
  uploadAndInsertImage,
  replaceSelectionWithImagePlaceholder,
} from '@extensions/image/imageHelpers/startImageUpload.js';
import { findPlaceholder } from '@extensions/image/imageHelpers/imageRegistrationPlugin.js';
import { handlePlainTextUrlPaste } from '@core/inputRules/paste-link-normalizer.js';
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

  it.each(['Hyperlink', 'FollowedHyperlink'])(
    'clears transient textStyle and runProperties styleId "%s" when unsetting a link',
    (styleId) => {
      editor.commands.insertContent('link');
      editor.commands.selectAll();
      editor.commands.setLink({ href: 'https://www.superdoc.dev' });
      editor.commands.setMark('textStyle', { styleId });
      editor.commands.command(({ tr, dispatch }) => {
        const runNodesToPatch = [];

        tr.doc.descendants((node, pos) => {
          if (node.type.name !== 'run') return;

          runNodesToPatch.push({ node, pos });
        });

        runNodesToPatch
          .sort((a, b) => b.pos - a.pos)
          .forEach(({ node, pos }) => {
            tr.setNodeMarkup(
              pos,
              node.type,
              {
                ...node.attrs,
                runProperties: { ...node.attrs.runProperties, styleId },
              },
              node.marks,
            );
          });

        dispatch(tr);
        return true;
      });

      editor.commands.unsetLink();

      const textStyleMarks = [];
      const runNodes = [];
      editor.state.doc.descendants((node) => {
        if (!node.isText) return;
        node.marks.forEach((mark) => {
          if (mark.type.name === 'textStyle') {
            textStyleMarks.push(mark);
          }
        });
      });
      editor.state.doc.descendants((node) => {
        if (node.type.name !== 'run') return;
        runNodes.push(node);
      });

      expect(textStyleMarks.length).toBeGreaterThan(0);
      textStyleMarks.forEach((mark) => {
        expect(mark.attrs.styleId).toBeNull();
      });
      expect(runNodes.length).toBeGreaterThan(0);
      runNodes.forEach((runNode) => {
        expect(runNode.attrs.runProperties?.styleId).toBeNull();
      });
    },
  );

  it('preserves pre-existing underline after unsetLink', () => {
    editor.commands.insertContent('link');
    editor.commands.selectAll();
    editor.commands.setUnderline();
    editor.commands.setLink({ href: 'https://www.superdoc.dev' });
    editor.commands.unsetLink();

    let hasUnderline = false;
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.marks.some((mark) => mark.type.name === 'underline')) {
        hasUnderline = true;
      }
    });

    expect(hasUnderline).toBe(true);
  });

  it('removes underline on unsetLink when underline was not pre-existing', () => {
    editor.commands.insertContent('link');
    editor.commands.selectAll();
    editor.commands.setLink({ href: 'https://www.superdoc.dev' });
    editor.commands.unsetLink();

    let hasUnderline = false;
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.marks.some((mark) => mark.type.name === 'underline')) {
        hasUnderline = true;
      }
    });

    expect(hasUnderline).toBe(false);
  });

  // PR-3209 regression tests for fixes.
  it('preserves non-Hyperlink styleId on linked text after unlinking', () => {
    editor.commands.insertContent('emphasized');
    editor.commands.selectAll();
    editor.commands.setMark('textStyle', { styleId: 'Emphasis' });
    editor.commands.setLink({ href: 'https://www.superdoc.dev' });
    editor.commands.unsetLink();

    const styleIds = [];
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      node.marks.forEach((mark) => {
        if (mark.type.name === 'textStyle') styleIds.push(mark.attrs?.styleId ?? null);
      });
    });
    expect(styleIds).toContain('Emphasis');
  });

  it('renders link with underline even when underlying text has explicit underlineType=none', () => {
    const underlineMarkType = editor.schema.marks.underline;
    editor.commands.insertContent('mute');
    editor.commands.selectAll();

    editor.commands.command(({ tr, dispatch }) => {
      const { from, to } = editor.state.selection;
      tr.addMark(from, to, underlineMarkType.create({ underlineType: 'none' }));
      dispatch(tr);
      return true;
    });

    editor.commands.setLink({ href: 'https://www.superdoc.dev' });

    let visibleUnderline = null;
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      node.marks.forEach((mark) => {
        if (mark.type.name !== 'underline') return;
        if (mark.attrs?.underlineType !== 'none') visibleUnderline = mark;
      });
    });
    expect(visibleUnderline).not.toBeNull();
  });

  it('keeps imported inline underline mark when removing link', async () => {
    const imported = await loadTestDataForEditorTests('hyperlink_node.docx');
    const { editor: importedEditor } = initTestEditor({
      content: imported.docx,
      media: imported.media,
      mediaFiles: imported.mediaFiles,
      fonts: imported.fonts,
    });

    importedEditor.commands.selectAll();

    let importedUnderlineBefore = 0;
    let linkCountBefore = 0;
    importedEditor.state.doc.descendants((node) => {
      if (!node.isText) return;
      node.marks.forEach((mark) => {
        if (mark.type.name === 'underline' && mark.attrs?.autoAdded !== true) importedUnderlineBefore += 1;
        if (mark.type.name === 'link') linkCountBefore += 1;
      });
    });

    expect(linkCountBefore).toBeGreaterThan(0);
    expect(importedUnderlineBefore).toBeGreaterThan(0);

    importedEditor.commands.unsetLink();

    let importedUnderlineAfter = 0;
    let linkCountAfter = 0;
    importedEditor.state.doc.descendants((node) => {
      if (!node.isText) return;
      node.marks.forEach((mark) => {
        if (mark.type.name === 'underline' && mark.attrs?.autoAdded !== true) importedUnderlineAfter += 1;
        if (mark.type.name === 'link') linkCountAfter += 1;
      });
    });

    expect(linkCountAfter).toBe(0);
    expect(importedUnderlineAfter).toBeGreaterThan(0);
  });

  it('does not throw when setLink replaces the selection with longer text', () => {
    editor.commands.insertContent('hi');
    editor.commands.selectAll();
    expect(() => {
      editor.commands.setLink({
        href: 'https://www.superdoc.dev',
        text: 'this is a much longer replacement text',
      });
    }).not.toThrow();
  });

  it('removes link-added underline only from segments without pre-existing underline', () => {
    editor.commands.insertContent('abcdef');

    let textStart = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text && node.text.includes('abcdef')) {
        textStart = pos;
      }
    });

    editor.commands.setTextSelection({ from: textStart, to: textStart + 3 });
    editor.commands.setUnderline();
    editor.commands.setTextSelection({ from: textStart, to: textStart + 6 });
    editor.commands.setLink({ href: 'https://www.superdoc.dev' });
    editor.commands.unsetLink();

    const charUnderline = {};
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      const hasUnderline = node.marks.some((m) => m.type.name === 'underline');
      for (const ch of node.text || '') charUnderline[ch] = hasUnderline;
    });

    expect(charUnderline.a).toBe(true);
    expect(charUnderline.b).toBe(true);
    expect(charUnderline.c).toBe(true);
    expect(charUnderline.d).toBe(false);
    expect(charUnderline.e).toBe(false);
    expect(charUnderline.f).toBe(false);
  });

  it('removes link-added underline after editing the link URL and unlinking', () => {
    editor.commands.insertContent('hi');
    editor.commands.selectAll();
    editor.commands.setLink({ href: 'https://first.example.com' });
    editor.commands.selectAll();
    editor.commands.setLink({ href: 'https://second.example.com' });
    editor.commands.unsetLink();

    let hasUnderline = false;
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.marks.some((m) => m.type.name === 'underline')) hasUnderline = true;
    });
    expect(hasUnderline).toBe(false);
  });

  it('removes paste-added underline when removing a pasted URL link', () => {
    editor.commands.setTextSelection({ from: 1, to: 1 });
    const url = 'https://www.superdoc.dev';
    handlePlainTextUrlPaste(editor, editor.view, url, { href: url });

    let linkedAndUnderlined = false;
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      const hasLink = node.marks.some((m) => m.type.name === 'link');
      const hasUnderline = node.marks.some((m) => m.type.name === 'underline');
      if (hasLink && hasUnderline) linkedAndUnderlined = true;
    });
    expect(linkedAndUnderlined).toBe(true);

    editor.commands.selectAll();
    editor.commands.unsetLink();

    let stuckUnderline = false;
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      if (node.marks.some((m) => m.type.name === 'underline')) stuckUnderline = true;
    });
    expect(stuckUnderline).toBe(false);
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
