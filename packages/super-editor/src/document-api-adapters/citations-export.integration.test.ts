/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';

type LoadedDocData = Awaited<ReturnType<typeof loadTestDataForEditorTests>>;

const CUSTOM_XML_RELATIONSHIP_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml';

function mapExportedFiles(files: Array<{ name: string; content: string }>): Record<string, string> {
  const byName: Record<string, string> = {};
  for (const file of files) {
    byName[file.name] = file.content;
  }
  return byName;
}

function normalizeRelationshipTarget(target: string): string {
  if (target.startsWith('../')) return target.slice(3);
  if (target.startsWith('./')) return target.slice(2);
  if (target.startsWith('/')) return target.slice(1);
  return target;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveInsertedBlockId(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== 'object') return null;

  const value = receipt as {
    target?: { blockId?: unknown };
    resolution?: {
      target?: { blockId?: unknown };
    };
  };

  if (typeof value.target?.blockId === 'string' && value.target.blockId.length > 0) {
    return value.target.blockId;
  }

  if (typeof value.resolution?.target?.blockId === 'string' && value.resolution.target.blockId.length > 0) {
    return value.resolution.target.blockId;
  }

  return null;
}

async function exportDocxFiles(editor: Editor): Promise<Record<string, string>> {
  const zipper = new DocxZipper();
  const exportedBuffer = await editor.exportDocx();
  const exportedFiles = await zipper.getDocxData(exportedBuffer, true);
  return mapExportedFiles(exportedFiles);
}

describe('citations export integration', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('exports citation fields and bibliography customXml sources after citations API inserts', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const seedInsert = await Promise.resolve(
      editor.doc.insert({
        value: 'Citation host paragraph for export validation.',
      }),
    );

    const blockId = resolveInsertedBlockId(seedInsert);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'Citation Export Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );

    expect(sourceInsert.success).toBe(true);
    if (!sourceInsert.success) return;

    const sourceId = sourceInsert.source.sourceId;
    expect(sourceId).toMatch(/^source-/);

    const citationInsert = await Promise.resolve(
      editor.doc.citations.insert({
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: 0, end: 8 } }],
        },
        sourceIds: [sourceId],
      }),
    );

    expect(citationInsert.success).toBe(true);
    if (!citationInsert.success) return;

    const exportedFiles = await exportDocxFiles(editor);

    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('w:instrText');
    expect(documentXml).toContain(`CITATION ${sourceId}`);
    expect(documentXml).toContain('w:fldCharType="begin"');
    expect(documentXml).toContain('w:fldCharType="separate"');
    expect(documentXml).toContain('w:fldCharType="end"');

    const documentRelsXml = exportedFiles['word/_rels/document.xml.rels'];
    const customXmlRelationshipMatch = documentRelsXml.match(
      new RegExp(`Type="${escapeRegExp(CUSTOM_XML_RELATIONSHIP_TYPE)}"[^>]*Target="([^"]+)"`),
    );
    expect(customXmlRelationshipMatch?.[1]).toBeTruthy();

    const bibliographyPartPath = normalizeRelationshipTarget(customXmlRelationshipMatch![1]!);
    const bibliographyXml = exportedFiles[bibliographyPartPath];
    expect(bibliographyXml).toContain('<b:Sources');
    expect(bibliographyXml).toContain(`<b:Tag>${sourceId}</b:Tag>`);
    expect(bibliographyXml).toContain('<b:SourceType>Book</b:SourceType>');
    expect(bibliographyXml).toContain('<b:Title>Citation Export Source</b:Title>');

    const itemIndexMatch = bibliographyPartPath.match(/customXml\/item(\d+)\.xml$/);
    expect(itemIndexMatch?.[1]).toBeTruthy();

    const itemIndex = itemIndexMatch![1]!;
    const itemRelsPath = `customXml/_rels/item${itemIndex}.xml.rels`;
    const itemPropsPath = `customXml/itemProps${itemIndex}.xml`;

    expect(exportedFiles[itemRelsPath]).toContain(`Target="itemProps${itemIndex}.xml"`);
    expect(exportedFiles[itemRelsPath]).toContain('customXmlProps');
    expect(exportedFiles[itemPropsPath]).toContain('officeDocument/2006/bibliography');

    const contentTypesXml = exportedFiles['[Content_Types].xml'];
    expect(contentTypesXml).toContain(`/customXml/itemProps${itemIndex}.xml`);
    expect(contentTypesXml).toContain('customXmlProperties+xml');
  });
});
