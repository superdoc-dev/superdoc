import { describe, it, expect } from 'vitest';
import { Editor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import { getTestDataAsBuffer } from '@tests/export/export-helpers/export-helpers.js';
import { StructuralTrackChanges, computeStructuralDiff } from './structural-track-changes.js';
import { enumerateStructuralRowChanges } from '../track-changes/trackChangesHelpers/structuralRowChanges.js';

const editorFromFixture = async (name, user) => {
  const buffer = await getTestDataAsBuffer(`diffing/${name}`);
  const [docx, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);
  return new Editor({
    isHeadless: true,
    extensions: [...getStarterExtensions(), StructuralTrackChanges],
    documentId: `test-${name}`,
    content: docx,
    mode: 'docx',
    media,
    mediaFiles,
    fonts,
    annotations: true,
    user,
  });
};

describe('StructuralTrackChanges — end-to-end with real docx fixtures', () => {
  it('compute → set → accept-all on a table-removal pair removes the table from the doc', async () => {
    const testUser = { name: 'Tester', email: 'test@example.com' };
    const baseEditor = await editorFromFixture('diff_before_table_remove.docx', testUser);
    const afterEditor = await editorFromFixture('diff_after_table_remove.docx');
    try {
      const hunks = computeStructuralDiff(baseEditor.state.doc, afterEditor.state.doc);
      expect(hunks.length).toBeGreaterThan(0);
      expect(baseEditor.commands.setStructuralDiff(hunks)).toBe(true);
      expect(enumerateStructuralRowChanges(baseEditor.state).length).toBeGreaterThan(0);
      expect(baseEditor.commands.acceptAllTrackedChanges()).toBe(true);
      expect(enumerateStructuralRowChanges(baseEditor.state).length).toBe(0);
      let hasTable = false;
      baseEditor.state.doc.descendants((n) => {
        if (n.type.name === 'table') hasTable = true;
      });
      expect(hasTable).toBe(false);
    } finally {
      baseEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });

  it('compute → set → reject-all on a table-removal pair restores the base shape', async () => {
    const testUser = { name: 'Tester', email: 'test@example.com' };
    const baseEditor = await editorFromFixture('diff_before_table_remove.docx', testUser);
    const afterEditor = await editorFromFixture('diff_after_table_remove.docx');
    try {
      const beforeText = baseEditor.state.doc.textContent;
      const hunks = computeStructuralDiff(baseEditor.state.doc, afterEditor.state.doc);
      baseEditor.commands.setStructuralDiff(hunks);
      baseEditor.commands.rejectAllTrackedChanges();
      expect(enumerateStructuralRowChanges(baseEditor.state).length).toBe(0);
      let hasTable = false;
      baseEditor.state.doc.descendants((n) => {
        if (n.type.name === 'table') hasTable = true;
      });
      expect(hasTable).toBe(true);
      expect(baseEditor.state.doc.textContent).toBe(beforeText);
    } finally {
      baseEditor.destroy?.();
      afterEditor.destroy?.();
    }
  });
});
