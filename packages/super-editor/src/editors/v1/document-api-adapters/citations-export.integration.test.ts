/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import { resolvePublicReferenceBlockNodeId } from './helpers/reference-block-node-id.js';

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

function findBibliographyNode(editor: Editor, nodeId?: string) {
  let found: { attrs: Record<string, unknown> } | null = null;
  let occurrenceIndex = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'bibliography') return true;
    const publicNodeId = resolvePublicReferenceBlockNodeId(node, occurrenceIndex);
    occurrenceIndex += 1;
    if (nodeId !== undefined && node.attrs.sdBlockId !== nodeId && publicNodeId !== nodeId) {
      return true;
    }
    {
      found = { attrs: node.attrs as Record<string, unknown> };
      return false;
    }
  });
  return found;
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

  it('exports Word-recognized citation metadata for the reported source-first workflow', async () => {
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

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
      }),
    );
    expect(bibliographyInsert.success).toBe(true);
    if (!bibliographyInsert.success) return;

    const bibliographyConfigure = await Promise.resolve(
      editor.doc.citations.bibliography.configure({
        target: bibliographyInsert.bibliography,
        style: 'APA',
      }),
    );
    expect(bibliographyConfigure.success).toBe(true);
    if (!bibliographyConfigure.success) return;

    const bibliographyRebuild = await Promise.resolve(
      editor.doc.citations.bibliography.rebuild({
        target: bibliographyInsert.bibliography,
      }),
    );
    expect(bibliographyRebuild.success).toBe(false);
    if (!bibliographyRebuild.success) {
      expect(bibliographyRebuild.failure.code).toBe('NO_OP');
    }

    const exportedFiles = await exportDocxFiles(editor);

    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('w:instrText');
    expect(documentXml).toContain(`CITATION ${sourceId}`);
    expect(documentXml).toContain('w:fldCharType="begin"');
    expect(documentXml).toContain('w:fldCharType="separate"');
    expect(documentXml).toContain('<w:t>(Tester, 2026)</w:t>');
    expect(documentXml).toContain('<w:t>Tester (2026). Citation Export Source. SuperDoc.</w:t>');
    expect(documentXml).toContain('w:fldCharType="end"');

    const documentRelsXml = exportedFiles['word/_rels/document.xml.rels'];
    const customXmlRelationshipMatch = documentRelsXml.match(
      new RegExp(`Type="${escapeRegExp(CUSTOM_XML_RELATIONSHIP_TYPE)}"[^>]*Target="([^"]+)"`),
    );
    expect(customXmlRelationshipMatch?.[1]).toBeTruthy();

    const bibliographyPartPath = normalizeRelationshipTarget(customXmlRelationshipMatch![1]!);
    const bibliographyXml = exportedFiles[bibliographyPartPath];
    expect(bibliographyXml).toContain('<b:Sources');
    expect(bibliographyXml).toContain('SelectedStyle="/APASixthEditionOfficeOnline.xsl"');
    expect(bibliographyXml).toContain('StyleName="APA"');
    expect(bibliographyXml).toContain('Version="6"');
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

  it('persists bibliography style through insert and configure', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const insertResult = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );

    expect(insertResult.success).toBe(true);
    if (!insertResult.success) return;

    const insertedNodeId = insertResult.bibliography.nodeId;
    expect(findBibliographyNode(editor, insertedNodeId)?.attrs.style).toBe('APA');

    const configureResult = await Promise.resolve(
      editor.doc.citations.bibliography.configure({
        target: insertResult.bibliography,
        style: 'MLA',
      }),
    );

    expect(configureResult.success).toBe(true);
    if (!configureResult.success) return;

    const bibliographyInfo = editor.doc.citations.bibliography.get({
      target: configureResult.bibliography,
    });

    expect(bibliographyInfo.style).toBe('MLA');
    expect(bibliographyInfo.address.nodeId).toBe(configureResult.bibliography.nodeId);
    expect(findBibliographyNode(editor)?.attrs.style).toBe('MLA');
  });

  it('exports IEEE cached citation and bibliography text when IEEE style is configured', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const seedInsert = await Promise.resolve(
      editor.doc.insert({
        value: 'IEEE citation host paragraph.',
      }),
    );

    const blockId = resolveInsertedBlockId(seedInsert);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'IEEE',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);
    if (!bibliographyInsert.success) return;

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'IEEE Citation Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);
    if (!sourceInsert.success) return;

    const citationInsert = await Promise.resolve(
      editor.doc.citations.insert({
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: 0, end: 4 } }],
        },
        sourceIds: [sourceInsert.source.sourceId],
      }),
    );
    expect(citationInsert.success).toBe(true);

    const bibliographyRebuild = await Promise.resolve(
      editor.doc.citations.bibliography.rebuild({
        target: bibliographyInsert.bibliography,
      }),
    );
    expect(bibliographyRebuild.success).toBe(false);
    if (!bibliographyRebuild.success) {
      expect(bibliographyRebuild.failure.code).toBe('NO_OP');
    }

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1]</w:t>');
    expect(documentXml).toContain('<w:t>[1] Tester. IEEE Citation Source. SuperDoc, 2026.</w:t>');
    expect(documentXml).not.toContain('<w:t>(Tester, 2026)</w:t>');
    expect(documentXml).not.toContain('<w:t>Tester (2026). IEEE Citation Source. SuperDoc.</w:t>');

    const documentRelsXml = exportedFiles['word/_rels/document.xml.rels'];
    const customXmlRelationshipMatch = documentRelsXml.match(
      new RegExp(`Type="${escapeRegExp(CUSTOM_XML_RELATIONSHIP_TYPE)}"[^>]*Target="([^"]+)"`),
    );
    expect(customXmlRelationshipMatch?.[1]).toBeTruthy();

    const bibliographyXml = exportedFiles[normalizeRelationshipTarget(customXmlRelationshipMatch![1]!)];
    expect(bibliographyXml).toContain('SelectedStyle="/IEEE2006OfficeOnline.xsl"');
    expect(bibliographyXml).toContain('StyleName="IEEE"');
  });

  it('exports multi-source citation field results', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const seedInsert = await Promise.resolve(
      editor.doc.insert({
        value: 'Multi-source citation host.',
      }),
    );
    const blockId = resolveInsertedBlockId(seedInsert);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const firstSource = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'First Multi Source',
          year: '2026',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    const secondSource = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'Second Multi Source',
          year: '1813',
          authors: [
            { first: 'Jane', last: 'Austen' },
            { first: 'Charlotte', last: 'Bronte' },
          ],
        },
      }),
    );
    expect(firstSource.success).toBe(true);
    expect(secondSource.success).toBe(true);
    if (!firstSource.success || !secondSource.success) return;

    const citationInsert = await Promise.resolve(
      editor.doc.citations.insert({
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: 0, end: 12 } }],
        },
        sourceIds: [firstSource.source.sourceId, secondSource.source.sourceId],
      }),
    );
    expect(citationInsert.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain(`CITATION ${firstSource.source.sourceId} \\m ${secondSource.source.sourceId}`);
    expect(documentXml).toContain('<w:t>(Tester, 2026; Austen &amp; Bronte, 1813)</w:t>');
  });

  it('refreshes existing citation display text when inserting an IEEE bibliography', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const seedInsert = await Promise.resolve(
      editor.doc.insert({
        value: 'Deferred IEEE citation host.',
      }),
    );

    const blockId = resolveInsertedBlockId(seedInsert);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'Deferred IEEE Citation Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);
    if (!sourceInsert.success) return;

    const citationInsert = await Promise.resolve(
      editor.doc.citations.insert({
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: 0, end: 8 } }],
        },
        sourceIds: [sourceInsert.source.sourceId],
      }),
    );
    expect(citationInsert.success).toBe(true);

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'IEEE',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1]</w:t>');
    expect(documentXml).toContain('<w:t>[1] Tester. Deferred IEEE Citation Source. SuperDoc, 2026.</w:t>');
    expect(documentXml).not.toContain('<w:t>(Tester, 2026)</w:t>');
    expect(documentXml).not.toContain('<w:t>Tester (2026). Deferred IEEE Citation Source. SuperDoc.</w:t>');
  });

  it('refreshes citation display text after replacing an earlier bibliography', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'Earlier Bibliography Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);
    if (!sourceInsert.success) return;

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentStart' },
        style: 'APA',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);
    if (!bibliographyInsert.success) return;

    const seedInsert = await Promise.resolve(
      editor.doc.insert({
        value: 'Citation after bibliography.',
      }),
    );
    const blockId = resolveInsertedBlockId(seedInsert);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const citationInsert = await Promise.resolve(
      editor.doc.citations.insert({
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: 0, end: 8 } }],
        },
        sourceIds: [sourceInsert.source.sourceId],
      }),
    );
    expect(citationInsert.success).toBe(true);

    const configureResult = await Promise.resolve(
      editor.doc.citations.bibliography.configure({
        target: bibliographyInsert.bibliography,
        style: 'IEEE',
      }),
    );
    expect(configureResult.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1]</w:t>');
    expect(documentXml).not.toContain('<w:t>(Tester, 2026)</w:t>');
  });

  it('reports no-op when rebuilding unchanged multi-entry bibliography content', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const firstSource = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'First No-Op Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    const secondSource = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'Second No-Op Source',
          year: '1813',
          publisher: 'SuperDoc',
          authors: [{ first: 'Jane', last: 'Austen' }],
        },
      }),
    );
    expect(firstSource.success).toBe(true);
    expect(secondSource.success).toBe(true);

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);
    if (!bibliographyInsert.success) return;

    const rebuildResult = await Promise.resolve(
      editor.doc.citations.bibliography.rebuild({
        target: bibliographyInsert.bibliography,
      }),
    );
    expect(rebuildResult.success).toBe(false);
    if (rebuildResult.success) return;
    expect(rebuildResult.failure.code).toBe('NO_OP');
  });

  it('formats inserted IEEE bibliography content with the requested style before rebuild', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'Inserted IEEE Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'IEEE',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1] Tester. Inserted IEEE Source. SuperDoc, 2026.</w:t>');
    expect(documentXml).not.toContain('<w:t>Tester (2026). Inserted IEEE Source. SuperDoc.</w:t>');
  });

  it('refreshes existing citation display text when bibliography style changes', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const seedInsert = await Promise.resolve(
      editor.doc.insert({
        value: 'Style change citation host.',
      }),
    );
    const blockId = resolveInsertedBlockId(seedInsert);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'Style Change Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);
    if (!sourceInsert.success) return;

    const citationInsert = await Promise.resolve(
      editor.doc.citations.insert({
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: 0, end: 5 } }],
        },
        sourceIds: [sourceInsert.source.sourceId],
      }),
    );
    expect(citationInsert.success).toBe(true);

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);
    if (!bibliographyInsert.success) return;

    const configureResult = await Promise.resolve(
      editor.doc.citations.bibliography.configure({
        target: bibliographyInsert.bibliography,
        style: 'IEEE',
      }),
    );
    expect(configureResult.success).toBe(true);

    const bibliographyRebuild = await Promise.resolve(
      editor.doc.citations.bibliography.rebuild({
        target: bibliographyInsert.bibliography,
      }),
    );
    expect(bibliographyRebuild.success).toBe(false);
    if (!bibliographyRebuild.success) {
      expect(bibliographyRebuild.failure.code).toBe('NO_OP');
    }

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1]</w:t>');
    expect(documentXml).not.toContain('<w:t>(Tester, 2026)</w:t>');
  });

  it('refreshes bibliography display text when bibliography style changes before rebuild', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'Configure IEEE Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);
    if (!bibliographyInsert.success) return;

    const configureResult = await Promise.resolve(
      editor.doc.citations.bibliography.configure({
        target: bibliographyInsert.bibliography,
        style: 'IEEE',
      }),
    );
    expect(configureResult.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1] Tester. Configure IEEE Source. SuperDoc, 2026.</w:t>');
    expect(documentXml).not.toContain('<w:t>Tester (2026). Configure IEEE Source. SuperDoc.</w:t>');
  });

  it('keeps multiple bibliography blocks consistent when bibliography style changes', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'Shared Bibliography Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);

    const firstBibliography = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    const secondBibliography = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    expect(firstBibliography.success).toBe(true);
    expect(secondBibliography.success).toBe(true);
    if (!firstBibliography.success || !secondBibliography.success) return;

    const configureResult = await Promise.resolve(
      editor.doc.citations.bibliography.configure({
        target: firstBibliography.bibliography,
        style: 'IEEE',
      }),
    );
    expect(configureResult.success).toBe(true);

    const secondInfo = editor.doc.citations.bibliography.get({
      target: secondBibliography.bibliography,
    });
    expect(secondInfo.style).toBe('IEEE');

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1] Tester. Shared Bibliography Source. SuperDoc, 2026.</w:t>');
    expect(documentXml).not.toContain('<w:t>Tester (2026). Shared Bibliography Source. SuperDoc.</w:t>');
  });

  it('rebuilds a bibliography with its own style when global style changes later', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          refOrder: '1',
          title: 'Rebuild IEEE Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);

    const ieeeBibliography = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'IEEE',
      }),
    );
    expect(ieeeBibliography.success).toBe(true);
    if (!ieeeBibliography.success) return;

    const apaBibliography = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    expect(apaBibliography.success).toBe(true);

    const rebuildResult = await Promise.resolve(
      editor.doc.citations.bibliography.rebuild({
        target: ieeeBibliography.bibliography,
      }),
    );
    expect(rebuildResult.success).toBe(true);

    const secondInfo = editor.doc.citations.bibliography.get({
      target: apaBibliography.success ? apaBibliography.bibliography : ieeeBibliography.bibliography,
    });
    expect(secondInfo.style).toBe('IEEE');

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>[1] Tester. Rebuild IEEE Source. SuperDoc, 2026.</w:t>');
    expect(documentXml).not.toContain('<w:t>Tester (2026). Rebuild IEEE Source. SuperDoc.</w:t>');

    const documentRelsXml = exportedFiles['word/_rels/document.xml.rels'];
    const customXmlRelationshipMatch = documentRelsXml.match(
      new RegExp(`Type="${escapeRegExp(CUSTOM_XML_RELATIONSHIP_TYPE)}"[^>]*Target="([^"]+)"`),
    );
    expect(customXmlRelationshipMatch?.[1]).toBeTruthy();

    const bibliographyXml = exportedFiles[normalizeRelationshipTarget(customXmlRelationshipMatch![1]!)];
    expect(bibliographyXml).toContain('SelectedStyle="/IEEE2006OfficeOnline.xsl"');
    expect(bibliographyXml).toContain('StyleName="IEEE"');
  });

  it('refreshes existing citation display text when source metadata changes', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const seedInsert = await Promise.resolve(
      editor.doc.insert({
        value: 'Source update citation host.',
      }),
    );
    const blockId = resolveInsertedBlockId(seedInsert);
    expect(blockId).toBeTruthy();
    if (!blockId) return;

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'Updated Source Title',
          year: '2026',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);
    if (!sourceInsert.success) return;

    const citationInsert = await Promise.resolve(
      editor.doc.citations.insert({
        at: {
          kind: 'text',
          segments: [{ blockId, range: { start: 0, end: 6 } }],
        },
        sourceIds: [sourceInsert.source.sourceId],
      }),
    );
    expect(citationInsert.success).toBe(true);

    const sourceUpdate = await Promise.resolve(
      editor.doc.citations.sources.update({
        target: sourceInsert.source,
        patch: {
          year: '2027',
          authors: [{ first: 'Riley', last: 'Reviewer' }],
        },
      }),
    );
    expect(sourceUpdate.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>(Reviewer, 2027)</w:t>');
    expect(documentXml).not.toContain('<w:t>(Tester, 2026)</w:t>');
  });

  it('refreshes bibliography display text when source metadata changes before rebuild', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'Original Bibliography Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);
    if (!sourceInsert.success) return;

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);

    const sourceUpdate = await Promise.resolve(
      editor.doc.citations.sources.update({
        target: sourceInsert.source,
        patch: {
          title: 'Updated Bibliography Source',
          year: '2027',
          authors: [{ first: 'Riley', last: 'Reviewer' }],
        },
      }),
    );
    expect(sourceUpdate.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>Reviewer (2027). Updated Bibliography Source. SuperDoc.</w:t>');
    expect(documentXml).not.toContain('<w:t>Tester (2026). Original Bibliography Source. SuperDoc.</w:t>');
  });

  it('refreshes bibliography display text when a source is inserted after bibliography creation', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const bibliographyInsert = await Promise.resolve(
      editor.doc.citations.bibliography.insert({
        at: { kind: 'documentEnd' },
        style: 'APA',
      }),
    );
    expect(bibliographyInsert.success).toBe(true);

    const sourceInsert = await Promise.resolve(
      editor.doc.citations.sources.insert({
        type: 'book',
        fields: {
          title: 'Late Source',
          year: '2026',
          publisher: 'SuperDoc',
          authors: [{ first: 'Ava', last: 'Tester' }],
        },
      }),
    );
    expect(sourceInsert.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('<w:t>Tester (2026). Late Source. SuperDoc.</w:t>');
  });
});
