/* @vitest-environment jsdom */

/**
 * Integration test proving that w:fldSimple NUMWORDS and NUMCHARS fields
 * import into documentStatField PM nodes (not dropped, not passthrough).
 *
 * Also verifies NUMPAGES imports as total-page-number with importedCachedText.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import type { Editor } from '../core/Editor.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

describe('document stat field import integration', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('numwords.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  function createEditor(): Editor {
    const result = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    });
    return result.editor;
  }

  /** Collect all nodes of a given type from the document. */
  function findNodesByType(ed: Editor, typeName: string): Array<{ pos: number; attrs: Record<string, unknown> }> {
    const results: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === typeName) {
        results.push({ pos, attrs: node.attrs as Record<string, unknown> });
      }
      return true;
    });
    return results;
  }

  it('imports w:fldSimple NUMWORDS as a documentStatField node', () => {
    editor = createEditor();
    const statFields = findNodesByType(editor, 'documentStatField');
    const numwordsFields = statFields.filter((f) => {
      const instruction = (f.attrs.instruction as string) ?? '';
      return instruction.trim().split(/\s+/)[0]?.toUpperCase() === 'NUMWORDS';
    });

    expect(numwordsFields).toHaveLength(1);
    expect(numwordsFields[0].attrs.resolvedText).toBe('12');
  });

  it('imports w:fldSimple NUMCHARS as a documentStatField node', () => {
    editor = createEditor();
    const statFields = findNodesByType(editor, 'documentStatField');
    const numcharsFields = statFields.filter((f) => {
      const instruction = (f.attrs.instruction as string) ?? '';
      return instruction.trim().split(/\s+/)[0]?.toUpperCase() === 'NUMCHARS';
    });

    expect(numcharsFields).toHaveLength(1);
    expect(numcharsFields[0].attrs.resolvedText).toBe('41');
  });

  it('imports w:fldSimple NUMPAGES as a total-page-number node with importedCachedText', () => {
    editor = createEditor();
    const numPagesFields = findNodesByType(editor, 'total-page-number');

    expect(numPagesFields).toHaveLength(1);
    expect(numPagesFields[0].attrs.importedCachedText).toBe('3');
  });

  it('surfaces all three field types via fields.list', () => {
    editor = createEditor();
    const listResult = editor.doc.fields.list({});
    const items = listResult?.items ?? [];
    const fieldTypes = items.map((item: any) => {
      const domain = item?.domain ?? item;
      return domain?.fieldType;
    });

    expect(fieldTypes).toContain('NUMWORDS');
    expect(fieldTypes).toContain('NUMCHARS');
    expect(fieldTypes).toContain('NUMPAGES');
  });

  it('reports the imported cached value for NUMPAGES via fields.list resolvedText', () => {
    editor = createEditor();
    const listResult = editor.doc.fields.list({});
    const items = listResult?.items ?? [];
    const numPagesItem = items.find((item: any) => {
      const domain = item?.domain ?? item;
      return domain?.fieldType === 'NUMPAGES';
    });

    const resolvedText = numPagesItem?.domain?.resolvedText ?? numPagesItem?.resolvedText ?? '';
    expect(resolvedText).toBe('3');
  });
});
