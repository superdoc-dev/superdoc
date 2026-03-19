/* @vitest-environment jsdom */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initTestEditor, loadTestDataForEditorTests } from '@tests/helpers/helpers.js';
import DocxZipper from '@core/DocxZipper.js';
import type { Editor } from '../core/Editor.js';
import {
  createSectionBreakAdapter,
  sectionsClearHeaderFooterRefAdapter,
  sectionsSetHeaderFooterRefAdapter,
  sectionsSetLinkToPreviousAdapter,
  sectionsSetOddEvenHeadersFootersAdapter,
  sectionsSetPageSetupAdapter,
} from './sections-adapter.js';
import { resolveSectionProjections } from './helpers/sections-resolver.js';
import { registerPartDescriptor, clearPartDescriptors } from '../core/parts/registry/part-registry.js';
import { settingsPartDescriptor } from '../core/parts/adapters/settings-part-descriptor.js';
import { clearInvalidationHandlers } from '../core/parts/invalidation/part-invalidation-registry.js';

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

  beforeEach(() => {
    registerPartDescriptor(settingsPartDescriptor);
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    clearPartDescriptors();
    clearInvalidationHandlers();
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

  it('applies landscape orientation as landscape page dimensions in exported document.xml', async () => {
    ({ editor } = initTestEditor({
      content: docData.docx,
      media: docData.media,
      mediaFiles: docData.mediaFiles,
      fonts: docData.fonts,
      useImmediateSetTimeout: false,
    }));

    const targetSection = getSectionAddressByIndex(editor, 0);
    const result = sectionsSetPageSetupAdapter(
      editor,
      { target: targetSection, orientation: 'landscape' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(result.success).toBe(true);

    const section = resolveSectionProjections(editor).find((entry) => entry.range.sectionIndex === 0);
    expect(section?.domain.pageSetup?.orientation).toBe('landscape');
    expect(section?.domain.pageSetup?.width).toBeGreaterThan(
      section?.domain.pageSetup?.height ?? Number.POSITIVE_INFINITY,
    );

    const exportedFiles = await exportDocxFiles(editor);
    const documentXml = exportedFiles['word/document.xml'];
    expect(documentXml).toContain('w:orient="landscape"');
    expect(documentXml).toContain('w:w="15840"');
    expect(documentXml).toContain('w:h="12240"');
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

/**
 * SD-2137 regression suite: clearing header/footer refs must survive export.
 *
 * The h_f-normal.docx fixture has section-0 with:
 *   headerRefs: { even: rId7, default: rId8 }
 *   footerRefs: { even: rId9, default: rId10 }
 *
 * The exporter has a fallback (exporter.js ~L267) that re-injects a default
 * header/footer reference when the sectPr has *no* headerReference elements
 * and converter.headerIds.default is still truthy.  That fallback must NOT
 * fire after an explicit clearHeaderFooterRef mutation.
 */
describe('SD-2137: clearHeaderFooterRef must remove refs from exported DOCX', () => {
  let hfDocData: LoadedDocData;
  let editor: Editor | undefined;

  beforeAll(async () => {
    hfDocData = await loadTestDataForEditorTests('h_f-normal.docx');
  });

  beforeEach(() => {
    registerPartDescriptor(settingsPartDescriptor);
  });

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
    clearPartDescriptors();
    clearInvalidationHandlers();
  });

  function createEditor(): Editor {
    const result = initTestEditor({
      content: hfDocData.docx,
      media: hfDocData.media,
      mediaFiles: hfDocData.mediaFiles,
      fonts: hfDocData.fonts,
      useImmediateSetTimeout: false,
    });
    editor = result.editor;
    return editor;
  }

  it('clearing the only remaining header/default ref removes it from exported document.xml', async () => {
    const ed = createEditor();
    const section0 = getSectionAddressByIndex(ed, 0);

    // Verify initial state: section-0 has both even + default header refs.
    const beforeDomain = resolveSectionProjections(ed).find((s) => s.range.sectionIndex === 0)!.domain;
    expect(beforeDomain.headerRefs?.default).toBeTruthy();
    expect(beforeDomain.headerRefs?.even).toBeTruthy();

    // Remove the even header first, leaving header/default as the sole ref.
    const clearEven = sectionsClearHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'header', variant: 'even' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearEven.success).toBe(true);

    // Now clear header/default — this is the SD-2137 operation.
    const clearDefault = sectionsClearHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'header', variant: 'default' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearDefault.success).toBe(true);

    // Verify the domain reports no header refs.
    const afterDomain = resolveSectionProjections(ed).find((s) => s.range.sectionIndex === 0)!.domain;
    expect(afterDomain.headerRefs?.default).toBeUndefined();

    // Export and verify no w:headerReference of any type in the body sectPr.
    const exported = await exportDocxFiles(ed);
    const documentXml = exported['word/document.xml'];
    expect(documentXml).not.toContain('w:headerReference');
  });

  it('clearing footer/default preserves footer/even in exported document.xml', async () => {
    const ed = createEditor();
    const section0 = getSectionAddressByIndex(ed, 0);

    // Verify initial state: section-0 has both even + default footer refs.
    const beforeDomain = resolveSectionProjections(ed).find((s) => s.range.sectionIndex === 0)!.domain;
    expect(beforeDomain.footerRefs?.default).toBeTruthy();
    expect(beforeDomain.footerRefs?.even).toBeTruthy();
    const evenFooterRefId = beforeDomain.footerRefs!.even!;

    // Clear footer/default — even should survive.
    const clearResult = sectionsClearHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'footer', variant: 'default' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearResult.success).toBe(true);

    // Export and verify footer/default is gone but footer/even remains.
    const exported = await exportDocxFiles(ed);
    const documentXml = exported['word/document.xml'];
    expect(documentXml).not.toMatch(/w:footerReference[^>]*w:type="default"/);
    expect(documentXml).toContain(`r:id="${evenFooterRefId}"`);
  });

  it('exact SD-2137 repro: clear header/default + footer/default with only footer/even surviving', async () => {
    const ed = createEditor();
    const section0 = getSectionAddressByIndex(ed, 0);

    // Shape the fixture to match the bug report: headerRefs={default}, footerRefs={default, even}.
    // h_f-normal.docx starts with headerRefs={even, default} — remove even header first.
    const clearEvenHeader = sectionsClearHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'header', variant: 'even' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearEvenHeader.success).toBe(true);

    const beforeDomain = resolveSectionProjections(ed).find((s) => s.range.sectionIndex === 0)!.domain;
    expect(beforeDomain.headerRefs?.default).toBeTruthy();
    expect(beforeDomain.headerRefs?.even).toBeUndefined();
    expect(beforeDomain.footerRefs?.default).toBeTruthy();
    expect(beforeDomain.footerRefs?.even).toBeTruthy();
    const evenFooterRefId = beforeDomain.footerRefs!.even!;

    // Run the exact SD-2137 operations: clear header/default, then footer/default.
    const clearHeaderDefault = sectionsClearHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'header', variant: 'default' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearHeaderDefault.success).toBe(true);

    const clearFooterDefault = sectionsClearHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'footer', variant: 'default' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearFooterDefault.success).toBe(true);

    // Export and verify:
    //   - No header references of any type.
    //   - No footer/default, but footer/even survives.
    const exported = await exportDocxFiles(ed);
    const documentXml = exported['word/document.xml'];
    expect(documentXml).not.toContain('w:headerReference');
    expect(documentXml).not.toMatch(/w:footerReference[^>]*w:type="default"/);
    expect(documentXml).toMatch(/w:footerReference[^>]*w:type="even"/);
    expect(documentXml).toContain(`r:id="${evenFooterRefId}"`);
  });

  it('clearing header/default on a paragraph-owned sectPr (non-final section) removes it from export', async () => {
    const ed = createEditor();

    // Create a section break so section-0 gets a paragraph-owned sectPr.
    const breakResult = createSectionBreakAdapter(
      ed,
      { at: { kind: 'documentEnd' }, breakType: 'nextPage' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(breakResult.success).toBe(true);

    // Section breaks don't propagate header/footer refs. The body section
    // (now section-1) retains the original refs — borrow one for section-0.
    const headerRefId = resolveSectionProjections(ed).find((s) => s.range.sectionIndex === 1)?.domain.headerRefs
      ?.default;
    expect(headerRefId).toBeTruthy();

    const section0 = getSectionAddressByIndex(ed, 0);
    const setResult = sectionsSetHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'header', variant: 'default', refId: headerRefId! },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(setResult.success).toBe(true);

    // Now clear header/default on the paragraph-owned section.
    const clearResult = sectionsClearHeaderFooterRefAdapter(
      ed,
      { target: section0, kind: 'header', variant: 'default' },
      DIRECT_MUTATION_OPTIONS,
    );
    expect(clearResult.success).toBe(true);

    // The paragraph-owned sectPr export path has no fallback injection,
    // so clearing should always work. Verify via export.
    const exported = await exportDocxFiles(ed);
    const documentXml = exported['word/document.xml'];

    // Extract all sectPr blocks from the XML.
    const sectPrBlocks = documentXml.match(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g) ?? [];
    expect(sectPrBlocks.length).toBeGreaterThanOrEqual(2);

    // The first sectPr (paragraph-owned, section-0) should have no header/default.
    const paragraphSectPr = sectPrBlocks[0]!;
    expect(paragraphSectPr).not.toMatch(/w:headerReference[^>]*w:type="default"/);
  });
});
