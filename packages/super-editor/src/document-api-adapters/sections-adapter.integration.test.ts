/* @vitest-environment jsdom */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import {
  createSectionBreakAdapter,
  sectionsClearHeaderFooterRefAdapter,
  sectionsSetHeaderFooterRefAdapter,
  sectionsSetLinkToPreviousAdapter,
  sectionsSetOddEvenHeadersFootersAdapter,
} from './sections-adapter.js';
import { resolveSectionProjections } from './helpers/sections-resolver.js';

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

function getSectionAddressByIndex(editor: Editor, index: number): { kind: 'section'; sectionId: string } {
  const section = resolveSectionProjections(editor).find((entry) => entry.range.sectionIndex === index);
  if (!section) {
    throw new Error(`Expected section index ${index} to exist.`);
  }
  return section.address;
}

describe('sections adapter DOCX integration', () => {
  let docData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    docData = await loadTestDataForEditorTests('blank-doc.docx');
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  it('persists odd/even header-footer settings to word/settings.xml', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const enableResult = sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: true }, DIRECT_MUTATION_OPTIONS);
    expect(enableResult.success).toBe(true);

    let exportedFiles = await exportDocxFiles(editor);
    expect(exportedFiles['word/settings.xml']).toContain('w:evenAndOddHeaders');

    const disableResult = sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: false }, DIRECT_MUTATION_OPTIONS);
    expect(disableResult.success).toBe(true);

    exportedFiles = await exportDocxFiles(editor);
    expect(exportedFiles['word/settings.xml']).not.toContain('w:evenAndOddHeaders');
  });

  it('creates explicit header parts/relationships when unlinking without inherited refs', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sectionBreakResult = createSectionBreakAdapter(
      editor,
      { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(sectionBreakResult.success).toBe(true);

    const targetSection = getSectionAddressByIndex(editor, 1);
    const unlinkResult = sectionsSetLinkToPreviousAdapter(
      editor,
      {
        target: targetSection,
        kind: 'header',
        variant: 'default',
        linked: false,
      },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(unlinkResult.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    const documentRelsXml = exportedFiles['word/_rels/document.xml.rels'];
    const headerRefMatch = documentXml.match(/<w:headerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"/);
    const newHeaderRefId = headerRefMatch?.[1];

    expect(typeof newHeaderRefId).toBe('string');

    expect(documentXml).toContain('w:headerReference');
    expect(documentXml).toContain(`r:id="${newHeaderRefId}"`);
    expect(documentRelsXml).toContain(`Id="${newHeaderRefId}"`);
    expect(documentRelsXml).toContain('/relationships/header');

    const relationshipMatch = documentRelsXml.match(new RegExp(`Id="${newHeaderRefId}"[^>]*Target="([^"]+)"`));
    expect(relationshipMatch?.[1]).toBeTruthy();

    const relationshipTarget = relationshipMatch![1]!;
    const headerPartPath = relationshipTarget.startsWith('word/') ? relationshipTarget : `word/${relationshipTarget}`;
    expect(exportedFiles[headerPartPath]).toContain('<w:hdr');
  });

  it('applies and clears explicit header/footer references in document.xml', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const createBreak = createSectionBreakAdapter(
      editor,
      { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(createBreak.success).toBe(true);

    const generatedSourceSection = getSectionAddressByIndex(editor, 1);
    const unlinkResult = sectionsSetLinkToPreviousAdapter(
      editor,
      {
        target: generatedSourceSection,
        kind: 'footer',
        variant: 'default',
        linked: false,
      },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(unlinkResult.success).toBe(true);

    const generatedFooterRefId = resolveSectionProjections(editor).find((entry) => entry.range.sectionIndex === 1)
      ?.domain.footerRefs?.default;
    expect(generatedFooterRefId).toBeTruthy();

    const targetSection = getSectionAddressByIndex(editor, 0);

    const setResult = sectionsSetHeaderFooterRefAdapter(
      editor,
      {
        target: targetSection,
        kind: 'footer',
        variant: 'default',
        refId: generatedFooterRefId!,
      },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(setResult.success).toBe(true);

    const converterBodySectPr = JSON.stringify(
      (editor as unknown as { converter?: { bodySectPr?: unknown } }).converter?.bodySectPr,
    );
    expect(converterBodySectPr).toContain(generatedFooterRefId!);

    const clearResult = sectionsClearHeaderFooterRefAdapter(
      editor,
      {
        target: targetSection,
        kind: 'footer',
        variant: 'default',
      },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearResult.success).toBe(true);

    const exportedFiles = await exportDocxFiles(editor);
    const refIdMatches = exportedFiles['word/document.xml'].match(new RegExp(`r:id="${generatedFooterRefId!}"`, 'g'));
    expect(refIdMatches?.length ?? 0).toBe(1);
  });

  it('dry-run setLinkToPrevious does not allocate header/footer parts or relationships', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const sectionBreakResult = createSectionBreakAdapter(
      editor,
      { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(sectionBreakResult.success).toBe(true);

    const converter = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter!;
    const xmlKeysBefore = Object.keys(converter.convertedXml ?? {}).sort();
    const relsBefore = JSON.stringify(converter.convertedXml?.['word/_rels/document.xml.rels']);

    const targetSection = getSectionAddressByIndex(editor, 1);
    const dryRunResult = sectionsSetLinkToPreviousAdapter(
      editor,
      {
        target: targetSection,
        kind: 'header',
        variant: 'default',
        linked: false,
      },
      { ...DIRECT_MUTATION_OPTIONS, dryRun: true },
    );
    expect(dryRunResult.success).toBe(true);

    // Converter state must be untouched — no new parts, no new relationships.
    const xmlKeysAfter = Object.keys(converter.convertedXml ?? {}).sort();
    const relsAfter = JSON.stringify(converter.convertedXml?.['word/_rels/document.xml.rels']);
    expect(xmlKeysAfter).toEqual(xmlKeysBefore);
    expect(relsAfter).toEqual(relsBefore);
  });

  it('dry-run setOddEvenHeadersFooters does not create word/settings.xml when absent', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const converter = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter!;

    // Remove word/settings.xml if it exists so we can verify it is not re-created.
    if (converter.convertedXml) {
      delete converter.convertedXml['word/settings.xml'];
    }

    const dryRunResult = sectionsSetOddEvenHeadersFootersAdapter(
      editor,
      { enabled: true },
      { ...DIRECT_MUTATION_OPTIONS, dryRun: true },
    );
    expect(dryRunResult.success).toBe(true);

    // settings.xml must NOT have been created during dry-run.
    expect(converter.convertedXml?.['word/settings.xml']).toBeUndefined();
  });

  it('NO_OP setOddEvenHeadersFooters does not create word/settings.xml when absent', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const converter = (editor as unknown as { converter?: { convertedXml?: Record<string, unknown> } }).converter!;

    // Remove word/settings.xml so the NO_OP path (enabled: false when already false) is tested.
    if (converter.convertedXml) {
      delete converter.convertedXml['word/settings.xml'];
    }

    // Odd/even is already false (absent), requesting false → NO_OP.
    const noOpResult = sectionsSetOddEvenHeadersFootersAdapter(editor, { enabled: false }, DIRECT_MUTATION_OPTIONS);
    expect(noOpResult.success).toBe(false);
    if (!noOpResult.success) {
      expect(noOpResult.failure.code).toBe('NO_OP');
    }

    // settings.xml must NOT have been created for a NO_OP.
    expect(converter.convertedXml?.['word/settings.xml']).toBeUndefined();
  });

  it('rejects header/footer refs that are missing from document relationships', () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const targetSection = getSectionAddressByIndex(editor, 0);
    const setResult = sectionsSetHeaderFooterRefAdapter(
      editor,
      {
        target: targetSection,
        kind: 'header',
        variant: 'default',
        refId: 'rIdMissingRelationship',
      },
      DIRECT_MUTATION_OPTIONS,
    );

    expect(setResult.success).toBe(false);
    if (!setResult.success) {
      expect(setResult.failure.code).toBe('INVALID_TARGET');
    }
  });
});
