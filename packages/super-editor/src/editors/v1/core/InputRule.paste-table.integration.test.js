import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { handleClipboardPaste, handleHtmlPaste } from './InputRule.js';
import { initTestEditor, loadTestDataForEditorTests } from '../tests/helpers/helpers.js';

let docData;
let editor;

beforeAll(async () => {
  docData = await loadTestDataForEditorTests('blank-doc.docx');
});

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('handleHtmlPaste table import defaults', () => {
  it('defaults pasted HTML tables to 100% width', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      mode: 'docx',
    }));

    const handled = handleHtmlPaste(
      '<table><tbody><tr><td>Query</td><td>Assessment</td></tr><tr><td>A</td><td>B</td></tr></tbody></table>',
      editor,
    );

    expect(handled).toBe(true);

    const tableNode = (editor.getJSON().content || []).find((node) => node.type === 'table');
    expect(tableNode).toBeTruthy();
    expect(tableNode?.attrs?.tableProperties?.tableWidth).toEqual({
      value: 5000,
      type: 'pct',
    });
  });

  it('defaults Google Docs HTML tables to 100% width', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      mode: 'docx',
    }));

    const handled = handleClipboardPaste(
      { editor, view: editor.view },
      '<div docs-internal-guid-test><table><tbody><tr><td>Query</td><td>Assessment</td></tr><tr><td>A</td><td>B</td></tr></tbody></table></div>',
    );

    expect(handled).toBe(true);

    const tableNode = (editor.getJSON().content || []).find((node) => node.type === 'table');
    expect(tableNode).toBeTruthy();
    expect(tableNode?.attrs?.tableProperties?.tableWidth).toEqual({
      value: 5000,
      type: 'pct',
    });
  });

  it('merges fragmented pasted HTML tables into a single editable table', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      mode: 'docx',
    }));

    const fragmentedHtml = `
      <table><tbody><tr><th>Name</th><th>Role</th><th>Department</th><th>Start Date</th></tr></tbody></table>
      <table><tbody><tr><td>Alice Kim</td><td>Manager</td><td>Operations</td><td>2022-03-14</td></tr></tbody></table>
      <table><tbody><tr><td>Brian Lee</td><td>Developer</td><td>Engineering</td><td>2023-01-09</td></tr></tbody></table>
      <table><tbody><tr><td>Carla Gomez</td><td>Designer</td><td>Product</td><td>2021-11-22</td></tr></tbody></table>
      <table><tbody><tr><td>David Chen</td><td>Analyst</td><td>Finance</td><td>2024-06-03</td></tr></tbody></table>
    `;

    const handled = handleHtmlPaste(fragmentedHtml, editor);
    expect(handled).toBe(true);

    const tables = (editor.getJSON().content || []).filter((node) => node.type === 'table');
    expect(tables).toHaveLength(1);
    expect(tables[0]?.content).toHaveLength(5);
  });
});
