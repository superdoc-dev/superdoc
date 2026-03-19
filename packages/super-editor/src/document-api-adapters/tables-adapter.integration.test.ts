/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import { createTableAdapter, tablesSplitAdapter } from './tables-adapter.js';
import { insertStructuredWrapper } from './plan-engine/plan-wrappers.js';
import { clearExecutorRegistry } from './plan-engine/executor-registry.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

const DIRECT_MUTATION_OPTIONS = { changeMode: 'direct' } as const;

function mapExportedFiles(files: Array<{ name: string; content: string }>): Record<string, string> {
  const byName: Record<string, string> = {};
  for (const file of files) {
    byName[file.name] = file.content;
  }
  return byName;
}

async function exportDocxFiles(editor: Editor): Promise<Record<string, string>> {
  const zipper = new DocxZipper();
  const exportedBuffer = await editor.exportDocx();
  const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
  return mapExportedFiles(exportedFiles);
}

function resolveTableNodeId(result: ReturnType<typeof createTableAdapter>): string {
  if (!result.success || result.table?.kind !== 'block' || result.table.nodeType !== 'table' || !result.table.nodeId) {
    throw new Error('Expected create.table to return a table nodeId.');
  }
  return result.table.nodeId;
}

describe('tables adapter DOCX integration', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
    clearExecutorRegistry();
    registerBuiltInExecutors();
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('two consecutive create.table calls produce non-adjacent tables in DOCX', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    createTableAdapter(editor, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT_MUTATION_OPTIONS);
    createTableAdapter(editor, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT_MUTATION_OPTIONS);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];

    expect(documentXml).toBeTruthy();
    expect(documentXml).not.toMatch(/<\/w:tbl>\s*<w:tbl>/);
    expect(documentXml).toMatch(/<\/w:tbl>\s*<w:p\b[^>]*?\/?>\s*<w:tbl\b/);
  });

  it('two consecutive markdown table inserts produce non-adjacent tables in DOCX', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    insertStructuredWrapper(editor, {
      value: '| A | B |\n| --- | --- |\n| foo | bar |',
      type: 'markdown',
    });
    insertStructuredWrapper(editor, {
      value: '| C | D |\n| --- | --- |\n| baz | qux |',
      type: 'markdown',
    });

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];

    expect(documentXml).toBeTruthy();
    expect(documentXml).not.toMatch(/<\/w:tbl>\s*<w:tbl>/);
    expect(documentXml).toMatch(/<\/w:tbl>\s*<w:p\b[^>]*?\/?>\s*<w:tbl\b/);
  });

  it('exports a paragraph separator between split tables', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const createResult = createTableAdapter(
      editor,
      { rows: 3, columns: 3, at: { kind: 'documentEnd' } },
      DIRECT_MUTATION_OPTIONS,
    );
    const tableNodeId = resolveTableNodeId(createResult);

    const splitResult = tablesSplitAdapter(editor, { nodeId: tableNodeId, atRowIndex: 1 }, DIRECT_MUTATION_OPTIONS);
    expect(splitResult.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];

    expect(documentXml).toBeTruthy();
    expect(documentXml).not.toMatch(/<\/w:tbl>\s*<w:tbl>/);
    expect(documentXml).toMatch(/<\/w:tbl>\s*<w:p\b[^>]*(?:\/>|>[\s\S]*?<\/w:p>)\s*<w:tbl>/);
  });

  it('exports row paraIds without writing invalid table or cell w14 identity attrs', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    createTableAdapter(editor, { rows: 2, columns: 2, at: { kind: 'documentEnd' } }, DIRECT_MUTATION_OPTIONS);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];

    expect(documentXml).toBeTruthy();
    expect(documentXml).toMatch(/<w:tr\b[^>]*\bw14:paraId=/);
    expect(documentXml).not.toMatch(/<w:tbl\b[^>]*\bw14:(?:paraId|textId)=/);
    expect(documentXml).not.toMatch(/<w:tc\b[^>]*\bw14:(?:paraId|textId)=/);
  });
});
