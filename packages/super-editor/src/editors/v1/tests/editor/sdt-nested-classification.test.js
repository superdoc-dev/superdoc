import { describe, it, expect } from 'vitest';
import { loadTestDataForEditorTests, initTestEditor, getTestDataByFileName } from '@tests/helpers/helpers';
import { getExportedResult } from '@tests/export/export-helpers/export-helpers';

/**
 * Fixture-backed integration coverage for PR #3616 (nested content controls).
 *
 * The architectural claim under test: block/run SDT classification is driven by the
 * TRANSLATED ProseMirror content shape plus import context (path), NOT only by the
 * direct XML child names of w:sdtContent. Each fixture is a real .docx (see
 * tests/data/sdt-*.docx, provenance in tests/data/sdt-fixtures.README.md) so the full
 * import + export pipeline runs, not a mocked translator.
 *
 * For every fixture we assert three things, because "opens without crashing" would
 * miss quiet data loss:
 *   1. XML shape   - the intended OOXML actually exists in word/document.xml.
 *   2. Import      - the imported PM node types are correct and no content is lost.
 *   3. Round-trip  - export still produces the expected w:sdt wrapper / w:sdtPr shape.
 *
 * Scope: this validates the block/run classifier only. Row-level SDTs
 * (w:tbl > w:sdt > w:tr, tracked by SD-3118 / IT-1040) are a separate table-walk
 * concern and are intentionally NOT covered here.
 */

const NESTED_BLOCK = 'sdt-nested-block.docx';
const NESTED_INLINE = 'sdt-nested-inline.docx';
const MIXED_BLOCK = 'sdt-mixed-block.docx';
const INLINE_PICTURE = 'sdt-inline-picture.docx';

// ---- ProseMirror JSON traversal helpers ----
const pmAll = (node, acc = []) => {
  if (!node || typeof node !== 'object') return acc;
  if (node.type) acc.push(node);
  (node.content || []).forEach((c) => pmAll(c, acc));
  return acc;
};
const pmCollect = (node, type) => pmAll(node).filter((n) => n.type === type);
const pmFirst = (node, type) => pmCollect(node, type)[0] || null;
const pmByAlias = (node, alias) => pmAll(node).find((n) => n.attrs?.alias === alias) || null;
const pmText = (node) => {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(pmText).join('');
};
const pmChildTypes = (node) => (node?.content || []).map((c) => c.type);
const BLOCK_TYPES = ['paragraph', 'table', 'structuredContentBlock'];
// Schema invariant: an inline structuredContent must never directly contain a block node.
const assertNoBlockInsideInline = (doc) => {
  pmCollect(doc, 'structuredContent').forEach((sc) => {
    expect(pmChildTypes(sc).some((t) => BLOCK_TYPES.includes(t))).toBe(false);
  });
};

// ---- OOXML JSON traversal helpers (parseXmlToJson / exportSchemaToJson shape) ----
const xmlAll = (node, acc = []) => {
  if (!node || typeof node !== 'object') return acc;
  if (node.name) acc.push(node);
  (node.elements || []).forEach((c) => xmlAll(c, acc));
  return acc;
};
const xmlCollect = (node, name) => xmlAll(node).filter((n) => n.name === name);
const xmlFirst = (node, name) => xmlCollect(node, name)[0] || null;
const xmlDirectChildren = (node, name) => (node?.elements || []).filter((e) => e.name === name);
const xmlText = (node) => {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  return (node.elements || []).map(xmlText).join('');
};
const sdtAlias = (sdt) => {
  const pr = xmlFirst(sdt, 'w:sdtPr');
  return xmlDirectChildren(pr, 'w:alias')[0]?.attributes?.['w:val'];
};
const xmlSdtByAlias = (root, alias) => xmlCollect(root, 'w:sdt').find((sdt) => sdtAlias(sdt) === alias) || null;
const xmlParaContainingSdt = (root) => xmlCollect(root, 'w:p').find((p) => xmlCollect(p, 'w:sdt').length > 0) || null;

// ---- pipeline helpers ----
const importDoc = async (name) => {
  const { docx, media, mediaFiles, fonts } = await loadTestDataForEditorTests(name);
  const { editor } = initTestEditor({ content: docx, media, mediaFiles, fonts });
  return editor.getJSON();
};
const documentXmlOf = async (name) => (await getTestDataByFileName(name))['word/document.xml'];

describe('SDT classification (PR #3616) - nested block content controls', () => {
  it('XML shape: outer w:sdtContent has a direct nested w:sdt and no direct w:p', async () => {
    const docXml = await documentXmlOf(NESTED_BLOCK);
    const outer = xmlSdtByAlias(docXml, 'OuterBlock');
    expect(outer).toBeTruthy();
    const outerContent = xmlFirst(outer, 'w:sdtContent');
    expect(xmlDirectChildren(outerContent, 'w:sdt').length).toBe(1);
    expect(xmlDirectChildren(outerContent, 'w:p').length).toBe(0); // the case the old check missed
    expect(xmlText(xmlSdtByAlias(docXml, 'InnerBlock'))).toContain('Nested block content');
  });

  it('Import: both SDTs classify as block via translated content, content preserved', async () => {
    const doc = await importDoc(NESTED_BLOCK);
    const outer = pmByAlias(doc, 'OuterBlock');
    const inner = pmByAlias(doc, 'InnerBlock');
    expect(outer?.type).toBe('structuredContentBlock');
    expect(inner?.type).toBe('structuredContentBlock');
    expect(pmText(outer)).toContain('Nested block content');
    assertNoBlockInsideInline(doc);
  });

  it('Round-trip: nested w:sdt wrappers and sdtPr survive export', async () => {
    const exported = await getExportedResult(NESTED_BLOCK);
    const outer = xmlSdtByAlias(exported, 'OuterBlock');
    expect(outer).toBeTruthy();
    expect(xmlFirst(outer, 'w:sdtPr')).toBeTruthy();
    expect(xmlSdtByAlias(exported, 'InnerBlock')).toBeTruthy();
    expect(xmlText(exported)).toContain('Nested block content');
  });
});

describe('SDT classification (PR #3616) - nested inline content controls', () => {
  it('XML shape: nested inline w:sdt lives inside a w:p', async () => {
    const docXml = await documentXmlOf(NESTED_INLINE);
    expect(xmlParaContainingSdt(docXml)).toBeTruthy();
    expect(xmlSdtByAlias(docXml, 'OuterInline')).toBeTruthy();
    expect(xmlSdtByAlias(docXml, 'InnerInline')).toBeTruthy();
  });

  it('Import: inline SDTs stay inline (path gate does not force block)', async () => {
    const doc = await importDoc(NESTED_INLINE);
    expect(pmByAlias(doc, 'OuterInline')?.type).toBe('structuredContent');
    expect(pmByAlias(doc, 'InnerInline')?.type).toBe('structuredContent');
    expect(pmCollect(doc, 'structuredContentBlock').length).toBe(0); // nothing promoted to block
    const text = pmText(doc);
    expect(text).toContain('Before');
    expect(text).toContain('outer');
    expect(text).toContain('inner');
    expect(text).toContain('after');
    assertNoBlockInsideInline(doc);
  });

  it('Round-trip: inline w:sdt stays inside the paragraph on export', async () => {
    const exported = await getExportedResult(NESTED_INLINE);
    expect(xmlParaContainingSdt(exported)).toBeTruthy();
    expect(xmlSdtByAlias(exported, 'OuterInline')).toBeTruthy();
    expect(xmlSdtByAlias(exported, 'InnerInline')).toBeTruthy();
    expect(xmlText(exported)).toContain('inner');
  });
});

describe('SDT classification (PR #3616) - mixed block content control', () => {
  it('XML shape: block w:sdtContent mixes a bare inline w:sdt, a w:p, and a w:tbl', async () => {
    const docXml = await documentXmlOf(MIXED_BLOCK);
    const outerContent = xmlFirst(xmlSdtByAlias(docXml, 'MixedBlock'), 'w:sdtContent');
    expect(xmlDirectChildren(outerContent, 'w:sdt').length).toBe(1);
    expect(xmlDirectChildren(outerContent, 'w:p').length).toBe(1);
    expect(xmlDirectChildren(outerContent, 'w:tbl').length).toBe(1);
  });

  it('Import: bare inline SDT is wrapped into a paragraph; paragraph and table preserved', async () => {
    const doc = await importDoc(MIXED_BLOCK);
    const outer = pmByAlias(doc, 'MixedBlock');
    expect(outer?.type).toBe('structuredContentBlock');

    const childTypes = pmChildTypes(outer);
    expect(childTypes).not.toContain('structuredContent'); // inline child must be wrapped, never a direct block child
    expect(childTypes.filter((t) => t === 'paragraph').length).toBeGreaterThanOrEqual(2);
    expect(childTypes).toContain('table');

    const wrappedInline = pmByAlias(outer, 'InlineInMixed');
    expect(wrappedInline?.type).toBe('structuredContent');
    expect(pmText(wrappedInline)).toContain('inline sdt');
    expect(pmText(outer)).toContain('A paragraph');
    expect(pmText(outer)).toContain('Cell');
    assertNoBlockInsideInline(doc);
  });

  it('Round-trip: paragraph, table, and inline SDT content all survive export', async () => {
    const exported = await getExportedResult(MIXED_BLOCK);
    expect(xmlSdtByAlias(exported, 'MixedBlock')).toBeTruthy();
    expect(xmlFirst(exported, 'w:tbl')).toBeTruthy();
    const text = xmlText(exported);
    expect(text).toContain('A paragraph');
    expect(text).toContain('Cell');
    expect(text).toContain('inline sdt');
  });
});

describe('SDT classification (PR #3616) - inline picture content control', () => {
  it('XML shape: inline w:sdt has a w:picture marker and a w:drawing in its content', async () => {
    const docXml = await documentXmlOf(INLINE_PICTURE);
    const pic = xmlSdtByAlias(docXml, 'PictureControl');
    expect(xmlDirectChildren(xmlFirst(pic, 'w:sdtPr'), 'w:picture').length).toBe(1);
    expect(xmlFirst(pic, 'w:drawing')).toBeTruthy();
  });

  it('Import: image classifies inline; picture marker is not modeled but sdtPr is kept', async () => {
    const doc = await importDoc(INLINE_PICTURE);
    const pic = pmByAlias(doc, 'PictureControl');
    expect(pic?.type).toBe('structuredContent'); // inline, not block
    expect(pmFirst(pic, 'image')).toBeTruthy(); // image preserved as inline content
    expect(pic?.attrs?.controlType).not.toBe('picture'); // picture marker not modeled semantically
    expect(pic?.attrs?.controlType ?? null).toBeNull();
    expect(pic?.attrs?.sdtPr).toBeTruthy(); // raw sdtPr retained for round-trip
    expect(pmCollect(doc, 'structuredContentBlock').length).toBe(0);
    assertNoBlockInsideInline(doc);
  });

  it('Round-trip: w:picture marker round-trips raw via sdtPr and the drawing survives', async () => {
    const exported = await getExportedResult(INLINE_PICTURE);
    const pic = xmlSdtByAlias(exported, 'PictureControl');
    expect(pic).toBeTruthy();
    expect(xmlDirectChildren(xmlFirst(pic, 'w:sdtPr'), 'w:picture').length).toBe(1);
    expect(xmlFirst(pic, 'w:drawing')).toBeTruthy();
  });
});
