/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { Editor } from '../../core/Editor.js';
import { initTestEditor, loadTestDataForEditorTests } from '../../tests/helpers/helpers.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

function openEditor(docData: LoadedDocData) {
  return initTestEditor({
    content: docData.docx,
    media: docData.media,
    mediaFiles: docData.mediaFiles,
    fonts: docData.fonts,
    useImmediateSetTimeout: false,
    isHeadless: true,
    user: { name: 'Test', email: 'test@example.com' },
  }).editor;
}

async function reopenEditor(editor: Editor) {
  const exported = await editor.exportDocx();
  const bytes = exported instanceof Uint8Array ? exported : new Uint8Array(exported);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(bytes, true);
  return openEditor({ docx, media, mediaFiles, fonts });
}

describe('SD-3617 nested content-control wrap persistence', () => {
  it('contentControls.wrap persists a real parent around an existing block SDT after save and reopen', async () => {
    const source = await loadTestDataForEditorTests('sdt-nested-block.docx');
    const editor = openEditor(source);
    let reopened: Editor | undefined;
    try {
      const child = editor.doc.contentControls.selectByTag({ tag: 'outer-block' }).items[0]!;
      const result = editor.doc.contentControls.wrap({
        target: child.target,
        kind: 'block',
        tag: 'sdk-parent',
        alias: 'SDK parent',
      });

      expect(result.success).toBe(true);
      if (!result.success || !result.updatedRef) {
        throw new Error('Expected contentControls.wrap to return the persisted parent reference');
      }
      expect(editor.doc.contentControls.get({ target: result.updatedRef }).properties.tag).toBe('sdk-parent');
      reopened = await reopenEditor(editor);

      const reopenedChild = reopened.doc.contentControls.selectByTag({ tag: 'outer-block' }).items[0]!;
      const reopenedParent = reopened.doc.contentControls.get({ target: result.updatedRef });

      expect(reopenedChild.id).toBe(child.id);
      expect(reopenedParent.properties.tag).toBe('sdk-parent');
      expect(reopened.doc.contentControls.getParent({ target: reopenedChild.target })?.id).toBe(reopenedParent.id);
      expect(
        reopened.doc.contentControls.listChildren({ target: reopenedParent.target }).items.map(({ id }) => id),
      ).toEqual([reopenedChild.id]);
    } finally {
      reopened?.destroy();
      editor.destroy();
    }
  });

  it('contentControls.group.wrap persists a group parent around an existing block SDT after save and reopen', async () => {
    const source = await loadTestDataForEditorTests('sdt-nested-block.docx');
    const editor = openEditor(source);
    let reopened: Editor | undefined;
    try {
      const child = editor.doc.contentControls.selectByTag({ tag: 'outer-block' }).items[0]!;
      const result = editor.doc.contentControls.group.wrap({ target: child.target });

      expect(result.success).toBe(true);
      if (!result.success || !result.updatedRef) {
        throw new Error('Expected contentControls.group.wrap to return the persisted parent reference');
      }
      expect(editor.doc.contentControls.get({ target: result.updatedRef }).controlType).toBe('group');
      reopened = await reopenEditor(editor);

      const reopenedParent = reopened.doc.contentControls.get({ target: result.updatedRef });
      const reopenedChild = reopened.doc.contentControls.selectByTag({ tag: 'outer-block' }).items[0]!;
      expect(reopenedChild.id).toBe(child.id);
      expect(reopenedParent.controlType).toBe('group');
      expect(reopenedParent.id).toBe(result.updatedRef.nodeId);
      expect(reopened.doc.contentControls.getParent({ target: reopenedChild.target })?.id).toBe(reopenedParent.id);
      expect(
        reopened.doc.contentControls.listChildren({ target: reopenedParent.target }).items.map(({ id }) => id),
      ).toEqual([reopenedChild.id]);
    } finally {
      reopened?.destroy();
      editor.destroy();
    }
  });
});
